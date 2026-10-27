// Normalisation du volume d'après les tags ReplayGain (écrits par JewelBox
// Ripper, lus par le scan du serveur : track.replaygain, gains en dB). Le
// lecteur bureau passe par rgvolume de GStreamer ; ici, comme dans la PWA et
// Android, le gain passe par le volume du lecteur, plafonné à 1 : un master
// fort est baissé, un master faible n'est pas poussé au-delà du plein volume.

export const REPLAYGAIN_MODES = ['off', 'track', 'album'];

// Multiplicateur (0–1] : 1 si désactivé, sans tags ou plus faible.
export function replayGainFactor(replayGain, mode) {
  if (!replayGain || mode === 'off') return 1;
  const gain = mode === 'track'
    ? replayGain.trackGain ?? replayGain.albumGain
    : replayGain.albumGain ?? replayGain.trackGain;
  if (!Number.isFinite(gain)) return 1;
  return Math.min(1, 10 ** (gain / 20));
}
