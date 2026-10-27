// Moteur de lecture sur deux éléments <audio> du WebView (WebView2 sous
// Windows) : l'équivalent de playback/player.py, qui pilote playbin3.
//
// Il ne connaît rien à la file : une URL de flux par appel, et les mêmes
// évènements que GStreamer, retraduits en callbacks :
//   - onPosition(position, duration)  toutes les 250 ms pendant la lecture
//   - onAboutToFinish()               une fois par piste, à l'approche de la
//                                     fin : la session répond par setNextUri
//   - onStreamStarted()               la piste suivante préchargée a pris
//                                     le relais (enchaînement)
//   - onTrackEnded()                  fin sans suivante préchargée
//   - onError(message)                échec de lecture (réseau, format…)
//   - onStateChanged(playing)
//
// L'enchaînement : la piste suivante est préchargée dans le second élément
// et démarrée dès la fin de la première (un blanc de quelques millisecondes,
// là où playbin3 enchaîne à l'échantillon près).

const POSITION_POLL_MS = 250;
// Marge avant la fin à laquelle la suivante est demandée : de quoi la
// mettre en mémoire tampon sur un réseau lent.
const ABOUT_TO_FINISH_SECONDS = 15;

const MEDIA_ERRORS = {
  1: 'lecture interrompue',
  2: 'erreur réseau',
  3: 'décodage impossible',
  4: 'format non pris en charge',
};

const clamp01 = (value) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

export class AudioPlayer {
  constructor({
    createElement = () => new Audio(),
    setInterval: every = (fn, ms) => globalThis.setInterval(fn, ms),
    clearInterval: stopEvery = (id) => globalThis.clearInterval(id),
  } = {}) {
    this._elements = [createElement(), createElement()];
    this._active = 0;
    this._every = every;
    this._stopEvery = stopEvery;
    this._poll = null;
    this._isPlaying = false;
    this._uri = null;
    this._nextUri = null;
    this._nextGain = 1;
    this._aboutToFinishSent = false;
    this._volume = 1;
    this._muted = false;
    this._fade = 1;
    this._transition = 1;
    this._gain = 1;

    this.onPosition = null;
    this.onAboutToFinish = null;
    this.onStreamStarted = null;
    this.onTrackEnded = null;
    this.onError = null;
    this.onStateChanged = null;

    this._elements.forEach((element, index) => {
      element.preload = 'auto';
      element.addEventListener('playing', () => index === this._active && this._setPlaying(true));
      element.addEventListener('pause', () => index === this._active && this._setPlaying(false));
      element.addEventListener('ended', () => index === this._active && this._onEnded());
      element.addEventListener('error', () => index === this._active && this._onError(element));
    });
  }

  get _element() { return this._elements[this._active]; }

  get _spare() { return this._elements[1 - this._active]; }

  // ── Commandes ──────────────────────────────────────────────────────────────

  // Charge une nouvelle URL en remplaçant la lecture en cours. gain : facteur
  // ReplayGain de cette piste.
  load(uri, { play = true, gain = 1 } = {}) {
    this._clearSpare();
    this._uri = uri;
    this._gain = clamp01(gain);
    this._aboutToFinishSent = false;
    const element = this._element;
    element.src = uri;
    this._applyVolume();
    if (play) this._play(element);
    else this._setPlaying(false);
  }

  // Réponse à onAboutToFinish : précharge la suivante. null laisse la piste
  // se terminer (onTrackEnded).
  setNextUri(uri, { gain = 1 } = {}) {
    this._nextUri = uri;
    this._nextGain = clamp01(gain);
    const spare = this._spare;
    if (uri) {
      spare.src = uri;
      spare.load?.();
    } else {
      this._clearSpare();
    }
  }

  play() {
    if (this._uri) this._play(this._element);
  }

  pause() {
    this._element.pause();
  }

  stop() {
    this._element.pause();
    this._element.removeAttribute('src');
    this._element.load?.();
    this._clearSpare();
    this._uri = null;
    this._setPlaying(false);
  }

  seek(positionSeconds) {
    if (!this._uri) return;
    try {
      this._element.currentTime = Math.max(0, positionSeconds);
    } catch { /* flux pas encore prêt : ignoré, comme un seek GStreamer refusé */ }
    // Revenir avant la marge réarme la demande de la suivante.
    if (this.duration() - positionSeconds > ABOUT_TO_FINISH_SECONDS) this._aboutToFinishSent = false;
  }

  setVolume(volume) {
    this._volume = clamp01(volume);
    this._applyVolume();
  }

  getVolume() { return this._volume; }

  setMute(muted) {
    this._muted = Boolean(muted);
    for (const element of this._elements) element.muted = this._muted;
  }

  getMute() { return this._muted; }

  // Fondu de la minuterie de sommeil : multiplie le volume choisi.
  setFade(factor) {
    this._fade = clamp01(factor);
    this._applyVolume();
  }

  // Fondu entre les morceaux : multiplie lui aussi le volume choisi.
  setTransition(factor) {
    const value = clamp01(factor);
    if (value !== this._transition) {
      this._transition = value;
      this._applyVolume();
    }
  }

  // ReplayGain de la piste en cours (changement de mode en cours de piste).
  setGain(gain) {
    this._gain = clamp01(gain);
    this._applyVolume();
  }

  get isPlaying() { return this._isPlaying; }

  position() {
    const value = this._element.currentTime;
    return this._uri && Number.isFinite(value) ? value : 0;
  }

  duration() {
    const value = this._element.duration;
    return this._uri && Number.isFinite(value) ? value : 0;
  }

  // ── Interne ────────────────────────────────────────────────────────────────

  _applyVolume() {
    this._element.volume = clamp01(this._volume * this._fade * this._transition * this._gain);
  }

  _play(element) {
    const result = element.play();
    // play() rejette si la lecture est interrompue (pause, nouveau load) :
    // sans intérêt ici, les vraies erreurs passent par l'évènement 'error'.
    result?.catch?.(() => {});
  }

  _clearSpare() {
    this._nextUri = null;
    const spare = this._spare;
    if (spare.getAttribute?.('src')) {
      spare.pause();
      spare.removeAttribute('src');
      spare.load?.();
    }
  }

  _setPlaying(playing) {
    if (playing) this._startPolling();
    else this._stopPolling();
    if (playing !== this._isPlaying) {
      this._isPlaying = playing;
      this.onStateChanged?.(playing);
    }
  }

  _onEnded() {
    if (this._nextUri) {
      // Enchaînement : le second élément, déjà en tampon, prend le relais.
      const previous = this._element;
      this._active = 1 - this._active;
      this._uri = this._nextUri;
      this._nextUri = null;
      this._gain = this._nextGain;
      this._aboutToFinishSent = false;
      previous.removeAttribute('src');
      previous.load?.();
      this._element.muted = this._muted;
      this._applyVolume();
      this._play(this._element);
      this.onStreamStarted?.();
      return;
    }
    this._setPlaying(false);
    this.onTrackEnded?.();
  }

  _onError(element) {
    const code = element.error?.code;
    this.onError?.(MEDIA_ERRORS[code] ?? element.error?.message ?? 'lecture impossible');
  }

  _startPolling() {
    if (this._poll !== null) return;
    this._poll = this._every(() => this._tick(), POSITION_POLL_MS);
  }

  _stopPolling() {
    if (this._poll === null) return;
    this._stopEvery(this._poll);
    this._poll = null;
  }

  _tick() {
    const position = this.position();
    const duration = this.duration();
    if (!this._aboutToFinishSent && duration > 0 && duration - position <= ABOUT_TO_FINISH_SECONDS) {
      this._aboutToFinishSent = true;
      this.onAboutToFinish?.();
    }
    this.onPosition?.(position, duration);
  }
}
