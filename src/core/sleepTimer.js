// Minuteur de sommeil (portage de core/sleep_timer.py, mêmes règles que la
// PWA et Android) : pause au bout d'un délai avec un fondu sur les dernières
// secondes, ou à la fin de la piste en cours (sans fondu).

export const SLEEP_TIMER_MINUTES = [15, 30, 45, 60, 90];
export const FADE_SECONDS = 10;

// Multiplicateur de volume : 1, puis jusqu'à 0 pendant le fondu.
export function fadeFactor(remainingSeconds) {
  if (remainingSeconds >= FADE_SECONDS) return 1;
  return Math.max(0, remainingSeconds / FADE_SECONDS);
}

// Ordre sleep_timer du contrôle à distance → 'track', un nombre de minutes,
// ou null (0 minute : annulation).
export function modeFromCommand(command) {
  if (command?.end_of_track === true) return 'track';
  const minutes = command?.minutes;
  return Number.isInteger(minutes) && minutes > 0 ? minutes : null;
}

// Ce que l'état en direct rapporte : null, { end_of_track: true } ou
// { ends_at: date ISO } (endsAtMs : heure murale de l'arrêt).
export function liveSleepTimer(mode, endsAtMs) {
  if (mode === 'track') return { end_of_track: true };
  if (mode === 'timer') return { ends_at: new Date(Math.round(endsAtMs / 1000) * 1000).toISOString().replace('.000Z', 'Z') };
  return null;
}
