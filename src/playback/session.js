// Session de lecture (portage de playback/session.py) : colle entre la file
// pure (core/queue.js), le moteur audio (player.js) et les appels réseau qui
// accompagnent la lecture (compteur local, Last.fm, historique d'accueil).
//
// La file survit à la fermeture : enregistrée à chaque changement, rechargée
// au démarrage EN PAUSE à sa position exacte (l'utilisateur appuie sur
// lecture pour repartir).
//
// Mix dynamique : une piste du mix écoutée jusqu'au bout est signalée au
// serveur, qui la retire et recomplète la liste ; la file suit. Les pistes
// passées à la main le sont aussi, une fois la 5e atteinte.

import * as dynamicMix from '../core/dynamicMix.js';
import { Queue, queueItem } from '../core/queue.js';
import { replayGainFactor } from '../core/replayGain.js';
import { ScrobbleTracker } from '../core/scrobble.js';
import { FADE_SECONDS, fadeFactor as sleepFade } from '../core/sleepTimer.js';
import * as transitionFade from '../core/transitionFade.js';

const SEEK_RETRY_MS = 100;
const SEEK_ATTEMPTS = 50;

// Les appels réseau qui accompagnent la lecture sont best-effort : un échec
// ne doit jamais interrompre la musique.
const quietly = (promise) => promise?.catch?.(() => {});

function itemFromTrack(track, { albumTitle, artistName, streamUrl, coverUrl, albumId }) {
  return queueItem({
    trackId: track.id,
    title: track.title,
    artistName,
    albumTitle,
    coverUrl,
    isFavorite: track.isFavorite,
    streamUrl,
    albumId: albumId ?? (track.albumId || null),
    trackNumber: track.position || null,
    duration: track.duration ?? null,
    replayGain: track.replayGain ?? null,
  });
}

export class PlaybackSession {
  constructor({
    getClient, player, stateStore = null,
    setTimeout: later = (fn, ms) => globalThis.setTimeout(fn, ms),
    clearTimeout: cancel = (id) => globalThis.clearTimeout(id),
    now = () => Date.now(),
    queueOptions,
  }) {
    this._getClient = getClient;
    this._player = player;
    this._stateStore = stateStore;
    this._later = later;
    this._cancel = cancel;
    this._now = now;
    this._queueOptions = queueOptions;
    this._queue = new Queue(queueOptions);
    this._scrobbler = new ScrobbleTracker();

    player.onPosition = (position, duration) => this._onPosition(position, duration);
    player.onTrackEnded = () => this._onTrackEnded();
    player.onStreamStarted = () => this._onStreamStarted();
    player.onAboutToFinish = () => this._onAboutToFinish();
    player.onError = (message) => this._onError(message);
    player.onStateChanged = () => this._publish();

    this._listeners = new Set();
    this._mixListeners = new Set();
    this._mixTrimming = false;
    this._lastError = null;
    // Posé quand le moteur a reçu l'URL suivante : le onStreamStarted qui
    // suit fait avancer la file sans recharger.
    this._pendingGapless = 0;
    this._sourceName = null;
    this._sourceType = null;
    this._sourceId = null;
    // File restaurée chargée en pause : rien n'est signalé au serveur tant
    // que l'utilisateur n'a pas appuyé sur lecture.
    this._resumePending = false;
    this._resumePosition = 0;
    this._loadGeneration = 0;
    this._restoring = false;
    this._sleepMode = null;
    this._sleepDeadline = 0;
    this._sleepTimer = null;
    this._transitionFade = 0;
    this._replayGain = 'off';
  }

  get isPlaying() { return this._player.isPlaying; }

  get hasItem() { return this._queue.state().hasItem; }

  // ── Démarrage d'une lecture ────────────────────────────────────────────────

  // Pistes jouables de l'album, à partir de startTrackId (ou la première).
  playAlbum(album, startTrackId) {
    const client = this._getClient();
    if (!client) return;
    const playable = album.tracks.filter((t) => t.hasFile);
    if (!playable.length) return;
    const items = this._albumItems(client, album, playable);
    const start = Math.max(0, playable.findIndex((t) => t.id === startTrackId));
    this._sourceName = null;
    this._setSource('album', album.id);
    this._queue.load(items, start);
    this._startCurrent(client);
    this._reportPlayStarted('album', album.id);
  }

  // Pistes au format QueueTrack (playlists, listes intelligentes, radio,
  // recherche). reportPlaylistId ou reportSmartKey alimente les récents de
  // l'accueil ; sourceName est le nom affiché dans les lecteurs ;
  // startPosition reprend la première piste à cet endroit.
  playQueueTracks(tracks, { startIndex = 0, reportPlaylistId = null, reportSmartKey = null, sourceName = null, startPosition = 0 } = {}) {
    const client = this._getClient();
    if (!client) return;
    const playable = tracks.filter((t) => t.hasFile);
    if (!playable.length) return;
    this._sourceName = sourceName;
    if (reportPlaylistId != null) this._setSource('playlist', reportPlaylistId);
    else if (reportSmartKey != null) this._setSource('smart', reportSmartKey);
    else this._setSource(null, null);
    this._queue.load(this._itemsFor(client, playable), startIndex);
    this._startCurrent(client);
    if (startPosition > 0) this._pendingSeek(startPosition);
    if (reportPlaylistId != null) this._reportPlayStarted('playlist', reportPlaylistId);
    else if (reportSmartKey != null) this._reportPlayStarted('smart', reportSmartKey);
  }

  // Des pistes ont quitté la source de la file (playlist, liste
  // intelligente) : elles quittent aussi la file. Sans effet si la file vient
  // d'ailleurs ; si c'est la piste en cours, on passe à la suivante.
  removeSourceTracks(sourceType, sourceRef, trackIds) {
    if (sourceType !== this._sourceType || String(sourceRef) !== this._sourceId) return;
    let state = this._queue.state();
    const present = new Set(state.items.map((i) => i.trackId));
    const gone = [...new Set(trackIds)].filter((id) => present.has(id));
    if (!state.hasItem || !gone.length) return;
    const currentId = state.current.trackId;
    for (const id of gone) state = this._queue.remove(id);
    if (gone.includes(currentId)) {
      this._loadFromState(state);
      return;
    }
    this._publish(state);
    this._saveState();
  }

  // ── Lire ensuite / ajouter à la file / réordonner ─────────────────────────

  enqueueTracks(tracks, { playNext = false } = {}) {
    const client = this._getClient();
    if (!client) return;
    const playable = tracks.filter((t) => t.hasFile);
    if (playable.length) this._enqueue(client, this._itemsFor(client, playable), playNext);
  }

  // Depuis une fiche album : l'album entier, ou la seule piste trackId.
  enqueueAlbum(album, { trackId = null, playNext = false } = {}) {
    const client = this._getClient();
    if (!client) return;
    const playable = album.tracks.filter((t) => t.hasFile && (trackId == null || t.id === trackId));
    if (playable.length) this._enqueue(client, this._albumItems(client, album, playable), playNext);
  }

  _enqueue(client, items, playNext) {
    const before = this._queue.state();
    if (!before.hasItem && !before.items.length) {
      this._sourceName = null;
      this._setSource(null, null);
      this._queue.load(items);
      this._startCurrent(client);
      return;
    }
    const state = playNext ? this._queue.insertNext(items) : this._queue.append(items);
    if (before.current === null && state.current !== null) {
      // File épuisée relancée par l'ajout : la nouvelle courante joue.
      this._loadFromState(state);
      return;
    }
    this._publish(state);
    this._saveState();
  }

  moveInQueue(fromIndex, toIndex) {
    this._publish(this._queue.move(fromIndex, toIndex));
    this._saveState();
  }

  removeFromQueue(index) {
    const before = this._queue.state();
    if (index < 0 || index >= before.items.length) return;
    const wasCurrent = index === before.currentIndex;
    const state = this._queue.removeAt(index);
    if (wasCurrent) {
      this._loadFromState(state);
      return;
    }
    this._publish(state);
    this._saveState();
  }

  // ── Minuteur de sommeil ────────────────────────────────────────────────────

  // null : désactive. Un entier : pause dans autant de minutes, fondu sur les
  // dernières secondes. 'track' : pause à la fin de la piste en cours.
  setSleepTimer(mode) {
    if (this._sleepTimer !== null) {
      this._cancel(this._sleepTimer);
      this._sleepTimer = null;
    }
    this._player.setFade(1);
    if (mode == null) {
      this._sleepMode = null;
    } else if (mode === 'track') {
      this._sleepMode = 'track';
    } else {
      const seconds = Number(mode) * 60;
      this._sleepMode = 'timer';
      this._sleepDeadline = this._now() + seconds * 1000;
      this._sleepTimer = this._later(() => this._onSleepTick(), Math.max(0, seconds - FADE_SECONDS) * 1000);
    }
    this._publish();
  }

  _onSleepTick() {
    const remaining = (this._sleepDeadline - this._now()) / 1000;
    if (remaining > 0) {
      this._player.setFade(sleepFade(remaining));
      this._sleepTimer = this._later(() => this._onSleepTick(), 250);
      return;
    }
    this._sleepTimer = null;
    this._sleepMode = null;
    if (this._player.isPlaying) this.togglePlayPause();
    // Volume rendu après la pause : la reprise repart au niveau choisi.
    this._player.setFade(1);
    this._publish();
  }

  _setSource(type, ref) {
    this._sourceType = type;
    this._sourceId = ref == null ? null : String(ref);
  }

  _gainFor(item) {
    return replayGainFactor(item?.replayGain, this._replayGain);
  }

  _startCurrent(client) {
    const current = this._queue.state().current;
    if (!current) return;
    this._pendingGapless = 0;
    this._resumePending = false;
    this._loadGeneration += 1;
    this._player.load(current.streamUrl, { play: true, gain: this._gainFor(current) });
    this._scrobbler.trackStarted(current.trackId);
    quietly(client.nowPlaying(current.trackId));
    this._publish();
    this._saveState();
  }

  // ── Contrôles ──────────────────────────────────────────────────────────────

  togglePlayPause() {
    if (this._player.isPlaying) {
      this._player.pause();
      // Une pause précède souvent la fermeture : point de reprise tout de suite.
      this._saveState();
    } else {
      this._player.play();
      this._startResumedTrack();
    }
  }

  // Première lecture d'une file restaurée : c'est maintenant qu'elle
  // commence vraiment pour le serveur (scrobble, now playing, récents).
  _startResumedTrack() {
    if (!this._resumePending) return;
    this._resumePending = false;
    this._resumePosition = 0;
    const current = this._queue.state().current;
    if (!current) return;
    this._scrobbler.trackStarted(current.trackId);
    const client = this._getClient();
    if (client) quietly(client.nowPlaying(current.trackId));
    if (this._sourceType === 'smart') {
      this._reportPlayStarted('smart', this._sourceId);
    } else if (this._sourceType === 'album' || this._sourceType === 'playlist') {
      const id = Number(this._sourceId);
      if (Number.isInteger(id)) this._reportPlayStarted(this._sourceType, id);
    }
  }

  next() {
    this._loadFromState(this._queue.next());
  }

  // Au-delà des 3 premières secondes : redémarre la piste ; sinon recule.
  previous() {
    if (this._player.position() > 3) {
      this._player.seek(0);
      return;
    }
    this._loadFromState(this._queue.previous());
  }

  // Clic sur une ligne de la file. Sur la piste en cours : lecture/pause.
  jumpTo(index) {
    const state = this._queue.state();
    if (index < 0 || index >= state.items.length) return;
    if (index === state.currentIndex) {
      this.togglePlayPause();
      return;
    }
    this._loadFromState(this._queue.jumpTo(index));
  }

  seek(positionSeconds) {
    this._player.seek(positionSeconds);
    this._publish();
  }

  // 'off', 'track' ou 'album' : s'applique tout de suite à la piste en cours.
  setReplayGain(mode) {
    this._replayGain = ['off', 'track', 'album'].includes(mode) ? mode : 'off';
    this._player.setGain(this._gainFor(this._queue.state().current));
  }

  setVolume(volume) {
    this._player.setVolume(volume);
    this._publish();
  }

  setMuted(muted) {
    this._player.setMute(muted);
    this._publish();
  }

  // Arrête et vide la file : le mini-lecteur se masque et l'instantané de
  // reprise est effacé.
  close() {
    this._player.stop();
    this._scrobbler.trackStarted(null);
    this._resumePending = false;
    if (this._sleepMode !== null) this.setSleepTimer(null);
    this._setSource(null, null);
    this._sourceName = null;
    this._publish(this._queue.clear());
    this._saveState();
  }

  toggleShuffle() {
    this._publish(this._queue.setShuffle(!this._queue.state().shuffle));
    this._saveState();
  }

  cycleRepeat() {
    this._publish(this._queue.cycleRepeat());
  }

  // Réglages absolus, pour le contrôle à distance.
  setShuffle(enabled) {
    if (enabled !== this._queue.state().shuffle) this.toggleShuffle();
  }

  setRepeat(mode) {
    this._publish(this._queue.setRepeat(mode));
  }

  play() {
    if (this.hasItem && !this._player.isPlaying) this.togglePlayPause();
  }

  pause() {
    if (this._player.isPlaying) this.togglePlayPause();
  }

  // Bascule optimiste ; refus serveur → retour à l'ancien statut.
  toggleFavorite() {
    const client = this._getClient();
    const current = this._queue.state().current;
    if (!client || !current) return;
    const value = !current.isFavorite;
    this._publish(this._queue.updateFavorite(current.trackId, value));
    client.setFavorite(current.trackId, value).catch(() => {
      this._publish(this._queue.updateFavorite(current.trackId, !value));
    });
  }

  // Une page qui a changé un favori (fiche album) le reflète dans la file.
  favoriteChanged(trackId, isFavorite) {
    this._publish(this._queue.updateFavorite(trackId, isFavorite));
  }

  _loadFromState(state, { alreadyPlaying = false, play = true } = {}) {
    const current = state.current;
    if (!current) {
      // File épuisée : la lecture s'arrête, mais l'instantané garde les pistes.
      this._player.stop();
      this._resumePending = false;
      this._publish(state);
      this._saveState();
      return;
    }
    if (!alreadyPlaying) {
      this._pendingGapless = 0;
      this._loadGeneration += 1;
      this._player.load(current.streamUrl, { play, gain: this._gainFor(current) });
    }
    this._resumePending = false;
    this._scrobbler.trackStarted(current.trackId);
    const client = this._getClient();
    if (client) quietly(client.nowPlaying(current.trackId));
    this._publish(state);
    this._saveState();
    this._trimMix();
  }

  // ── Évènements du moteur ───────────────────────────────────────────────────

  setTransitionFade(seconds) {
    this._transitionFade = transitionFade.TRANSITION_FADE_CHOICES.includes(seconds) ? seconds : 0;
    if (!this._transitionFade) this._player.setTransition(1);
  }

  _applyTransitionFade(position, duration) {
    if (!this._transitionFade) return;
    const current = this._queue.state().current;
    const upcoming = this._queue.peekNext();
    const previous = this._queue.peekPrevious();
    this._player.setTransition(transitionFade.fadeFactor({
      position,
      duration,
      fade: this._transitionFade,
      fadeIn: previous !== null && !transitionFade.followsOnAlbum(previous, current),
      fadeOut: upcoming !== null && upcoming !== current && !transitionFade.followsOnAlbum(current, upcoming),
    }));
  }

  _onPosition(position, duration) {
    this._applyTransitionFade(position, duration);
    this._publish(undefined, { position, duration });
    const due = this._scrobbler.tick(position, duration);
    if (!due) return;
    const client = this._getClient();
    if (!client) return;
    // Compteur local d'abord, Last.fm ensuite : l'un n'empêche pas l'autre.
    quietly(client.markPlayed(due.trackId).finally(() => quietly(client.scrobble(due.trackId, due.startedAt))));
  }

  // La suivante préchargée a pris le relais : la file avance sans recharger.
  _onStreamStarted() {
    if (this._pendingGapless <= 0) return;
    this._pendingGapless -= 1;
    const ended = this._queue.state().current;
    const state = this._queue.trackEnded();
    this._loadFromState(state, { alreadyPlaying: true });
    this._mixTrackPlayed(ended, state.current === null);
    if (this._sleepMode === 'track') {
      // Minuteur posé alors que la suivante était déjà préchargée : arrêt au
      // tout début de celle-ci.
      this._sleepMode = null;
      this._player.pause();
      this._player.seek(0);
      this._publish();
    }
  }

  // Fin sans suivante préchargée (dernière piste, minuteur « fin de piste »).
  _onTrackEnded() {
    const ended = this._queue.state().current;
    const state = this._queue.trackEnded();
    const stopHere = this._sleepMode === 'track';
    if (stopHere) this._sleepMode = null;
    this._loadFromState(state, { play: !stopHere });
    this._mixTrackPlayed(ended, state.current === null);
  }

  // Le moteur approche de la fin : on lui donne la suivante dans l'ordre de
  // LECTURE, celle que trackEnded() rendra courante.
  _onAboutToFinish() {
    const upcoming = this._sleepMode === 'track' ? null : this._queue.peekNext();
    this._player.setNextUri(upcoming?.streamUrl ?? null, { gain: this._gainFor(upcoming) });
    if (upcoming) this._pendingGapless += 1;
  }

  _onError(message) {
    this._lastError = message;
    this._publish();
  }

  // ── Mix dynamique ──────────────────────────────────────────────────────────

  _isDynamicMix() {
    return this._sourceType === 'smart' && this._sourceId === dynamicMix.DYNAMIC_MIX_KEY;
  }

  _mixTrackPlayed(ended, exhausted) {
    if (!ended || !this._isDynamicMix()) return;
    const client = this._getClient();
    if (client) quietly(this._consumeMixTrack(client, ended.trackId, exhausted));
  }

  async _consumeMixTrack(client, trackId, exhausted) {
    const result = await client.dynamicMixPlayed(trackId);
    for (const listener of [...this._mixListeners]) listener(result.tracks);
    if (this._isDynamicMix()) this.syncDynamicMix(result.tracks, { restart: exhausted });
  }

  _trimMix() {
    if (this._mixTrimming || !this._isDynamicMix()) return;
    const trackIds = dynamicMix.trimIds(this._queue.playedBefore());
    const client = this._getClient();
    if (!trackIds.length || !client) return;
    this._mixTrimming = true;
    quietly(this._consumeMixTracks(client, trackIds));
  }

  async _consumeMixTracks(client, trackIds) {
    let result = null;
    try {
      for (const trackId of trackIds) {
        try {
          result = await client.dynamicMixPlayed(trackId);
        } catch {
          break;
        }
      }
    } finally {
      this._mixTrimming = false;
    }
    if (!result) return;
    for (const listener of [...this._mixListeners]) listener(result.tracks);
    if (this._isDynamicMix()) this.syncDynamicMix(result.tracks);
  }

  // Aligne la file sur la liste du mix renvoyée par le serveur. restart : la
  // file était épuisée, on relance sur la liste fraîche. yankCurrent :
  // retrait manuel, la piste en cours part aussi.
  syncDynamicMix(tracks, { restart = false, yankCurrent = false } = {}) {
    if (!this._isDynamicMix()) return;
    const client = this._getClient();
    if (!client) return;
    const playable = tracks.filter((t) => t.hasFile);
    if (restart) {
      if (!playable.length) return;
      this._queue.load(this._itemsFor(client, playable));
      this._startCurrent(client);
      return;
    }
    let state = this._queue.state();
    const currentId = state.current?.trackId ?? null;
    const { appendIds, removeIds } = dynamicMix.plan(state.items.map((i) => i.trackId), playable.map((t) => t.id));
    const byId = new Map(playable.map((t) => [t.id, t]));
    // Ajouter avant de retirer : la piste en cours a toujours une suivante.
    state = this._queue.append(this._itemsFor(client, appendIds.map((id) => byId.get(id))));
    let currentRemoved = false;
    for (const trackId of removeIds) {
      if (trackId === currentId) {
        if (!yankCurrent) continue;
        currentRemoved = true;
      }
      state = this._queue.remove(trackId);
    }
    if (currentRemoved) {
      this._loadFromState(state);
      return;
    }
    if (appendIds.length || removeIds.length) {
      this._publish(state);
      this._saveState();
    }
  }

  _itemsFor(client, tracks) {
    return tracks.map((track) => itemFromTrack(track, {
      albumTitle: track.albumTitle,
      artistName: track.artistName,
      streamUrl: client.streamUrl(track.id),
      coverUrl: client.resolveCover(track.coverUrl),
    }));
  }

  _albumItems(client, album, tracks) {
    const coverUrl = client.resolveCover(album.coverUrl);
    return tracks.map((track) => itemFromTrack(track, {
      albumTitle: album.title,
      artistName: album.artist.name,
      streamUrl: client.streamUrl(track.id),
      coverUrl,
      albumId: album.id,
    }));
  }

  // ── Historique d'accueil ───────────────────────────────────────────────────

  _reportPlayStarted(itemType, itemRef) {
    const client = this._getClient();
    if (!client) return;
    quietly(itemType === 'smart' ? client.reportSmartPlay(itemRef) : client.reportPlay(itemType, itemRef));
  }

  // ── Reprise entre deux lancements ──────────────────────────────────────────

  saveNow() {
    this._saveState();
  }

  _saveState() {
    if (!this._stateStore || this._restoring) return;
    const client = this._getClient();
    let position = this._player.position();
    if (this._resumePending && position <= 0) position = this._resumePosition;
    this._stateStore.save(this._queue.toSaved({
      serverUrl: client ? client.baseUrl : '',
      sourceType: this._sourceType,
      sourceId: this._sourceId,
      sourceName: this._sourceName,
      dynamicMix: this._isDynamicMix(),
      positionMs: Math.round(Math.max(0, position) * 1000),
    }));
  }

  // Recharge la file du dernier lancement, EN PAUSE à sa position. Sans effet
  // si une lecture a déjà commencé, ou si l'instantané vient d'un autre
  // serveur (ses URL de flux ne mèneraient nulle part).
  restore() {
    if (!this._stateStore || this._queue.state().hasItem) return;
    const saved = this._stateStore.load();
    if (!saved) return;
    const client = this._getClient();
    if (!client || saved.serverUrl !== client.baseUrl) return;
    this._restoring = true;
    try {
      const restored = Queue.fromSaved(saved, this._queueOptions);
      const state = restored.state();
      if (!state.hasItem) return;
      this._queue = restored;
      this._sourceType = saved.sourceType ?? null;
      this._sourceId = saved.sourceId ?? null;
      this._sourceName = saved.sourceName || null;
      this._pendingGapless = 0;
      this._resumePending = true;
      this._resumePosition = Math.max(0, Number(saved.positionMs) || 0) / 1000;
      this._loadGeneration += 1;
      this._player.load(state.current.streamUrl, { play: false, gain: this._gainFor(state.current) });
      this._publish(state, { position: this._resumePosition });
      this._pendingSeek(this._resumePosition);
    } finally {
      this._restoring = false;
    }
  }

  // Repositionne dès que le flux connaît sa durée (un seek trop tôt est
  // ignoré), et republie position/durée ; abandon au bout de ~5 s.
  _pendingSeek(positionSeconds) {
    const generation = this._loadGeneration;
    let attempts = 0;
    const attempt = () => {
      attempts += 1;
      if (generation !== this._loadGeneration) return;
      const duration = this._player.duration();
      if (duration <= 0) {
        if (attempts < SEEK_ATTEMPTS) this._later(attempt, SEEK_RETRY_MS);
        return;
      }
      if (positionSeconds > 0) this._player.seek(positionSeconds);
      this._publish(undefined, { position: positionSeconds, duration });
    };
    this._later(attempt, SEEK_RETRY_MS);
  }

  // ── Diffusion d'état ───────────────────────────────────────────────────────

  // Abonne listener(state) et lui envoie l'état actuel tout de suite ;
  // renvoie le désabonnement.
  subscribe(listener) {
    this._listeners.add(listener);
    listener(this.state());
    return () => this._listeners.delete(listener);
  }

  // Abonné à la liste du mix après chaque rotation (la fiche ouverte).
  subscribeMix(listener) {
    this._mixListeners.add(listener);
    return () => this._mixListeners.delete(listener);
  }

  _publish(queueState, { position, duration } = {}) {
    const state = this.state(queueState, position, duration);
    for (const listener of [...this._listeners]) listener(state);
    this._lastError = null;
  }

  state(queueState, position, duration) {
    const queue = queueState ?? this._queue.state();
    const current = queue.current;
    const sleepRemaining = this._sleepMode === 'timer' ? Math.max(0, (this._sleepDeadline - this._now()) / 1000) : 0;
    return {
      hasItem: queue.hasItem,
      isPlaying: this._player.isPlaying,
      current,
      currentTrackId: current?.trackId ?? null,
      sourceName: queue.hasItem ? this._sourceName : null,
      sourceType: queue.hasItem ? this._sourceType : null,
      sourceId: queue.hasItem ? this._sourceId : null,
      queueItems: queue.items,
      queueIndex: queue.currentIndex,
      isFavorite: current?.isFavorite ?? false,
      hasNext: this._queue.hasNext(),
      hasPrevious: this._queue.hasPrevious(),
      shuffle: queue.shuffle,
      repeat: queue.repeat,
      position: position ?? this._player.position(),
      duration: duration ?? this._player.duration(),
      volume: this._player.getVolume(),
      muted: this._player.getMute(),
      error: this._lastError,
      sleepMode: this._sleepMode,
      sleepRemaining,
      sleepEndsAt: this._sleepMode === 'timer' ? this._sleepDeadline : 0,
    };
  }
}
