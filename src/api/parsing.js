// Parsing JSON → modèles (logique pure), portage de api/parsing.py.
//
// Même tolérance que les autres clients : clés inconnues ignorées, champ
// optionnel absent ou null → valeur par défaut, seuls les champs requis (id,
// titre…) lèvent ParseError. Les modèles sont en camelCase côté JavaScript.

export class ParseError extends Error {}

const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);

function requireObject(data, what) {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    const got = data === null ? 'null' : Array.isArray(data) ? 'array' : typeof data;
    throw new ParseError(`${what} : objet JSON attendu, reçu ${got}`);
  }
  return data;
}

function reqInt(data, key, what) {
  const value = data[key];
  if (!isNumber(value)) throw new ParseError(`${what} : champ requis « ${key} » manquant ou non numérique`);
  return Math.trunc(value);
}

function reqStr(data, key, what) {
  const value = data[key];
  if (typeof value !== 'string') throw new ParseError(`${what} : champ requis « ${key} » manquant ou non textuel`);
  return value;
}

const int = (data, key, fallback = 0) => (isNumber(data[key]) ? Math.trunc(data[key]) : fallback);
const optInt = (data, key) => (isNumber(data[key]) ? Math.trunc(data[key]) : null);
const str = (data, key, fallback = '') => (typeof data[key] === 'string' ? data[key] : fallback);
const optStr = (data, key) => (typeof data[key] === 'string' ? data[key] : null);
const bool = (data, key, fallback = false) => (typeof data[key] === 'boolean' ? data[key] : fallback);
const list = (data, key) => (Array.isArray(data[key]) ? data[key] : []);
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function parseServerInfo(data) {
  data = requireObject(data, 'server-info');
  return {
    app: str(data, 'app'),
    name: str(data, 'name'),
    version: str(data, 'version'),
    serverId: str(data, 'server_id'),
    api: str(data, 'api'),
    collection: optStr(data, 'collection'),
    get isJewelbox() { return this.app === 'jewelbox'; },
  };
}

function parseArtist(data) {
  data = requireObject(data, 'artist');
  return { id: reqInt(data, 'id', 'artist'), name: reqStr(data, 'name', 'artist') };
}

function parseLabel(data) {
  data = requireObject(data, 'label');
  return { id: reqInt(data, 'id', 'label'), name: reqStr(data, 'name', 'label') };
}

// ReplayGain d'une piste (serveur >= 1.20) : null si absent ou incomplet.
function parseReplayGain(data) {
  if (!isObject(data)) return null;
  const read = (key) => (isNumber(data[key]) ? data[key] : null);
  return {
    trackGain: read('track_gain'),
    trackPeak: read('track_peak'),
    albumGain: read('album_gain'),
    albumPeak: read('album_peak'),
  };
}

export function parseTrack(data) {
  data = requireObject(data, 'track');
  return {
    id: reqInt(data, 'id', 'track'),
    title: reqStr(data, 'title', 'track'),
    position: int(data, 'position'),
    duration: optStr(data, 'duration'),
    hasFile: bool(data, 'has_file'),
    playCount: int(data, 'play_count'),
    isFavorite: bool(data, 'is_favorite'),
    replayGain: parseReplayGain(data.replaygain),
  };
}

export function parseAlbum(data) {
  data = requireObject(data, 'album');
  return {
    id: reqInt(data, 'id', 'album'),
    title: reqStr(data, 'title', 'album'),
    artist: parseArtist(data.artist),
    year: optInt(data, 'year'),
    genre: optStr(data, 'genre'),
    rating: optInt(data, 'rating'),
    totalDuration: optStr(data, 'total_duration'),
    ean: optStr(data, 'ean'),
    notes: optStr(data, 'notes'),
    coverUrl: optStr(data, 'cover_url'),
    hasAudio: bool(data, 'has_audio'),
    label: isObject(data.label) ? parseLabel(data.label) : null,
    // Présent uniquement sur le détail (GET /api/albums/:id) ; vide en liste.
    tracks: list(data, 'tracks').map(parseTrack),
  };
}

// Piste au format des endpoints de file (playlists, smart, recherche, file) :
// elle porte son album et son artiste. entryId n'existe que dans les playlists
// utilisateur (une piste peut y figurer deux fois).
export function parseQueueTrack(data) {
  data = requireObject(data, 'queue-track');
  return {
    id: reqInt(data, 'id', 'queue-track'),
    title: reqStr(data, 'title', 'queue-track'),
    entryId: optInt(data, 'entry_id'),
    position: int(data, 'position'),
    duration: optStr(data, 'duration'),
    hasFile: bool(data, 'has_file'),
    playCount: int(data, 'play_count'),
    isFavorite: bool(data, 'is_favorite'),
    albumId: int(data, 'album_id'),
    albumTitle: str(data, 'album_title'),
    artistName: str(data, 'artist_name'),
    coverUrl: optStr(data, 'cover_url'),
    replayGain: parseReplayGain(data.replaygain),
  };
}

export function parsePlaylistSummary(data) {
  data = requireObject(data, 'playlist');
  return {
    id: reqInt(data, 'id', 'playlist'),
    name: reqStr(data, 'name', 'playlist'),
    createdAt: optStr(data, 'created_at'),
    updatedAt: optStr(data, 'updated_at'),
    trackCount: int(data, 'track_count'),
    totalDurationSeconds: int(data, 'total_duration_seconds'),
    coverUrl: optStr(data, 'cover_url'),
  };
}

// GET /api/playlists : les lignes vivent sous la clé « data ».
export function parsePlaylists(data) {
  data = requireObject(data, 'playlists');
  return list(data, 'data').map(parsePlaylistSummary);
}

export function parsePlaylist(data) {
  data = requireObject(data, 'playlist');
  return {
    id: reqInt(data, 'id', 'playlist'),
    name: reqStr(data, 'name', 'playlist'),
    createdAt: optStr(data, 'created_at'),
    updatedAt: optStr(data, 'updated_at'),
    tracks: list(data, 'tracks').map(parseQueueTrack),
    // Uniquement dans la réponse de POST /playlists/:id/tracks.
    added: int(data, 'added'),
  };
}

export function parseSmartPlaylists(data) {
  data = requireObject(data, 'smart-playlists');
  return list(data, 'data').map((row) => {
    row = requireObject(row, 'smart-playlist');
    return { key: reqStr(row, 'key', 'smart-playlist'), trackCount: int(row, 'track_count') };
  });
}

export function parseSmartPlaylist(data) {
  data = requireObject(data, 'smart-playlist');
  return { key: str(data, 'key'), tracks: list(data, 'tracks').map(parseQueueTrack) };
}

export function parseDynamicMixPlayed(data) {
  data = requireObject(data, 'dynamic-mix');
  return { removed: bool(data, 'removed'), tracks: list(data, 'tracks').map(parseQueueTrack) };
}

export function parseSearchResults(data) {
  data = requireObject(data, 'search');
  return {
    albums: list(data, 'albums').map(parseAlbum),
    tracks: list(data, 'tracks').map(parseQueueTrack),
  };
}

function parseSmartSummary(data) {
  data = requireObject(data, 'smart');
  return { key: str(data, 'key'), trackCount: int(data, 'track_count') };
}

function parseHomeRecentItem(data) {
  data = requireObject(data, 'home-recent');
  return {
    itemType: str(data, 'item_type'),
    playedAt: optStr(data, 'played_at'),
    album: isObject(data.album) ? parseAlbum(data.album) : null,
    playlist: isObject(data.playlist) ? parsePlaylistSummary(data.playlist) : null,
    smart: isObject(data.smart) ? parseSmartSummary(data.smart) : null,
  };
}

export function parseHome(data) {
  data = requireObject(data, 'home');
  return {
    recent: list(data, 'recent').map(parseHomeRecentItem),
    suggestions: list(data, 'suggestions').map(parseAlbum),
  };
}

export function parseAlbumsPage(data) {
  data = requireObject(data, 'albums');
  const p = isObject(data.pagination) ? data.pagination : {};
  return {
    data: list(data, 'data').map(parseAlbum),
    pagination: {
      total: int(p, 'total'),
      page: int(p, 'page', 1),
      limit: int(p, 'limit', 24),
      // Le serveur envoie ce champ-là en camelCase, fidèle au front web.
      totalPages: int(p, 'totalPages'),
    },
  };
}

export function parseQueueDevices(data) {
  data = requireObject(data, 'queue-devices');
  return list(data, 'data').map((row) => {
    row = requireObject(row, 'queue-device');
    const current = isObject(row.current_track) ? row.current_track : {};
    return {
      deviceId: reqStr(row, 'device_id', 'queue-device'),
      deviceLabel: optStr(row, 'device_label'),
      currentIndex: int(row, 'current_index', -1),
      updatedAt: optStr(row, 'updated_at'),
      trackCount: int(row, 'track_count'),
      sourceLabel: optStr(row, 'source_label'),
      currentTitle: optStr(current, 'title'),
      currentArtist: optStr(current, 'artist_name'),
    };
  });
}

export function parseDeviceQueue(data) {
  data = requireObject(data, 'device-queue');
  return {
    deviceId: reqStr(data, 'device_id', 'device-queue'),
    deviceLabel: optStr(data, 'device_label'),
    currentIndex: int(data, 'current_index', -1),
    positionSec: isNumber(data.position_sec) ? data.position_sec : 0,
    updatedAt: optStr(data, 'updated_at'),
    tracks: list(data, 'tracks').map(parseQueueTrack),
    sourceLabel: optStr(data, 'source_label'),
  };
}

export function parseRadio(data) {
  data = requireObject(data, 'radio');
  const seed = requireObject(data.seed, 'radio-seed');
  return {
    seedType: reqStr(seed, 'type', 'radio-seed'),
    seedName: reqStr(seed, 'name', 'radio-seed'),
    artistName: str(seed, 'artist_name'),
    genre: optStr(seed, 'genre'),
    tracks: list(data, 'tracks').map(parseQueueTrack),
  };
}

// GET /api/albums/genres : chaînes brutes ; vides et non-textes écartés,
// doublons de casse fusionnés (la première graphie gagne).
export function parseGenres(data) {
  if (!Array.isArray(data)) throw new ParseError('genres : liste attendue');
  const seen = new Set();
  const genres = [];
  for (const genre of data) {
    if (typeof genre !== 'string' || !genre.trim()) continue;
    const key = genre.trim().toLocaleLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      genres.push(genre.trim());
    }
  }
  return genres;
}
