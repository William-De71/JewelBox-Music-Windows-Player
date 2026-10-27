// Contrôle à distance : ce lecteur piloté par un autre client (Gladys…).
// Portage de playback/remote_control.py : les décisions vivent dans
// core/remote.js ; ici on écoute la session, on garde le flux d'ordres ouvert
// (fetch en flux) et on exécute les ordres reçus. Tout est best-effort : un
// serveur < 1.18 (404) ou injoignable n'empêche rien, on réessaie de plus en
// plus rarement.

import * as remote from '../core/remote.js';
import { modeFromCommand } from '../core/sleepTimer.js';
import { smartSpec } from '../core/smartSpecs.js';

// Le serveur écrit un commentaire toutes les 20 s : rien pendant 60 s, la
// connexion est morte (veille, Wi-Fi coupé) et on la rouvre.
const STREAM_TIMEOUT_MS = 60000;

const sleep = (ms, signal) => new Promise((resolve) => {
  const timer = setTimeout(resolve, ms);
  signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
});

export class RemoteControl {
  constructor({ playback, getClient, getDeviceLabel, isEnabled, getRankingSize, fetchImpl, now = () => performance.now() / 1000 }) {
    this._playback = playback;
    this._getClient = getClient;
    this._getDeviceLabel = getDeviceLabel;
    this._isEnabled = isEnabled;
    this._getRankingSize = getRankingSize;
    this._fetch = fetchImpl ?? ((...args) => fetch(...args));
    this._now = now;
    this._reporter = new remote.LiveReporter();
    this._abort = null;
    this._unsubscribe = null;
  }

  start() {
    this._unsubscribe = this._playback.subscribe((state) => this._onState(state));
    this.restart();
  }

  stop() {
    this._unsubscribe?.();
    this._unsubscribe = null;
    this._stopStream();
  }

  // Réglage ou serveur changé : flux rouvert (ou fermé).
  restart() {
    this._stopStream();
    if (!this._isEnabled()) return;
    this._abort = new AbortController();
    this._run(this._abort.signal);
  }

  _stopStream() {
    this._abort?.abort();
    this._abort = null;
  }

  // ── État en direct ─────────────────────────────────────────────────────────

  _onState(state) {
    const live = remote.liveStateOf(state);
    if (!this._reporter.update(live, this._now())) return;
    const client = this._getClient();
    client?.reportLiveState(remote.livePayload(live, this._getDeviceLabel())).catch(() => {});
  }

  // ── Flux d'ordres ──────────────────────────────────────────────────────────

  async _run(signal) {
    let attempt = 0;
    while (!signal.aborted) {
      const client = this._getClient();
      if (client && await this._listen(client, signal)) attempt = 0;
      attempt += 1;
      await sleep(remote.reconnectDelay(attempt) * 1000, signal);
    }
  }

  // Lit le flux jusqu'à sa fin ; vrai s'il a été ouvert (la reconnexion
  // repart alors du délai le plus court).
  async _listen(client, signal) {
    const local = new AbortController();
    const onAbort = () => local.abort();
    signal.addEventListener('abort', onAbort, { once: true });
    let watchdog = null;
    const arm = () => {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => local.abort(), STREAM_TIMEOUT_MS);
    };
    try {
      arm();
      let response;
      try {
        response = await this._fetch(client.remoteEventsUrl(this._getDeviceLabel(), remote.CAPABILITIES), {
          headers: { 'X-Device-Id': client.deviceId, Accept: 'text/event-stream' },
          signal: local.signal,
        });
      } catch {
        return false;
      }
      if (response.status !== 200 || !response.body) return false;
      const parser = new remote.SseParser();
      const decoder = new TextDecoder();
      // Le contrôleur vient de nous voir apparaître : il doit savoir tout de
      // suite où en est la lecture.
      this._reporter.forget();
      this._onState(this._playback.state());
      const reader = response.body.getReader();
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          arm();
          for (const [event, data] of parser.feed(decoder.decode(value, { stream: true }))) {
            if (event === 'command' && data && typeof data === 'object') this.execute(client, data);
          }
        }
      } catch { /* coupure, délai dépassé ou arrêt */ }
      return true;
    } finally {
      clearTimeout(watchdog);
      signal.removeEventListener('abort', onAbort);
      local.abort();
    }
  }

  // ── Exécution ──────────────────────────────────────────────────────────────

  execute(client, command) {
    const playback = this._playback;
    const simple = {
      play: () => playback.play(),
      pause: () => playback.pause(),
      toggle: () => playback.togglePlayPause(),
      next: () => playback.next(),
      previous: () => playback.previous(),
    };
    const name = command.command;
    if (simple[name]) simple[name]();
    else if (name === 'seek') playback.seek(Number(command.position_sec ?? 0));
    else if (name === 'volume') playback.setVolume(Number(command.volume ?? 100) / 100);
    else if (name === 'mute') playback.setMuted(Boolean(command.muted));
    else if (name === 'shuffle') playback.setShuffle(Boolean(command.shuffle));
    else if (name === 'repeat' && ['off', 'all', 'one'].includes(command.repeat)) playback.setRepeat(command.repeat);
    else if (name === 'sleep_timer') playback.setSleepTimer(modeFromCommand(command));
    else if (name === 'play_index') this._playIndex(Number(command.index ?? -1));
    else if (name === 'play_media') this._playMedia(client, command.media ?? {}, command.mode ?? 'replace').catch(() => {});
  }

  _playIndex(index) {
    // jumpTo bascule lecture/pause sur la piste en cours : un contrôleur qui
    // demande cette piste veut l'entendre.
    if (index === this._playback.state().queueIndex) this._playback.play();
    else this._playback.jumpTo(index);
  }

  async _playMedia(client, media, mode) {
    const playback = this._playback;
    const { type: kind, id: ref } = media;
    const enqueue = mode === 'next' || mode === 'append';
    const playNext = mode === 'next';
    let tracks;
    let options = {};
    if (kind === 'album') {
      const album = await client.album(ref);
      if (enqueue) {
        playback.enqueueAlbum(album, { playNext });
      } else {
        const first = album.tracks.find((t) => t.hasFile);
        if (first) playback.playAlbum(album, first.id);
      }
      return;
    }
    if (kind === 'playlist') {
      const playlist = await client.playlist(ref);
      tracks = playlist.tracks;
      options = { reportPlaylistId: playlist.id, sourceName: playlist.name };
    } else if (kind === 'smart') {
      const smart = await client.smartPlaylist(ref, this._getRankingSize() || undefined);
      tracks = smart.tracks;
      options = { reportSmartKey: ref, sourceName: smartSpec(ref)?.label ?? ref };
    } else if (kind === 'track') {
      tracks = [await client.track(ref)];
    } else if (kind === 'album_radio' || kind === 'artist_radio') {
      const radio = await client.radio(kind === 'album_radio' ? { albumId: ref } : { artistId: ref });
      tracks = radio.tracks;
      options = { sourceName: `Radio · ${radio.seedName}` };
    } else {
      return;
    }
    if (!tracks.length) return;
    if (enqueue) playback.enqueueTracks(tracks, { playNext });
    else playback.playQueueTracks(tracks, options);
  }
}
