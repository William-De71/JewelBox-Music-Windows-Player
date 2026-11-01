// Les lecteurs pilotables, en direct, pour les pages de télécommande (portage
// du RemoteWatcher de ui/remote.py). Un seul flux pour l'application, ouvert
// tant qu'une page le regarde : acquire() / release(). Les décisions vivent
// dans core/remoteController.js.
//
// devices vaut null tant que la première liste n'est pas arrivée, puis la
// liste des AUTRES lecteurs pilotables ; vide si le flux ne s'ouvre pas
// (serveur < 1.18, injoignable).

import * as remote from '../core/remote.js';
import { applyWatchEvent, controllableOthers } from '../core/remoteController.js';

// Le serveur écrit un commentaire toutes les 20 s : rien pendant 60 s, la
// connexion est morte et on la rouvre.
const STREAM_TIMEOUT_MS = 60000;
// Plus personne ne regarde : le flux n'est fermé qu'après ce délai, le temps
// qu'une page en remplace une autre (liste → télécommande).
const RELEASE_DELAY_MS = 5000;

const sleep = (ms, signal) => new Promise((resolve) => {
  const timer = setTimeout(resolve, ms);
  signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
});

export class RemoteWatch {
  constructor({ getClient, getDeviceId, fetchImpl }) {
    this._getClient = getClient;
    this._getDeviceId = getDeviceId;
    this._fetch = fetchImpl ?? ((...args) => fetch(...args));
    this._all = [];
    this.devices = null;
    this._listeners = new Set();
    this._users = 0;
    this._abort = null;
    this._releaseTimer = null;
  }

  // Abonnement : appelé tout de suite avec la liste courante, puis à chaque
  // changement. Rend la fonction de désabonnement.
  subscribe(listener) {
    this._listeners.add(listener);
    listener(this.devices);
    return () => this._listeners.delete(listener);
  }

  acquire() {
    this._users += 1;
    clearTimeout(this._releaseTimer);
    this._releaseTimer = null;
    if (!this._abort) {
      this._abort = new AbortController();
      this._run(this._abort.signal);
    }
  }

  release() {
    this._users = Math.max(0, this._users - 1);
    if (this._users > 0 || this._releaseTimer) return;
    this._releaseTimer = setTimeout(() => {
      this._releaseTimer = null;
      if (this._users === 0) this.stop();
    }, RELEASE_DELAY_MS);
  }

  // Serveur changé : la liste repart de zéro, le flux est rouvert vers lui.
  restart() {
    if (!this._abort) return;
    this.stop();
    this._notify();
    this._abort = new AbortController();
    this._run(this._abort.signal);
  }

  stop() {
    this._abort?.abort();
    this._abort = null;
    this._all = [];
    this.devices = null;
  }

  _publish() {
    this.devices = controllableOthers(this._all, this._getDeviceId());
    this._notify();
  }

  _notify() {
    this._listeners.forEach((listener) => listener(this.devices));
  }

  async _run(signal) {
    let attempt = 0;
    while (!signal.aborted) {
      const client = this._getClient();
      if (client && await this._listen(client, signal)) attempt = 0;
      if (signal.aborted) break;
      if (this.devices === null) this._publish();
      attempt += 1;
      await sleep(remote.reconnectDelay(attempt) * 1000, signal);
    }
  }

  // Lit le flux jusqu'à sa fin ; vrai s'il a été ouvert.
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
        response = await this._fetch(client.remoteWatchUrl(), {
          headers: { Accept: 'text/event-stream' },
          signal: local.signal,
        });
      } catch {
        return false;
      }
      if (response.status !== 200 || !response.body) return false;
      const parser = new remote.SseParser();
      const decoder = new TextDecoder();
      const reader = response.body.getReader();
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          arm();
          for (const [event, data] of parser.feed(decoder.decode(value, { stream: true }))) {
            this._all = applyWatchEvent(this._all, event, data);
            if (!signal.aborted) this._publish();
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
}
