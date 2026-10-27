// Boîte de dialogue façon ContentDialog de Windows 11 : titre, contenu,
// boutons alignés à droite. Échap ferme.

import { useEffect, useRef } from 'preact/hooks';

export function Dialog({ title, onClose, children, footer, width = 420 }) {
  const ref = useRef(null);
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    ref.current?.querySelector('[autofocus], fluent-text-input, button, fluent-button')?.focus?.();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div class="dialog" role="dialog" aria-modal="true" aria-label={title} ref={ref} style={{ width: `min(${width}px, calc(100vw - 32px))` }}>
      <div class="dialog__body">
        <h2 class="dialog__title">{title}</h2>
        {children}
      </div>
      {footer && <div class="dialog__footer">{footer}</div>}
    </div>
  );
}
