import { useApp } from '../app/context.jsx';
import { Icon } from './Icon.jsx';

export function EmptyState({ icon, title, description, children }) {
  return (
    <div class="empty-state">
      <Icon name={icon} size={48} class="empty-state__icon" />
      <h2 class="empty-state__title">{title}</h2>
      {description && <p class="empty-state__description">{description}</p>}
      {children}
    </div>
  );
}

// Aucun serveur configuré : chaque onglet affiche ce même message, avec un
// raccourci vers les Paramètres.
export function NoServer() {
  const { navigation } = useApp();
  return (
    <EmptyState
      icon="plug_disconnected"
      title="Aucun serveur configuré"
      description="Indiquez l’adresse de votre serveur JewelBox Music Library pour écouter votre collection."
    >
      <fluent-button appearance="primary" onClick={() => navigation.selectTab('settings')}>Ouvrir les paramètres</fluent-button>
    </EmptyState>
  );
}
