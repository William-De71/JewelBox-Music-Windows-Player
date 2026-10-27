// Comptabilité du scrobbling (portage de core/scrobble.py, mêmes règles que
// la PWA et Android) : une piste d'au moins 30 s scrobble une fois la moitié
// réellement écoutée, ou 4 minutes ; les sauts (|Δ| ≥ 2 s) ne comptent pas.

export const MIN_DURATION_SECONDS = 30;
export const MAX_LISTENED_THRESHOLD_SECONDS = 240;
export const SEEK_JUMP_SECONDS = 2;

export class ScrobbleTracker {
  constructor() {
    this._state = null;
  }

  // À chaque changement de piste ; null efface le suivi.
  trackStarted(trackId, nowEpochSeconds = Math.floor(Date.now() / 1000)) {
    this._state = trackId == null
      ? null
      : { trackId, startedAt: nowEpochSeconds, played: 0, lastTime: 0, fired: false };
  }

  // Position/durée courantes ; renvoie { trackId, startedAt } une seule fois
  // au franchissement du seuil, sinon null.
  tick(positionSeconds, durationSeconds) {
    const state = this._state;
    if (!state) return null;
    const delta = positionSeconds - state.lastTime;
    if (delta > 0 && delta < SEEK_JUMP_SECONDS) state.played += delta;
    state.lastTime = positionSeconds;
    if (state.fired || !(durationSeconds >= MIN_DURATION_SECONDS)) return null;
    if (state.played < durationSeconds / 2 && state.played < MAX_LISTENED_THRESHOLD_SECONDS) return null;
    state.fired = true;
    return { trackId: state.trackId, startedAt: state.startedAt };
  }
}
