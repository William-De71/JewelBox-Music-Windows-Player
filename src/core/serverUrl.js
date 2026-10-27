// URL du serveur : normalisation et construction d'URL (logique pure).
//
// Portage de core/server_url.py du lecteur bureau : on nettoie l'entrée
// utilisateur, on ajoute http:// si aucun schéma n'est donné, et l'URL de base
// est stockée SANS barre oblique finale (« http://192.168.1.10:3001 »).

export class ServerUrlError extends Error {}

// « 192.168.1.10:3001/ » → « http://192.168.1.10:3001 ». Lève ServerUrlError si
// l'adresse est vide, sans hôte, ou d'un schéma autre que http(s).
export function normalize(rawUrl) {
  let url = (rawUrl ?? '').trim();
  if (!url) throw new ServerUrlError("L'adresse du serveur est vide");
  if (!url.includes('://')) url = `http://${url}`;

  const scheme = url.slice(0, url.indexOf('://')).toLowerCase();
  if (scheme !== 'http' && scheme !== 'https') {
    throw new ServerUrlError(`Schéma non pris en charge : ${scheme}://`);
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new ServerUrlError("L'adresse du serveur n'a pas d'hôte");
  }
  if (!parsed.hostname) throw new ServerUrlError("L'adresse du serveur n'a pas d'hôte");

  return url.replace(/\/+$/, '');
}

// URL absolue d'un endpoint : apiUrl(base, '/api/health'). Les valeurs
// null/undefined de query sont omises, les booléens deviennent « true »/« false »
// comme les attend le serveur Fastify.
export function apiUrl(baseUrl, path, query) {
  let url = baseUrl.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, '');
  if (query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value === null || value === undefined) continue;
      params.append(key, String(value));
    }
    const encoded = params.toString();
    if (encoded) url += `?${encoded}`;
  }
  return url;
}

// Résout une URL renvoyée par le serveur (cover_url) : absolue (pochette
// Discogs/CAA) ou chemin relatif « /covers/42.jpg ». null reste null.
export function resolveUrl(baseUrl, url) {
  if (!url) return null;
  if (url.includes('://')) return url;
  return baseUrl.replace(/\/+$/, '') + '/' + url.replace(/^\/+/, '');
}

export function streamUrl(baseUrl, trackId) {
  return apiUrl(baseUrl, `/api/player/tracks/${encodeURIComponent(String(trackId))}/stream`);
}
