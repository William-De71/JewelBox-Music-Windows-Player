// Publie la file de cet appareil sur le serveur (portage de
// playback/queue_sync.py), pour qu'un autre appareil puisse la reprendre.
// Les décisions vivent dans core/queueSync.js ; ici on écoute la session et
// on exécute les appels, best-effort.

import { QueueSyncPlanner } from '../core/queueSync.js';

// Un PUT complet est regroupé sur ce délai : choisir un album puis passer
// trois pistes ne fait qu'un appel.
const SAVE_DELAY_MS = 1500;

export class QueueSync {
  constructor({ playback, getClient, getDeviceLabel, now = () => performance.now() / 1000, setTimeout: later = (fn, ms) => globalThis.setTimeout(fn, ms), clearTimeout: cancel = (id) => globalThis.clearTimeout(id) }) {
    this._playback = playback;
    this._getClient = getClient;
    this._getDeviceLabel = getDeviceLabel;
    this._now = now;
    this._later = later;
    this._cancel = cancel;
    this._planner = new QueueSyncPlanner();
    this._pendingSave = null;
    this._saveTimer = null;
    this._sourceName = null;
    this._unsubscribe = null;
  }

  start() {
    this._unsubscribe = this._playback.subscribe((state) => this._onState(state));
  }

  stop() {
    this._unsubscribe?.();
    this._unsubscribe = null;
    this._cancelSave();
  }

  _onState(state) {
    if (state.sourceName !== this._sourceName) {
      // Mêmes pistes, autre source : le serveur doit l'apprendre. File vidée :
      // surtout pas, le DELETE ne partirait plus.
      this._sourceName = state.sourceName;
      if (state.queueItems.length) this._planner.resend();
    }
    const action = this._planner.update(
      state.queueItems.map((item) => item.trackId), state.queueIndex, state.position, state.isPlaying, this._now(),
    );
    if (!action) return;
    if (action.kind === 'save') {
      this._pendingSave = action;
      if (this._saveTimer === null) this._saveTimer = this._later(() => this._flushSave(), SAVE_DELAY_MS);
      return;
    }
    if (action.kind === 'state' && this._pendingSave) {
      // Un PUT part bientôt : il portera l'état le plus récent.
      this._pendingSave = { ...this._pendingSave, currentIndex: action.currentIndex, positionSec: action.positionSec };
      return;
    }
    if (action.kind === 'clear') this._cancelSave();
    this._send(action);
  }

  _flushSave() {
    this._saveTimer = null;
    const action = this._pendingSave;
    this._pendingSave = null;
    if (action) this._send(action);
  }

  _cancelSave() {
    if (this._saveTimer !== null) this._cancel(this._saveTimer);
    this._saveTimer = null;
    this._pendingSave = null;
  }

  _send(action) {
    const client = this._getClient();
    if (!client) return;
    let call;
    if (action.kind === 'save') {
      call = client.saveQueue({
        trackIds: action.trackIds, currentIndex: action.currentIndex, positionSec: action.positionSec,
        deviceLabel: this._getDeviceLabel(), sourceLabel: this._sourceName,
      });
    } else if (action.kind === 'state') {
      call = client.updateQueueState(action.currentIndex, action.positionSec);
    } else {
      call = client.clearQueue();
    }
    call.catch(() => {});
  }
}
