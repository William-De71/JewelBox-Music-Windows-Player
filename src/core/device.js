// Identité de l'appareil (logique pure).
//
// UUID généré au premier lancement, envoyé au serveur dans l'en-tête
// X-Device-Id (file de lecture par appareil). Il n'est JAMAIS régénéré tant
// qu'une valeur existe : le serveur s'en sert pour retrouver la file.

export function ensureDeviceId(current, randomUUID = () => crypto.randomUUID()) {
  const existing = (current ?? '').trim();
  return existing || randomUUID();
}

// Nom affiché aux autres appareils (« Reprendre depuis… », Gladys), sur le
// modèle « JewelBox bureau · <hôte> » du lecteur Linux.
export function deviceLabel(hostname) {
  const host = (hostname ?? '').trim();
  return host ? `JewelBox Windows · ${host}` : 'JewelBox Windows';
}
