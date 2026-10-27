// Logique pure de la bibliothèque, portage de core/library.py.

// Toute la collection possédée en un seul appel (comme le bureau et Android) :
// pas d'artiste coupé entre deux pages.
export const FETCH_LIMIT = 10000;

export const SORTS = ['artist', 'year'];

// « artist » : A → Z, le serveur ajoute l'année en clé secondaire. « year » :
// plus récents d'abord. Un choix inconnu retombe sur l'artiste.
export function sortParams(sortOrder) {
  return sortOrder === 'year' ? { sort: 'year', order: 'desc' } : { sort: 'artist', order: 'asc' };
}

// Forme comparable : sans casse, sans accents (« Motörhead » → « motorhead »),
// sans espaces superflus.
export function normalize(text) {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');
}

const terms = (query) => normalize(query).split(' ').filter(Boolean);

// Chaque mot de la requête se retrouve (en sous-chaîne, dans n'importe quel
// ordre) dans le titre ou l'artiste : « bride dying » trouve « My Dying Bride »,
// « metal » trouve « Metallica ».
export function matches(album, query) {
  const words = terms(query);
  if (!words.length) return true;
  const haystack = `${normalize(album.title)} ${normalize(album.artist?.name)}`;
  return words.every((word) => haystack.includes(word));
}

export function filterAlbums(albums, query) {
  return albums.filter((album) => matches(album, query));
}

// ── Barre d'initiales ────────────────────────────────────────────────────────

// Chiffres et symboles (« 7th Nemesis ») se rangent sous un même bouton, en tête.
export const OTHER_INITIAL = '#';
export const INITIALS = [OTHER_INITIAL, ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i))];

// Initiale de l'artiste, sans accent (« Ötzi » se range sous O).
export function initialOf(album) {
  const name = normalize(album.artist?.name);
  const first = name.charAt(0).toUpperCase();
  return first >= 'A' && first <= 'Z' && first.length === 1 ? first : OTHER_INITIAL;
}

export function availableInitials(albums) {
  return new Set(albums.map(initialOf));
}

// Position du premier album d'une initiale (liste triée par artiste), ou -1.
export function firstIndexForInitial(albums, initial) {
  return albums.findIndex((album) => initialOf(album) === initial);
}

// ── Vue par artiste ──────────────────────────────────────────────────────────

const byNormalizedName = (a, b) => {
  const left = normalize(a.name);
  const right = normalize(b.name);
  return left < right ? -1 : left > right ? 1 : 0;
};

// Les artistes présents avec leur nombre d'albums, triés par nom normalisé
// (tri stable à nom égal). Chaque entrée garde l'id d'un de ses albums pour
// la radio de l'artiste.
export function artistEntries(albums) {
  const entries = new Map();
  for (const album of albums) {
    const name = album.artist?.name ?? '';
    const entry = entries.get(name);
    if (entry) entry.count += 1;
    else entries.set(name, { name, count: 1, artistId: album.artist?.id ?? null });
  }
  return [...entries.values()].sort(byNormalizedName);
}

export function filterArtistEntries(entries, query) {
  const words = terms(query);
  if (!words.length) return [...entries];
  return entries.filter((entry) => words.every((word) => normalize(entry.name).includes(word)));
}

// Nom exact tel que fourni par le serveur : deux orthographes restent deux
// artistes.
export function albumsByArtist(albums, artistName) {
  return albums.filter((album) => (album.artist?.name ?? '') === artistName);
}

// ── Genres ───────────────────────────────────────────────────────────────────

// Genres présents avec leur nombre d'albums ; les variantes de casse/accents
// fusionnent sous l'orthographe la plus fréquente (à égalité, celle qui
// commence par une majuscule). Albums sans genre ignorés.
export function genreEntries(albums) {
  const groups = new Map();
  for (const album of albums) {
    const genre = (album.genre ?? '').trim();
    if (!genre) continue;
    const key = normalize(genre);
    const spellings = groups.get(key) ?? new Map();
    spellings.set(genre, (spellings.get(genre) ?? 0) + 1);
    groups.set(key, spellings);
  }
  const isUpper = (s) => s.charAt(0) !== s.charAt(0).toLowerCase();
  const entries = [...groups.values()].map((spellings) => {
    let best = null;
    for (const [name, count] of spellings) {
      if (!best || count > spellings.get(best)
        || (count === spellings.get(best) && isUpper(name) && !isUpper(best))) best = name;
    }
    return { name: best, count: [...spellings.values()].reduce((a, b) => a + b, 0) };
  });
  return entries.sort(byNormalizedName);
}

export function albumsByGenre(albums, genre) {
  const key = normalize(genre);
  return albums.filter((album) => normalize((album.genre ?? '').trim()) === key);
}
