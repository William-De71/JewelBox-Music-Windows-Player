// Fondu entre les morceaux, sans chevauchement (portage de
// core/transition_fade.py) : le son baisse sur les dernières secondes d'un
// morceau et remonte au début du suivant — jamais entre deux pistes qui se
// suivent sur un même album (un album live reste sans blanc). Même règle que
// la PWA, le lecteur bureau et l'appli Android.

export const TRANSITION_FADE_CHOICES = [0, 2, 4, 6, 8];

// Deux entrées de file (QueueItem) qui se suivent sur leur album.
export function followsOnAlbum(before, after) {
  return Boolean(before && after
    && before.albumId != null && before.albumId === after.albumId
    && Number.isFinite(before.trackNumber) && after.trackNumber === before.trackNumber + 1);
}

// Multiplicateur de volume à `position` d'un morceau de `duration` (s).
export function fadeFactor({ position, duration, fade, fadeIn = true, fadeOut = true }) {
  if (!fade || !Number.isFinite(position)) return 1;
  let factor = 1;
  if (fadeIn) factor = Math.min(factor, Math.max(0, position) / fade);
  if (fadeOut && Number.isFinite(duration) && duration > 2 * fade) {
    factor = Math.min(factor, Math.max(0, duration - position) / fade);
  }
  return Math.min(1, Math.max(0, factor));
}
