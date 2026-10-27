// Menu contextuel façon Windows 11, ouvert par un bouton : entrées
// { label, icon?, onSelect } ; null insère un séparateur. Se ferme au clic
// ailleurs, sur Échap ou après un choix.

import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Icon } from './Icon.jsx';

export function MenuButton({ entries, icon = 'more_horizontal', label = 'Plus d’actions', text, appearance = 'subtle', class: className = '' }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (menuRef.current?.contains(event.target) || buttonRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const onKey = (event) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    window.addEventListener('blur', () => setOpen(false), { once: true });
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Placé sous le bouton, aligné à droite, et remonté s'il dépasse en bas.
  useLayoutEffect(() => {
    if (!open || !buttonRef.current || !menuRef.current) return;
    const anchor = buttonRef.current.getBoundingClientRect();
    const menu = menuRef.current.getBoundingClientRect();
    let top = anchor.bottom + 4;
    if (top + menu.height > window.innerHeight - 8) top = Math.max(8, anchor.top - menu.height - 4);
    const left = Math.max(8, Math.min(anchor.right - menu.width, window.innerWidth - menu.width - 8));
    setPosition({ top, left });
  }, [open]);

  return (
    <>
      <fluent-button
        ref={buttonRef}
        appearance={appearance}
        icon-only={text ? undefined : true}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open ? 'true' : 'false'}
        class={className}
        onClick={(event) => { event.stopPropagation(); setOpen((v) => !v); }}
      >
        <Icon name={icon} />
        {text && <span class="button-text">{text}</span>}
      </fluent-button>
      {open && (
        <div
          ref={menuRef}
          class="menu"
          role="menu"
          style={position ? { top: `${position.top}px`, left: `${position.left}px` } : { visibility: 'hidden' }}
          onClick={(event) => event.stopPropagation()}
        >
          {entries.map((entry, index) => (entry === null
            ? <div key={`sep-${index}`} class="menu__separator" role="separator" />
            : (
              <button
                key={entry.label}
                type="button"
                role="menuitem"
                class="menu__item"
                disabled={entry.disabled}
                onClick={() => { setOpen(false); entry.onSelect(); }}
              >
                <span class="menu__icon">{entry.icon && <Icon name={entry.icon} size={16} />}</span>
                {entry.label}
              </button>
            )))}
        </div>
      )}
    </>
  );
}
