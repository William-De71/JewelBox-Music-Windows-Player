// Contrôle à distance (Gladys…), logique pure (portage de core/remote.py).
// Le serveur (>= 1.18) relaie les ordres d'un autre client sur un flux SSE
// (GET /api/player/remote/events) ; en retour, le lecteur rapporte son état
// en direct (PATCH /api/player/queue/state avec playback_state…) à chaque
// changement, réglage actif ou non.

import { liveSleepTimer } from './sleepTimer.js';

// Au-delà de lecture / pause / suivant / précédent (liste du serveur).
export const CAPABILITIES = ['seek', 'volume', 'mute', 'shuffle', 'repeat', 'queue', 'play_media', 'append', 'sleep_timer'];

// En lecture, un rapport au moins toutes les HEARTBEAT secondes : sans flux
// ouvert, le serveur oublie un lecteur muet depuis 90 s.
export const HEARTBEAT = 30;
// Écart (s) au-delà duquel c'est un saut, pas la lecture qui avance.
export const SEEK_TOLERANCE = 3;

// Découpe un flux text/event-stream en [évènement, données]. Commentaires,
// retry:, id: et données non JSON sont ignorés.
export class SseParser {
  constructor() {
    this._buffer = '';
  }

  feed(chunk) {
    this._buffer += chunk.replace(/\r\n/g, '\n');
    const events = [];
    let end = this._buffer.indexOf('\n\n');
    while (end >= 0) {
      const block = this._buffer.slice(0, end);
      this._buffer = this._buffer.slice(end + 2);
      let event = 'message';
      const data = [];
      for (const line of block.split('\n')) {
        if (line.startsWith(':')) continue;
        const colon = line.indexOf(':');
        const field = colon < 0 ? line : line.slice(0, colon);
        let value = colon < 0 ? '' : line.slice(colon + 1);
        if (value.startsWith(' ')) value = value.slice(1);
        if (field === 'event') event = value;
        else if (field === 'data') data.push(value);
      }
      if (data.length) {
        try {
          events.push([event, JSON.parse(data.join('\n'))]);
        } catch { /* données non JSON : ignorées */ }
      }
      end = this._buffer.indexOf('\n\n');
    }
    return events;
  }
}

// État de la session → état en direct tel que le serveur l'attend.
export function liveStateOf(state) {
  return {
    playback_state: !state.hasItem ? 'idle' : state.isPlaying ? 'playing' : 'paused',
    track_id: state.currentTrackId ?? null,
    current_index: state.queueIndex ?? -1,
    position_sec: Math.max(0, state.position || 0),
    duration_sec: Math.max(0, state.duration || 0),
    volume: Math.round(Math.max(0, Math.min(1, state.volume)) * 100),
    muted: Boolean(state.muted),
    shuffle: Boolean(state.shuffle),
    repeat: state.repeat,
    sleep_timer: liveSleepTimer(state.sleepMode, state.sleepEndsAt),
  };
}

export function livePayload(live, deviceLabel) {
  const { track_id: trackId, ...rest } = live;
  const body = {
    ...rest,
    position_sec: Math.round(live.position_sec * 10) / 10,
    duration_sec: Math.round(live.duration_sec * 10) / 10,
    device_label: deviceLabel,
  };
  if (trackId != null) body.track_id = trackId;
  return body;
}

const withoutPosition = (live) => JSON.stringify({ ...live, position_sec: 0, duration_sec: 0 });

// Quand rapporter : à chaque changement de ce que le contrôleur affiche, à
// un saut de position, et en lecture toutes les HEARTBEAT secondes.
export class LiveReporter {
  constructor() {
    this._last = null;
    this._at = 0;
  }

  // Le prochain update() rapportera quoi qu'il arrive (reconnexion).
  forget() {
    this._last = null;
  }

  update(live, now) {
    const last = this._last;
    this._last = live;
    if (last === null) {
      this._at = now;
      return true;
    }
    let changed = withoutPosition(live) !== withoutPosition(last);
    if (!changed && live.playback_state === 'playing') {
      const expected = last.position_sec + (now - this._at);
      changed = Math.abs(live.position_sec - expected) > SEEK_TOLERANCE || now - this._at >= HEARTBEAT;
    } else if (!changed) {
      changed = Math.abs(live.position_sec - last.position_sec) > SEEK_TOLERANCE;
    }
    if (changed) this._at = now;
    else this._last = last; // garder la référence d'extrapolation d'origine
    return changed;
  }
}

// Secondes avant la tentative n° attempt : 2, 4, 8… plafonné à 60.
export function reconnectDelay(attempt) {
  return Math.min(60, 2 ** Math.max(1, attempt));
}
