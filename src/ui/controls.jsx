// Enveloppes Preact des web components Fluent : l'état (checked, value) est
// posé en propriété DOM et les événements écoutés directement, ce qui évite
// les écarts de nommage entre Preact et les custom elements.

import { useEffect, useRef } from 'preact/hooks';

function useElementEvent(ref, type, handler) {
  const saved = useRef(handler);
  saved.current = handler;
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const listener = (event) => saved.current?.(event);
    element.addEventListener(type, listener);
    return () => element.removeEventListener(type, listener);
  }, [ref, type]);
}

export function Switch({ checked, onChange, label, disabled = false }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && ref.current.checked !== checked) ref.current.checked = checked;
  }, [checked]);
  useElementEvent(ref, 'change', (event) => onChange?.(event.target.checked));
  return <fluent-switch ref={ref} aria-label={label} disabled={disabled || undefined} label-position="before" />;
}

// options : [{ value, label }] ; value et onChange en chaînes.
export function Dropdown({ value, options, onChange, label }) {
  const ref = useRef(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    // L'option sélectionnée suit la valeur, y compris après un rendu des options.
    for (const option of element.querySelectorAll('fluent-option')) {
      option.selected = option.value === value;
    }
  }, [value, options]);
  useElementEvent(ref, 'change', () => {
    const next = ref.current?.value;
    if (next != null && next !== value) onChange?.(next);
  });
  return (
    <fluent-dropdown ref={ref} aria-label={label} class="setting-dropdown">
      <fluent-listbox>
        {options.map((option) => (
          <fluent-option key={option.value} value={option.value}>{option.label}</fluent-option>
        ))}
      </fluent-listbox>
    </fluent-dropdown>
  );
}

export function TextInput({ value, onInput, onEnter, placeholder, label, type = 'text', autofocus = false, children }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && ref.current.value !== value) ref.current.value = value;
  }, [value]);
  useEffect(() => {
    if (autofocus) ref.current?.focus();
  }, [autofocus]);
  useElementEvent(ref, 'input', (event) => onInput?.(event.target.value));
  useElementEvent(ref, 'keydown', (event) => {
    if (event.key === 'Enter') onEnter?.(ref.current.value);
  });
  return (
    <fluent-text-input ref={ref} type={type} placeholder={placeholder} aria-label={label} class="text-input">
      {children}
    </fluent-text-input>
  );
}

// Carte de réglage façon Paramètres de Windows 11 : icône, titre, description
// à gauche, contrôle à droite.
export function SettingCard({ icon, title, description, children }) {
  return (
    <div class="setting-card">
      {icon && <span class="setting-card__icon">{icon}</span>}
      <div class="setting-card__text">
        <div class="setting-card__title">{title}</div>
        {description && <div class="setting-card__description">{description}</div>}
      </div>
      <div class="setting-card__control">{children}</div>
    </div>
  );
}
