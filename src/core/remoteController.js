// Télécommande des autres lecteurs (téléphone, lecteur bureau, PWA), logique
// pure (portage de core/remote_controller.py). L'autre moitié de remote.js,
// où c'est CE lecteur qui est piloté. Ici il pilote : la liste des lecteurs
// arrive par GET /api/player/remote/watch (toute la liste, puis un évènement
// par changement), les ordres partent par
// POST /api/player/remote/devices/:id/commands. Serveur : utils/remote.js.

import { parseRemoteDevice, parseRemoteDevices, ParseError } from '../api/parsing.js';

// La liste après un évènement du flux : « devices » (toute la liste, envoyée
// d'abord), « device » (un lecteur ajouté ou changé), « gone » (un lecteur
// parti). Tout autre évènement, ou des données illisibles, la laisse telle
// quelle.
export function applyWatchEvent(devices, event, data) {
  try {
    if (event === 'devices') return parseRemoteDevices(data);
    if (event === 'device') {
      const device = parseRemoteDevice(data);
      const index = devices.findIndex((d) => d.deviceId === device.deviceId);
      if (index < 0) return [...devices, device];
      return devices.map((d, i) => (i === index ? device : d));
    }
    if (event === 'gone' && data && typeof data === 'object') {
      return devices.filter((d) => d.deviceId !== data.device_id);
    }
  } catch (error) {
    if (!(error instanceof ParseError)) throw error;
  }
  return devices;
}

// Les lecteurs que celui-ci peut piloter : les autres, flux d'ordres ouvert.
export function controllableOthers(devices, ownDeviceId) {
  return devices.filter((d) => d.controllable && d.deviceId !== ownDeviceId);
}

// Où en est le lecteur, en secondes : la position rapportée, avancée du temps
// écoulé depuis le rapport s'il joue (il ne rapporte alors que toutes les
// 30 s), jamais au-delà de la fin ni en arrière (horloge de ce poste en retard
// sur celle du serveur). now : millisecondes epoch.
export function livePosition(state, now) {
  if (state.playbackState !== 'playing') return state.positionSec;
  const reported = Date.parse(state.reportedAt ?? '');
  if (!Number.isFinite(reported)) return state.positionSec;
  const position = state.positionSec + Math.max(0, (now - reported) / 1000);
  return state.durationSec > 0 ? Math.min(position, state.durationSec) : position;
}

// Le mode de répétition suivant au clic : off → all → one → off.
export function nextRepeat(mode) {
  if (mode === 'all') return 'one';
  if (mode === 'one') return 'off';
  return 'all';
}

// « Écouter ici » : la file que ce lecteur a laissée sur le serveur, calée
// sur où il en est maintenant. Sa piste et sa position en direct sont plus
// fraîches que celles enregistrées (toutes les 30 s environ en lecture) ; on
// garde ces dernières si le direct ne correspond pas à la file (un
// changement pas encore enregistré).
export function takeOverQueue(queue, state, now) {
  if (state?.trackId == null) return queue;
  const idAt = (index) => queue.tracks[index]?.id;
  let index;
  if (idAt(state.currentIndex) === state.trackId) index = state.currentIndex;
  else if (idAt(queue.currentIndex) === state.trackId) index = queue.currentIndex;
  else return queue;
  return { ...queue, currentIndex: index, positionSec: livePosition(state, now) };
}

// Icône d'après le nom que le lecteur s'est donné (« JewelBox Android ·
// modèle », « JewelBox bureau · hôte », un navigateur…).
export function deviceIcon(label) {
  const text = (label ?? '').toLowerCase();
  if (text.includes('android')) return 'phone';
  if (['bureau', 'desktop', 'windows'].some((word) => text.includes(word))) return 'desktop';
  return 'globe';
}

export const deviceName = (device) => device.deviceLabel || 'Lecteur sans nom';

// ── Corps des ordres ─────────────────────────────────────────────────────────

// play, pause, toggle, next, previous : compris de tous les lecteurs.
export const simpleCommand = (name) => ({ command: name });
export const seekCommand = (positionSec) => ({ command: 'seek', position_sec: Math.max(0, Number(positionSec)) });
export const volumeCommand = (volume) => ({ command: 'volume', volume: Math.max(0, Math.min(100, Math.round(volume))) });
export const muteCommand = (muted) => ({ command: 'mute', muted: Boolean(muted) });
export const shuffleCommand = (shuffle) => ({ command: 'shuffle', shuffle: Boolean(shuffle) });
export const repeatCommand = (mode) => ({ command: 'repeat', repeat: mode });
export const playIndexCommand = (index) => ({ command: 'play_index', index });
// type : 'album' | 'playlist' (id entier) ou 'smart' (id = clé).
export const playMediaCommand = (type, id) => ({ command: 'play_media', mode: 'replace', media: { type, id } });
