import { describe, expect, it } from 'vitest';
import * as parsing from '../src/api/parsing.js';
import { ParseError } from '../src/api/parsing.js';

const FULL_ALBUM = {
  id: 7, title: 'Moon Safari', year: 1998, genre: 'Electro', rating: 5,
  total_duration: '43:47', ean: '724384497820', notes: 'Édition originale',
  cover_url: '/covers/7.jpg', has_audio: true,
  artist: { id: 3, name: 'Air' }, label: { id: 2, name: 'Virgin' },
  tracks: [
    { id: 71, position: 1, title: 'La femme d’argent', duration: '7:11', has_file: true, play_count: 4, is_favorite: true,
      replaygain: { track_gain: -6.5, track_peak: 0.98, album_gain: -7.1, album_peak: 1 } },
    { id: 72, position: 2, title: 'Sexy Boy', duration: '4:58' },
  ],
};

const QUEUE_TRACK = {
  id: 71, entry_id: 12, position: 1, title: 'La femme d’argent', duration: '7:11',
  has_file: true, play_count: 4, is_favorite: true, album_id: 7,
  album_title: 'Moon Safari', artist_name: 'Air', cover_url: '/covers/7.jpg', inconnue: 'ignorée',
};

describe('server-info', () => {
  it('complet', () => {
    const info = parsing.parseServerInfo({ app: 'jewelbox', name: 'Salon', version: '1.12.0', server_id: 'abc', api: 'v1', collection: 'CD' });
    expect(info).toMatchObject({ app: 'jewelbox', name: 'Salon', version: '1.12.0', serverId: 'abc', collection: 'CD' });
    expect(info.isJewelbox).toBe(true);
  });
  it('vide → défauts, squatteur refusé', () => {
    expect(parsing.parseServerInfo({}).collection).toBeNull();
    expect(parsing.parseServerInfo({ app: 'autre' }).isJewelbox).toBe(false);
  });
  it('pas un objet', () => {
    expect(() => parsing.parseServerInfo([])).toThrow(ParseError);
    expect(() => parsing.parseServerInfo(null)).toThrow(ParseError);
  });
});

describe('album', () => {
  it('complet', () => {
    const album = parsing.parseAlbum(FULL_ALBUM);
    expect(album).toMatchObject({ id: 7, title: 'Moon Safari', year: 1998, coverUrl: '/covers/7.jpg', hasAudio: true });
    expect(album.artist).toEqual({ id: 3, name: 'Air' });
    expect(album.label).toEqual({ id: 2, name: 'Virgin' });
    expect(album.tracks).toHaveLength(2);
    expect(album.tracks[0]).toMatchObject({ isFavorite: true, playCount: 4 });
    expect(album.tracks[0].replayGain).toEqual({ trackGain: -6.5, trackPeak: 0.98, albumGain: -7.1, albumPeak: 1 });
    expect(album.tracks[1]).toMatchObject({ hasFile: false, playCount: 0, isFavorite: false, replayGain: null });
  });
  it('champs optionnels null', () => {
    const album = parsing.parseAlbum({ id: 1, title: 'X', artist: { id: 1, name: 'Y' }, year: null, label: null, tracks: null });
    expect(album).toMatchObject({ year: null, label: null, tracks: [] });
  });
  it('requis manquants', () => {
    expect(() => parsing.parseAlbum({ title: 'X', artist: { id: 1, name: 'Y' } })).toThrow(/« id »/);
    expect(() => parsing.parseAlbum({ id: 1, title: 'X' })).toThrow(ParseError);
    expect(() => parsing.parseAlbum({ id: true, title: 'X', artist: { id: 1, name: 'Y' } })).toThrow(ParseError);
    expect(() => parsing.parseAlbum({ id: 1, title: 2, artist: { id: 1, name: 'Y' } })).toThrow(/non textuel/);
  });
});

describe('pistes de file et playlists', () => {
  it('queue track', () => {
    expect(parsing.parseQueueTrack(QUEUE_TRACK)).toMatchObject({
      id: 71, entryId: 12, albumId: 7, albumTitle: 'Moon Safari', artistName: 'Air', coverUrl: '/covers/7.jpg',
    });
    expect(parsing.parseQueueTrack({ id: 1, title: 'T' })).toMatchObject({ entryId: null, albumId: 0, artistName: '' });
  });
  it('playlists', () => {
    const rows = parsing.parsePlaylists({ data: [{ id: 1, name: 'Soir', track_count: 3, total_duration_seconds: 600 }] });
    expect(rows[0]).toMatchObject({ id: 1, name: 'Soir', trackCount: 3, totalDurationSeconds: 600, coverUrl: null });
    expect(parsing.parsePlaylists({})).toEqual([]);
    const playlist = parsing.parsePlaylist({ id: 1, name: 'Soir', tracks: [QUEUE_TRACK], added: 2 });
    expect(playlist.tracks[0].entryId).toBe(12);
    expect(playlist.added).toBe(2);
  });
  it('smart', () => {
    expect(parsing.parseSmartPlaylists({ data: [{ key: 'favorites', track_count: 5 }] })).toEqual([{ key: 'favorites', trackCount: 5 }]);
    expect(() => parsing.parseSmartPlaylists({ data: [{}] })).toThrow(ParseError);
    expect(parsing.parseSmartPlaylist({ key: 'dynamic_mix', tracks: [QUEUE_TRACK] }).tracks).toHaveLength(1);
    expect(parsing.parseDynamicMixPlayed({ removed: true, tracks: [] })).toEqual({ removed: true, tracks: [] });
  });
});

describe('accueil, recherche, bibliothèque', () => {
  it('accueil', () => {
    const home = parsing.parseHome({
      recent: [
        { item_type: 'album', played_at: '2026-10-27 10:00:00', album: FULL_ALBUM },
        { item_type: 'playlist', playlist: { id: 2, name: 'P', cover_url: '/covers/x.jpg' } },
        { item_type: 'smart', smart: { key: 'favorites', track_count: 9 } },
      ],
      suggestions: [FULL_ALBUM],
    });
    expect(home.recent.map((r) => r.itemType)).toEqual(['album', 'playlist', 'smart']);
    expect(home.recent[1].playlist.coverUrl).toBe('/covers/x.jpg');
    expect(home.recent[2].smart).toEqual({ key: 'favorites', trackCount: 9 });
    expect(home.recent[0].playlist).toBeNull();
    expect(home.suggestions).toHaveLength(1);
  });
  it('recherche', () => {
    const res = parsing.parseSearchResults({ albums: [FULL_ALBUM], tracks: [QUEUE_TRACK] });
    expect(res.albums).toHaveLength(1);
    expect(res.tracks).toHaveLength(1);
    expect(parsing.parseSearchResults({})).toEqual({ albums: [], tracks: [] });
  });
  it('page d’albums', () => {
    const page = parsing.parseAlbumsPage({ data: [FULL_ALBUM], pagination: { total: 30, page: 2, limit: 24, totalPages: 2 } });
    expect(page.pagination).toEqual({ total: 30, page: 2, limit: 24, totalPages: 2 });
    expect(parsing.parseAlbumsPage({}).pagination).toEqual({ total: 0, page: 1, limit: 24, totalPages: 0 });
  });
  it('genres', () => {
    expect(parsing.parseGenres(['Rock', ' rock ', '', 3, 'Jazz', 'JAZZ'])).toEqual(['Rock', 'Jazz']);
    expect(() => parsing.parseGenres({})).toThrow(ParseError);
  });
  it('radio', () => {
    const radio = parsing.parseRadio({ seed: { type: 'album', name: 'Moon Safari', artist_name: 'Air' }, tracks: [QUEUE_TRACK] });
    expect(radio).toMatchObject({ seedType: 'album', seedName: 'Moon Safari', artistName: 'Air', genre: null });
    expect(() => parsing.parseRadio({})).toThrow(ParseError);
  });
});

describe('files des appareils', () => {
  it('liste', () => {
    const [device] = parsing.parseQueueDevices({ data: [{
      device_id: 'abc', device_label: 'JewelBox Android · Pixel', current_index: 2, updated_at: '2026-10-27 09:00:00',
      track_count: 12, source_label: 'Moon Safari', current_track: { title: 'Sexy Boy', artist_name: 'Air' },
    }] });
    expect(device).toMatchObject({ deviceId: 'abc', currentIndex: 2, trackCount: 12, currentTitle: 'Sexy Boy', currentArtist: 'Air' });
    const [bare] = parsing.parseQueueDevices({ data: [{ device_id: 'x' }] });
    expect(bare).toMatchObject({ currentIndex: -1, currentTitle: null, sourceLabel: null });
  });
  it('détail', () => {
    const queue = parsing.parseDeviceQueue({ device_id: 'abc', current_index: 1, position_sec: 42.5, tracks: [QUEUE_TRACK] });
    expect(queue).toMatchObject({ deviceId: 'abc', currentIndex: 1, positionSec: 42.5 });
    expect(parsing.parseDeviceQueue({ device_id: 'abc', position_sec: true }).positionSec).toBe(0);
    expect(() => parsing.parseDeviceQueue({})).toThrow(ParseError);
  });
});
