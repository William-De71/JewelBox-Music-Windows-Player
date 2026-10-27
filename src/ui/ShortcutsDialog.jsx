// Aide des raccourcis clavier (Ctrl+? ou Paramètres).

import { GENERAL_SHORTCUTS, PLAYBACK_SHORTCUTS } from '../core/shortcuts.js';
import { Dialog } from './Dialog.jsx';

function Section({ title, items }) {
  return (
    <section class="shortcuts__section">
      <h3 class="shortcuts__title">{title}</h3>
      {items.map((item) => (
        <div key={item.action} class="shortcuts__row">
          <span>{item.title}</span>
          <span class="shortcuts__keys">{item.label.split('+').map((part) => <kbd key={part}>{part}</kbd>)}</span>
        </div>
      ))}
    </section>
  );
}

export function ShortcutsDialog({ onClose }) {
  return (
    <Dialog title="Raccourcis clavier" onClose={onClose} width={460} footer={<fluent-button onClick={onClose}>Fermer</fluent-button>}>
      <Section title="Lecture" items={PLAYBACK_SHORTCUTS} />
      <Section title="Général" items={[...GENERAL_SHORTCUTS, { action: 'back', title: 'Retour', label: 'Échap' }]} />
    </Dialog>
  );
}
