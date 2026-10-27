// Client HTTP du serveur JewelBox, portage de api/client.py (fetch).
//
// Tout le parsing vit dans parsing.js. Délai généreux : à travers un VPN le
// lien est plus lent et moins stable que sur le LAN, et on ne fait ici que de
// petits JSON.

import * as parsing from './parsing.js';
import * as serverUrl from '../core/serverUrl.js';

const TIMEOUT_MS = 15000;

// Échec d'un appel serveur : réseau, HTTP non-2xx ou JSON invalide. status vaut
// 0 quand la requête n'a pas abouti (pas de réponse HTTP).
export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status;
  }
}

const rankingQuery = (size) => (size == null ? undefined : { limit: size });

// Un client = un serveur. On le reconstruit quand l'URL change.
export class JewelBoxClient {
  constructor(baseUrl, { deviceId = '', fetchImpl } = {}) {
    this.baseUrl = serverUrl.normalize(baseUrl);
    this.deviceId = deviceId;
    this._fetch = fetchImpl ?? ((...args) => fetch(...args));
  }

  // ── Transport ──────────────────────────────────────────────────────────────

  async _request(method, path, { query, body } = {}) {
    const url = serverUrl.apiUrl(this.baseUrl, path, query);
    const headers = {};
    if (this.deviceId) headers['X-Device-Id'] = this.deviceId;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    let response;
    try {
      response = await this._fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      const reason = error?.name === 'TimeoutError' ? 'délai dépassé' : (error?.message || 'réseau injoignable');
      throw new ApiError(`${url} : ${reason}`);
    }

    if (!response.ok) {
      throw new ApiError(`${url} : ${response.status} ${response.statusText || 'erreur HTTP'}`, response.status);
    }
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      throw new ApiError(`${url} : réponse non JSON`, response.status);
    }
  }

  _get(path, query) { return this._request('GET', path, { query }); }
  _post(path, body) { return this._request('POST', path, { body }); }
  _patch(path, body) { return this._request('PATCH', path, { body }); }
  _put(path, body) { return this._request('PUT', path, { body }); }
  _delete(path) { return this._request('DELETE', path); }

  // ── Serveur ────────────────────────────────────────────────────────────────

  async health() {
    const data = await this._get('/api/health');
    return data?.status === 'ok';
  }

  // Identité du serveur (serveur >= 1.12 ; 404 avant).
  async serverInfo() {
    return parsing.parseServerInfo(await this._get('/api/server-info'));
  }

  // ── Bibliothèque ───────────────────────────────────────────────────────────

  // Page d'albums possédés (wanted=false exclut la liste de souhaits). Tri
  // artist : le serveur ajoute l'année en clé secondaire.
  async albums({ page = 1, limit = 24, sort = 'artist', order = 'asc', genre } = {}) {
    const query = { page, limit, sort, order, wanted: false, genre: genre || undefined };
    return parsing.parseAlbumsPage(await this._get('/api/albums', query));
  }

  async genres() {
    return parsing.parseGenres(await this._get('/api/albums/genres'));
  }

  async album(albumId) {
    return parsing.parseAlbum(await this._get(`/api/albums/${albumId}`));
  }

  // Radio autour d'un album ou d'un artiste (un seul des deux).
  async radio({ albumId, artistId }) {
    const query = albumId != null ? { album_id: albumId } : { artist_id: artistId };
    return parsing.parseRadio(await this._get('/api/player/radio', query));
  }

  // ── Accueil, recherche ─────────────────────────────────────────────────────

  async home(rankingSize) {
    const query = rankingSize == null ? undefined : { smart_limit: rankingSize };
    return parsing.parseHome(await this._get('/api/player/home', query));
  }

  async search(q) {
    return parsing.parseSearchResults(await this._get('/api/player/search', { q }));
  }

  // Début de lecture d'un album/playlist (alimente les récents de l'accueil).
  async reportPlay(itemType, itemId) {
    await this._post('/api/player/history', { item_type: itemType, item_id: itemId });
  }

  async reportSmartPlay(key) {
    await this._post('/api/player/history', { item_type: 'smart', item_key: key });
  }

  // ── Pistes ─────────────────────────────────────────────────────────────────

  streamUrl(trackId) { return serverUrl.streamUrl(this.baseUrl, trackId); }

  resolveCover(coverUrl) { return serverUrl.resolveUrl(this.baseUrl, coverUrl); }

  // Compteur local (play_count/last_played_at), indépendant de Last.fm.
  // playedAt : date ISO d'une écoute signalée en retard (serveur >= 1.20).
  async markPlayed(trackId, playedAt) {
    await this._post(`/api/player/tracks/${trackId}/played`, playedAt ? { played_at: playedAt } : undefined);
  }

  async setFavorite(trackId, isFavorite) {
    await this._patch(`/api/player/tracks/${trackId}/favorite`, { is_favorite: isFavorite });
  }

  // Paroles brutes (serveur >= 1.20), lues par core/lyrics.js.
  async lyrics(trackId) {
    return this._get(`/api/player/tracks/${trackId}/lyrics`);
  }

  // Une piste au format QueueTrack (serveur >= 1.18).
  async track(trackId) {
    return parsing.parseQueueTrack(await this._get(`/api/player/tracks/${trackId}`));
  }

  // ── Playlists utilisateur ──────────────────────────────────────────────────

  async playlists() { return parsing.parsePlaylists(await this._get('/api/playlists')); }

  async playlist(id) { return parsing.parsePlaylist(await this._get(`/api/playlists/${id}`)); }

  async createPlaylist(name) { return parsing.parsePlaylist(await this._post('/api/playlists', { name })); }

  async renamePlaylist(id, name) { return parsing.parsePlaylist(await this._patch(`/api/playlists/${id}`, { name })); }

  async deletePlaylist(id) { await this._delete(`/api/playlists/${id}`); }

  async addTrackToPlaylist(id, trackId) {
    return parsing.parsePlaylist(await this._post(`/api/playlists/${id}/tracks`, { track_id: trackId }));
  }

  async addAlbumToPlaylist(id, albumId) {
    return parsing.parsePlaylist(await this._post(`/api/playlists/${id}/tracks`, { album_id: albumId }));
  }

  async removePlaylistEntry(id, entryId) {
    return parsing.parsePlaylist(await this._delete(`/api/playlists/${id}/tracks/${entryId}`));
  }

  // Réordonnancement complet : tous les entry_id dans le nouvel ordre.
  async reorderPlaylist(id, entryIds) {
    return parsing.parsePlaylist(await this._put(`/api/playlists/${id}/tracks`, { entry_ids: [...entryIds] }));
  }

  // ── Smart playlists ────────────────────────────────────────────────────────

  // rankingSize : taille des classements « top N » ; un serveur qui ne
  // connaît pas ?limit= l'ignore et garde ses 100 pistes.
  async smartPlaylists(rankingSize) {
    return parsing.parseSmartPlaylists(await this._get('/api/smart-playlists', rankingQuery(rankingSize)));
  }

  async smartPlaylist(key, rankingSize) {
    return parsing.parseSmartPlaylist(await this._get(`/api/smart-playlists/${key}`, rankingQuery(rankingSize)));
  }

  // Piste du mix terminée : le serveur tourne et recomplète la liste.
  async dynamicMixPlayed(trackId) {
    return parsing.parseDynamicMixPlayed(await this._post('/api/smart-playlists/dynamic_mix/played', { track_id: trackId }));
  }

  async dynamicMixRefresh() {
    return parsing.parseSmartPlaylist(await this._post('/api/smart-playlists/dynamic_mix/refresh'));
  }

  async dynamicMixRemove(trackId) {
    return parsing.parseDynamicMixPlayed(await this._delete(`/api/smart-playlists/dynamic_mix/tracks/${trackId}`));
  }

  // ── File partagée entre appareils (X-Device-Id) ────────────────────────────

  async saveQueue({ trackIds, currentIndex, positionSec, deviceLabel, sourceLabel = null }) {
    await this._put('/api/player/queue', {
      track_ids: [...trackIds], current_index: currentIndex, position_sec: positionSec,
      device_label: deviceLabel, source_label: sourceLabel,
    });
  }

  async updateQueueState(currentIndex, positionSec) {
    await this._patch('/api/player/queue/state', { current_index: currentIndex, position_sec: positionSec });
  }

  // État en direct (contrôle à distance) : même route que la progression, un
  // serveur < 1.18 garde la position et ignore le reste.
  async reportLiveState(body) {
    await this._patch('/api/player/queue/state', body);
  }

  async clearQueue() { await this._delete('/api/player/queue'); }

  async ownQueue() { return parsing.parseDeviceQueue(await this._get('/api/player/queue')); }

  async queueDevices() { return parsing.parseQueueDevices(await this._get('/api/player/queue/devices')); }

  async deviceQueue(deviceId) {
    return parsing.parseDeviceQueue(await this._get(`/api/player/queue/devices/${encodeURIComponent(deviceId)}`));
  }

  // URL du flux d'ordres à distance (text/event-stream), lu par remote.js.
  remoteEventsUrl(label, capabilities) {
    return serverUrl.apiUrl(this.baseUrl, '/api/player/remote/events', {
      device_id: this.deviceId, label, capabilities: capabilities.join(','),
    });
  }

  // ── Last.fm (204 même sans scrobbling configuré) ───────────────────────────

  async nowPlaying(trackId) { await this._post('/api/lastfm/nowplaying', { track_id: trackId }); }

  async scrobble(trackId, startedAt) {
    await this._post('/api/lastfm/scrobble', { track_id: trackId, started_at: startedAt });
  }
}
