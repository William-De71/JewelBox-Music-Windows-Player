// Petites boîtes de dialogue : saisir un nom, confirmer une suppression.

import { useState } from 'preact/hooks';
import { Dialog } from './Dialog.jsx';
import { TextInput } from './controls.jsx';

export function TextPrompt({ title, description, initial = '', confirmLabel, onConfirm, onClose }) {
  const [value, setValue] = useState(initial);
  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onClose();
    onConfirm(trimmed);
  };
  return (
    <Dialog
      title={title}
      onClose={onClose}
      footer={(
        <>
          <fluent-button appearance="primary" disabled={!value.trim() || undefined} onClick={submit}>{confirmLabel}</fluent-button>
          <fluent-button onClick={onClose}>Annuler</fluent-button>
        </>
      )}
    >
      {description && <p class="muted dialog__description">{description}</p>}
      <TextInput value={value} label={title} onInput={setValue} onEnter={submit} autofocus />
    </Dialog>
  );
}

export function ConfirmDelete({ title, body, onConfirm, onClose }) {
  return (
    <Dialog
      title={title}
      onClose={onClose}
      footer={(
        <>
          <fluent-button appearance="primary" class="button--danger" onClick={() => { onClose(); onConfirm(); }}>Supprimer</fluent-button>
          <fluent-button onClick={onClose}>Annuler</fluent-button>
        </>
      )}
    >
      <p class="dialog__description">{body}</p>
    </Dialog>
  );
}
