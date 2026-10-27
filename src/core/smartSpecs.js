// Listes intelligentes : clé, icône, libellé (portage de ui/smart_specs.py).
// L'ordre est celui d'affichage, miroir de DEFINITIONS côté serveur ; une clé
// inconnue renvoyée par un serveur plus récent est simplement ignorée.

import { DYNAMIC_MIX_KEY } from './dynamicMix.js';

export const SMART_SPECS = [
  { key: 'newest', icon: 'star', label: 'Ajouts récents' },
  { key: 'ever_played', icon: 'history', label: 'Déjà écoutées' },
  { key: 'never_played', icon: 'music_note_off_1', label: 'Jamais écoutées' },
  { key: 'last_played', icon: 'clock', label: 'Écoutées récemment' },
  { key: 'most_played', icon: 'text_number_list_ltr', label: 'Les plus écoutées' },
  { key: 'favourites', icon: 'heart', label: 'Favoris' },
  { key: 'all_tracks', icon: 'folder', label: 'Toutes les pistes' },
  { key: DYNAMIC_MIX_KEY, icon: 'arrow_shuffle', label: 'Mix dynamique' },
];

export function smartSpec(key) {
  return SMART_SPECS.find((spec) => spec.key === key) ?? null;
}
