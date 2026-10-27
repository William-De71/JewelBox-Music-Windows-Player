// Synchronisation de la file avec le serveur (portage de core/queue_sync.py) :
// le serveur garde une file par appareil (X-Device-Id), ce qui permet de
// reprendre ailleurs ce qui jouait ici. Protocole de la PWA :
// - les pistes changent → PUT complet ;
// - seule la piste courante change → PATCH de l'état ;
// - en lecture, un PATCH de la position toutes les PROGRESS_INTERVAL s ;
// - passage en pause → PATCH (position exacte) ; file vidée → DELETE.

export const PROGRESS_INTERVAL = 30;
// Ancienneté maximale d'une file d'un autre appareil proposée à l'accueil.
export const RESUME_WINDOW = 24 * 3600;

export class QueueSyncPlanner {
  constructor() {
    this._trackIds = [];
    this._index = -1;
    this._playing = false;
    this._lastPush = 0;
  }

  // La prochaine mise à jour renverra la file entière (sa source a changé).
  resend() {
    this._trackIds = [];
  }

  // Nouvel état ; rend { kind: 'save'|'state'|'clear', … } ou null.
  // now : secondes (horloge monotone).
  update(trackIds, currentIndex, positionSec, playing, now) {
    const ids = [...trackIds];
    const index = currentIndex ?? -1;
    const position = Math.max(0, Number(positionSec) || 0);
    const wasPlaying = this._playing;
    this._playing = Boolean(playing);

    if (!ids.length) {
      const hadQueue = this._trackIds.length > 0;
      this._trackIds = [];
      this._index = -1;
      return hadQueue ? { kind: 'clear' } : null;
    }
    const same = ids.length === this._trackIds.length && ids.every((id, i) => id === this._trackIds[i]);
    if (!same) {
      this._trackIds = ids;
      this._index = index;
      this._lastPush = now;
      return { kind: 'save', trackIds: ids, currentIndex: index, positionSec: position };
    }
    const pausedNow = wasPlaying && !this._playing;
    const progressDue = this._playing && now - this._lastPush >= PROGRESS_INTERVAL;
    if (index !== this._index || pausedNow || progressDue) {
      this._index = index;
      this._lastPush = now;
      return { kind: 'state', currentIndex: index, positionSec: position };
    }
    return null;
  }
}

// Où reprendre la file d'un autre appareil, une fois les pistes sans fichier
// écartées. playable : un booléen par piste. Rend { index, sameTrack } ou
// null ; sameTrack dit si la position enregistrée s'applique.
export function resumeStart(playable, currentIndex) {
  const total = playable.filter(Boolean).length;
  if (!total) return null;
  if (currentIndex == null || currentIndex < 0 || currentIndex >= playable.length) return { index: 0, sameTrack: false };
  const before = playable.slice(0, currentIndex).filter(Boolean).length;
  if (playable[currentIndex]) return { index: before, sameTrack: true };
  return { index: Math.min(before, total - 1), sameTrack: false };
}

// Horodatage SQLite datetime('now') (UTC, sans fuseau) → secondes epoch.
export function parseServerTimestamp(value) {
  const match = /^\s*(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})\s*$/.exec(value ?? '');
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match.map(Number);
  const ms = Date.UTC(y, mo - 1, d, h, mi, s);
  const check = new Date(ms);
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return ms / 1000;
}

// L'autre appareil à proposer à l'accueil : le plus récent qui a encore des
// pistes, mis à jour dans les RESUME_WINDOW dernières secondes, non écarté
// (dismissed : Set de « deviceId|updatedAt »), et qui a rejoué depuis que
// cet appareil a servi (ownUpdatedAt).
export function pickResumable(devices, now, dismissed = new Set(), ownUpdatedAt = null) {
  const ownAt = parseServerTimestamp(ownUpdatedAt);
  let best = null;
  let bestAt = null;
  for (const device of devices) {
    if (device.trackCount <= 0) continue;
    if (dismissed.has(`${device.deviceId}|${device.updatedAt}`)) continue;
    const at = parseServerTimestamp(device.updatedAt);
    if (at === null || now - at < 0 || now - at > RESUME_WINDOW) continue;
    if (ownAt !== null && at <= ownAt) continue;
    if (bestAt === null || at > bestAt) {
      best = device;
      bestAt = at;
    }
  }
  return best;
}

// « il y a 5 min » à partir d'un horodatage du serveur.
export function timeAgo(updatedAt, nowMs = Date.now()) {
  const at = parseServerTimestamp(updatedAt);
  if (at === null) return '';
  const minutes = Math.floor((nowMs / 1000 - at) / 60);
  if (minutes < 1) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  if (minutes < 24 * 60) return `il y a ${Math.floor(minutes / 60)} h`;
  return `il y a ${Math.floor(minutes / (24 * 60))} j`;
}

// { title, subtitle } d'une file d'un autre appareil : ce qu'il écoutait,
// puis la source, l'appareil, le nombre de pistes et quand.
export function deviceSummary(device, nowMs = Date.now()) {
  const name = device.deviceLabel || 'Appareil sans nom';
  let title;
  const details = [];
  if (device.currentTitle) {
    title = device.currentArtist ? `${device.currentTitle} — ${device.currentArtist}` : device.currentTitle;
    if (device.sourceLabel) details.push(device.sourceLabel);
  } else {
    title = device.sourceLabel || name;
  }
  if (title !== name) details.push(name);
  details.push(device.trackCount === 1 ? '1 piste' : `${device.trackCount} pistes`);
  const when = timeAgo(device.updatedAt, nowMs);
  if (when) details.push(when);
  return { title, subtitle: details.join(' · ') };
}
