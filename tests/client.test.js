import { describe, expect, it, vi } from 'vitest';
import { ApiError, JewelBoxClient } from '../src/api/client.js';

function fakeFetch(status = 200, body = '') {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300, status, statusText: status === 404 ? 'Not Found' : 'OK',
    text: async () => body,
  }));
}

describe('JewelBoxClient', () => {
  it('normalise l’URL et refuse une adresse vide', () => {
    expect(new JewelBoxClient('njord:3001/').baseUrl).toBe('http://njord:3001');
    expect(() => new JewelBoxClient('')).toThrow();
  });

  it('envoie X-Device-Id et le JSON', async () => {
    const fetchImpl = fakeFetch(204);
    const client = new JewelBoxClient('http://s:3001', { deviceId: 'dev-1', fetchImpl });
    await client.setFavorite(71, true);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://s:3001/api/player/tracks/71/favorite');
    expect(init.method).toBe('PATCH');
    expect(init.headers).toMatchObject({ 'X-Device-Id': 'dev-1', 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body)).toEqual({ is_favorite: true });
  });

  it('GET sans corps ni Content-Type', async () => {
    const fetchImpl = fakeFetch(200, '{"status":"ok"}');
    const client = new JewelBoxClient('http://s:3001', { fetchImpl });
    expect(await client.health()).toBe(true);
    const [, init] = fetchImpl.mock.calls[0];
    expect(init.body).toBeUndefined();
    expect(init.headers).toEqual({});
  });

  it('albums : wanted=false et genre optionnel', async () => {
    const fetchImpl = fakeFetch(200, '{"data":[],"pagination":{}}');
    const client = new JewelBoxClient('http://s:3001', { fetchImpl });
    await client.albums({ page: 2 });
    expect(fetchImpl.mock.calls[0][0]).toBe('http://s:3001/api/albums?page=2&limit=24&sort=artist&order=asc&wanted=false');
    await client.albums({ genre: 'Jazz' });
    expect(fetchImpl.mock.calls[1][0]).toContain('&genre=Jazz');
  });

  it('erreur HTTP → ApiError avec statut', async () => {
    const client = new JewelBoxClient('http://s:3001', { fetchImpl: fakeFetch(404) });
    await expect(client.serverInfo()).rejects.toMatchObject({ status: 404 });
  });

  it('erreur réseau → ApiError statut 0', async () => {
    const client = new JewelBoxClient('http://s:3001', { fetchImpl: vi.fn(async () => { throw new TypeError('Failed to fetch'); }) });
    const error = await client.health().catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(0);
    expect(error.message).toContain('Failed to fetch');
  });

  it('réponse non JSON', async () => {
    const client = new JewelBoxClient('http://s:3001', { fetchImpl: fakeFetch(200, '<html>') });
    await expect(client.health()).rejects.toThrow(/non JSON/);
  });

  it('URL d’ordres à distance et de flux', () => {
    const client = new JewelBoxClient('http://s:3001', { deviceId: 'd 1', fetchImpl: fakeFetch() });
    expect(client.remoteEventsUrl('JewelBox Windows', ['play', 'pause']))
      .toBe('http://s:3001/api/player/remote/events?device_id=d+1&label=JewelBox+Windows&capabilities=play%2Cpause');
    expect(client.streamUrl(5)).toBe('http://s:3001/api/player/tracks/5/stream');
    expect(client.resolveCover('/covers/a.jpg')).toBe('http://s:3001/covers/a.jpg');
  });

  it('écoute signalée en retard', async () => {
    const fetchImpl = fakeFetch(204);
    const client = new JewelBoxClient('http://s:3001', { fetchImpl });
    await client.markPlayed(3);
    expect(fetchImpl.mock.calls[0][1].body).toBeUndefined();
    await client.markPlayed(3, '2026-10-27T08:00:00.000Z');
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual({ played_at: '2026-10-27T08:00:00.000Z' });
  });
});

describe('routes', () => {
  const PLAYLIST = '{"id":1,"name":"P","tracks":[]}';
  const cases = [
    ['genres', (c) => c.genres(), 'GET', '/api/albums/genres', undefined, '["Rock"]'],
    ['album', (c) => c.album(7), 'GET', '/api/albums/7', undefined, '{"id":7,"title":"A","artist":{"id":1,"name":"X"}}'],
    ['radio album', (c) => c.radio({ albumId: 7 }), 'GET', '/api/player/radio?album_id=7', undefined, '{"seed":{"type":"album","name":"A"}}'],
    ['radio artiste', (c) => c.radio({ artistId: 3 }), 'GET', '/api/player/radio?artist_id=3', undefined, '{"seed":{"type":"artist","name":"X"}}'],
    ['accueil', (c) => c.home(200), 'GET', '/api/player/home?smart_limit=200', undefined, '{}'],
    ['accueil sans taille', (c) => c.home(), 'GET', '/api/player/home', undefined, '{}'],
    ['nouvelles suggestions', (c) => c.refreshSuggestions(), 'POST', '/api/player/home/suggestions', undefined, '{"suggestions":[]}'],
    ['recherche', (c) => c.search('air'), 'GET', '/api/player/search?q=air', undefined, '{}'],
    ['historique', (c) => c.reportPlay('album', 7), 'POST', '/api/player/history', { item_type: 'album', item_id: 7 }, ''],
    ['historique smart', (c) => c.reportSmartPlay('favourites'), 'POST', '/api/player/history', { item_type: 'smart', item_key: 'favourites' }, ''],
    ['paroles', (c) => c.lyrics(5), 'GET', '/api/player/tracks/5/lyrics', undefined, '{}'],
    ['piste', (c) => c.track(5), 'GET', '/api/player/tracks/5', undefined, '{"id":5,"title":"T"}'],
    ['playlists', (c) => c.playlists(), 'GET', '/api/playlists', undefined, '{"data":[]}'],
    ['playlist', (c) => c.playlist(1), 'GET', '/api/playlists/1', undefined, PLAYLIST],
    ['créer', (c) => c.createPlaylist('P'), 'POST', '/api/playlists', { name: 'P' }, PLAYLIST],
    ['renommer', (c) => c.renamePlaylist(1, 'Q'), 'PATCH', '/api/playlists/1', { name: 'Q' }, PLAYLIST],
    ['supprimer', (c) => c.deletePlaylist(1), 'DELETE', '/api/playlists/1', undefined, ''],
    ['ajout piste', (c) => c.addTrackToPlaylist(1, 5), 'POST', '/api/playlists/1/tracks', { track_id: 5 }, PLAYLIST],
    ['ajout album', (c) => c.addAlbumToPlaylist(1, 7), 'POST', '/api/playlists/1/tracks', { album_id: 7 }, PLAYLIST],
    ['retrait', (c) => c.removePlaylistEntry(1, 9), 'DELETE', '/api/playlists/1/tracks/9', undefined, PLAYLIST],
    ['réordonner', (c) => c.reorderPlaylist(1, [3, 2]), 'PUT', '/api/playlists/1/tracks', { entry_ids: [3, 2] }, PLAYLIST],
    ['smart', (c) => c.smartPlaylists(50), 'GET', '/api/smart-playlists?limit=50', undefined, '{"data":[]}'],
    ['une smart', (c) => c.smartPlaylist('favourites'), 'GET', '/api/smart-playlists/favourites', undefined, '{}'],
    ['mix joué', (c) => c.dynamicMixPlayed(5), 'POST', '/api/smart-playlists/dynamic_mix/played', { track_id: 5 }, '{}'],
    ['mix relancé', (c) => c.dynamicMixRefresh(), 'POST', '/api/smart-playlists/dynamic_mix/refresh', undefined, '{}'],
    ['mix retrait', (c) => c.dynamicMixRemove(5), 'DELETE', '/api/smart-playlists/dynamic_mix/tracks/5', undefined, '{}'],
    ['mix liste noire', (c) => c.dynamicMixBlock(5), 'POST', '/api/smart-playlists/dynamic_mix/blocked', { track_id: 5 }, '{}'],
    ['mix titres exclus', (c) => c.dynamicMixBlocked(), 'GET', '/api/smart-playlists/dynamic_mix/blocked', undefined, '{"data":[]}'],
    ['mix liste noire vidée', (c) => c.dynamicMixClearBlocked(), 'DELETE', '/api/smart-playlists/dynamic_mix/blocked', undefined, '{"cleared":0}'],
    ['file', (c) => c.saveQueue({ trackIds: [1, 2], currentIndex: 1, positionSec: 3, deviceLabel: 'W' }), 'PUT', '/api/player/queue',
      { track_ids: [1, 2], current_index: 1, position_sec: 3, device_label: 'W', source_label: null }, ''],
    ['état', (c) => c.updateQueueState(1, 4), 'PATCH', '/api/player/queue/state', { current_index: 1, position_sec: 4 }, ''],
    ['état en direct', (c) => c.reportLiveState({ playback_state: 'idle' }), 'PATCH', '/api/player/queue/state', { playback_state: 'idle' }, ''],
    ['vider', (c) => c.clearQueue(), 'DELETE', '/api/player/queue', undefined, ''],
    ['ma file', (c) => c.ownQueue(), 'GET', '/api/player/queue', undefined, '{"device_id":"d"}'],
    ['appareils', (c) => c.queueDevices(), 'GET', '/api/player/queue/devices', undefined, '{"data":[]}'],
    ['file d’un appareil', (c) => c.deviceQueue('a b'), 'GET', '/api/player/queue/devices/a%20b', undefined, '{"device_id":"a b"}'],
    ['now playing', (c) => c.nowPlaying(5), 'POST', '/api/lastfm/nowplaying', { track_id: 5 }, ''],
    ['scrobble', (c) => c.scrobble(5, 1000), 'POST', '/api/lastfm/scrobble', { track_id: 5, started_at: 1000 }, ''],
  ];
  it.each(cases)('%s', async (_name, call, method, path, body, response) => {
    const fetchImpl = fakeFetch(200, response);
    await call(new JewelBoxClient('http://s:3001', { fetchImpl }));
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`http://s:3001${path}`);
    expect(init.method).toBe(method);
    expect(init.body === undefined ? undefined : JSON.parse(init.body)).toEqual(body);
  });
  it('délai dépassé', async () => {
    const timeout = Object.assign(new Error('t'), { name: 'TimeoutError' });
    const client = new JewelBoxClient('http://s:3001', { fetchImpl: vi.fn(async () => { throw timeout; }) });
    await expect(client.health()).rejects.toThrow(/délai dépassé/);
  });
});
