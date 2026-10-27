// Volet de navigation à gauche, comme le NavigationView des applis Windows 11
// (Lecteur multimédia, Paramètres) : quatre onglets en haut, Paramètres en bas.
// Fenêtre étroite : le volet se réduit aux icônes.

import { useActions } from '../app/actions.jsx';
import { useApp } from '../app/context.jsx';
import { Icon } from './Icon.jsx';
import { ResumeDialog } from './ResumeDialog.jsx';

const ITEMS = [
  { tab: 'home', label: 'Accueil', icon: 'home' },
  { tab: 'library', label: 'Bibliothèque', icon: 'library' },
  { tab: 'search', label: 'Recherche', icon: 'search' },
  { tab: 'playlists', label: 'Playlists', icon: 'list' },
];

function NavItem({ item, active, onSelect }) {
  return (
    <button
      type="button"
      class={`nav-item ${active ? 'nav-item--active' : ''}`}
      aria-current={active ? 'page' : undefined}
      title={item.label}
      onClick={() => onSelect(item.tab)}
    >
      <Icon name={item.icon} filled={active} />
      <span class="nav-item__label">{item.label}</span>
    </button>
  );
}

export function NavPane() {
  const { navigation, client } = useApp();
  const { openDialog, resumeDevice } = useActions();
  const openResume = () => openDialog((close) => <ResumeDialog client={client} resumeDevice={resumeDevice} onClose={close} />);
  return (
    <nav class="nav-pane" aria-label="Navigation">
      <div class="nav-pane__items">
        {ITEMS.map((item) => (
          <NavItem key={item.tab} item={item} active={navigation.tab === item.tab} onSelect={navigation.selectTab} />
        ))}
      </div>
      <div class="nav-pane__footer">
        <button type="button" class="nav-item" title="Reprendre depuis un autre appareil…" onClick={openResume}>
          <Icon name="phone_laptop" />
          <span class="nav-item__label">Reprendre…</span>
        </button>
        <NavItem
          item={{ tab: 'settings', label: 'Paramètres', icon: 'settings' }}
          active={navigation.tab === 'settings'}
          onSelect={navigation.selectTab}
        />
      </div>
    </nav>
  );
}
