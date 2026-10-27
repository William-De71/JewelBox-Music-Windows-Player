// Réglages de l'application : les mêmes clés que le schéma GSettings du
// lecteur bureau (io.github.william_de71.JewelBox.gschema.xml), avec les mêmes
// valeurs par défaut. Persistés dans le stockage du WebView (un fichier par
// utilisateur Windows) ; si le stockage est refusé, ils vivent le temps de la
// session, comme le repli mémoire du mode développement côté bureau.

const STORAGE_KEY = 'jewelbox-settings';

export const DEFAULTS = Object.freeze({
  'server-url': '',
  'server-id': '',
  'device-id': '',
  'sort-order': 'artist',
  'group-by-artist': false,
  'background-playback': true,
  'remote-control': true,
  'notify-track-change': true,
  replaygain: 'album',
  'transition-fade': 0,
  'smart-ranking-size': 100,
});

export function createSettings(storage = globalThis.localStorage) {
  let values = { ...DEFAULTS };
  try {
    const saved = JSON.parse(storage?.getItem(STORAGE_KEY) ?? '{}');
    if (saved && typeof saved === 'object') {
      for (const key of Object.keys(DEFAULTS)) {
        // Une valeur d'un autre type (fichier édité à la main) retombe sur le défaut.
        if (key in saved && typeof saved[key] === typeof DEFAULTS[key]) values[key] = saved[key];
      }
    }
  } catch { /* stockage illisible : défauts */ }

  const listeners = new Set();

  function persist() {
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify(values));
    } catch { /* stockage refusé : la valeur vit le temps de la session */ }
  }

  return {
    get(key) {
      if (!(key in DEFAULTS)) throw new Error(`Réglage inconnu : ${key}`);
      return values[key];
    },
    set(key, value) {
      if (!(key in DEFAULTS)) throw new Error(`Réglage inconnu : ${key}`);
      if (typeof value !== typeof DEFAULTS[key]) throw new TypeError(`Réglage ${key} : type ${typeof DEFAULTS[key]} attendu`);
      if (values[key] === value) return;
      values = { ...values, [key]: value };
      persist();
      for (const listener of listeners) listener(key, value);
    },
    // Abonnement à tout changement (key, value) ; renvoie le désabonnement.
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
