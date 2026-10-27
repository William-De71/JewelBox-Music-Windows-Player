// Paroles d'une piste (portage de core/lyrics.py) : le serveur (>= 1.20)
// répond des lignes synchronisées quand il en a (.lrc à côté du fichier, ou
// LRCLIB), sinon un texte brut.

// Avance (secondes) : la mise en avant ne traîne pas derrière la voix.
export const LEAD_SECONDS = 0.3;

// Réponse du serveur → { lines, plain, instrumental, source, synced, empty }.
// Une forme inattendue donne des paroles vides.
export function parseLyrics(payload) {
  const lines = [];
  let plain = null;
  let instrumental = false;
  let source = null;
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    if (payload.synced) {
      for (const line of Array.isArray(payload.lines) ? payload.lines : []) {
        const time = Number(line?.time);
        if (line?.time == null || !Number.isFinite(time)) continue;
        lines.push({ time, text: line.text == null ? '' : String(line.text) });
      }
    }
    lines.sort((a, b) => a.time - b.time);
    plain = typeof payload.plain === 'string' && payload.plain.trim() ? payload.plain : null;
    instrumental = Boolean(payload.instrumental);
    source = typeof payload.source === 'string' ? payload.source : null;
  }
  return {
    lines,
    plain,
    instrumental,
    source,
    synced: lines.length > 0,
    empty: !lines.length && !plain && !instrumental,
  };
}

// La ligne chantée : la dernière commencée à `position`, -1 avant la première.
export function currentLineIndex(lines, position) {
  let lo = 0;
  let hi = lines.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].time <= position + LEAD_SECONDS) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}
