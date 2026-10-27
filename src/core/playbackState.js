// Persistance de la file entre deux lancements (portage de
// core/playback_state.py) : un instantané JSON, réécrit à chaque changement
// et relu au démarrage. Toute erreur est avalée : une reprise ratée ne doit
// jamais empêcher l'app de démarrer.

const STORAGE_KEY = 'jewelbox-playback-state';

export class PlaybackStateStore {
  constructor(storage = globalThis.localStorage) {
    this._storage = storage;
  }

  // Une file vide efface l'instantané. true si le stockage reflète la demande.
  save(snapshot) {
    if (!snapshot?.tracks?.length) return this.clear();
    try {
      this._storage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
      return true;
    } catch {
      return false;
    }
  }

  load() {
    try {
      const snapshot = JSON.parse(this._storage.getItem(STORAGE_KEY));
      if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
      if (!Array.isArray(snapshot.tracks) || !snapshot.tracks.length) return null;
      return snapshot;
    } catch {
      return null;
    }
  }

  clear() {
    try {
      this._storage.removeItem(STORAGE_KEY);
      return true;
    } catch {
      return false;
    }
  }
}
