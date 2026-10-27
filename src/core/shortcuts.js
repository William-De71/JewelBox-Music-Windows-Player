// Raccourcis clavier : la table de référence (mêmes combinaisons que le
// lecteur bureau, elles-mêmes celles de GNOME Musique), lue par le
// gestionnaire de touches, les infobulles et la fenêtre d'aide.

export const PLAYBACK_SHORTCUTS = [
  { action: 'play-pause', key: ' ', label: 'Ctrl+Espace', title: 'Lecture / pause' },
  { action: 'next', key: 'n', label: 'Ctrl+N', title: 'Piste suivante' },
  { action: 'previous', key: 'b', label: 'Ctrl+B', title: 'Piste précédente' },
  { action: 'toggle-shuffle', key: 's', label: 'Ctrl+S', title: 'Lecture aléatoire' },
  { action: 'cycle-repeat', key: 'r', label: 'Ctrl+R', title: 'Mode répétition' },
  { action: 'toggle-favorite', key: 'd', label: 'Ctrl+D', title: 'Ajouter / retirer des favoris' },
];

export const GENERAL_SHORTCUTS = [
  { action: 'search', key: 'f', label: 'Ctrl+F', title: 'Rechercher' },
  { action: 'preferences', key: ',', label: 'Ctrl+,', title: 'Paramètres' },
  { action: 'shortcuts', key: '?', label: 'Ctrl+?', title: 'Raccourcis clavier' },
  { action: 'quit', key: 'q', label: 'Ctrl+Q', title: 'Quitter' },
];

const ALL = [...PLAYBACK_SHORTCUTS, ...GENERAL_SHORTCUTS];

// L'action d'une touche pressée, ou null. Ctrl seul (pas Alt) ; Maj est
// toléré pour « ? », qui l'exige sur la plupart des claviers.
export function shortcutAction(event) {
  if (!event.ctrlKey || event.altKey || event.metaKey) return null;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  const match = ALL.find((shortcut) => shortcut.key === key);
  if (!match) return null;
  if (event.shiftKey && match.key !== '?') return null;
  return match.action;
}
