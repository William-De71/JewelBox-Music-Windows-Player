// Ce qui s'affiche par-dessus les pages : messages brefs (toasts) et boîtes
// de dialogue. Équivalent de l'Adw.ToastOverlay et des Adw.Dialog du bureau.

import { createContext } from 'preact';
import { useCallback, useContext, useMemo, useRef, useState } from 'preact/hooks';

const OverlayContext = createContext(null);

const TOAST_MS = 3000;

export function OverlayProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null);
  const nextId = useRef(0);

  const toast = useCallback((text) => {
    const id = (nextId.current += 1);
    setToasts((current) => [...current.slice(-2), { id, text }]);
    setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), TOAST_MS);
  }, []);

  // render(close) renvoie le contenu du dialogue ; un seul à la fois.
  const openDialog = useCallback((render) => setDialog(() => render), []);
  const closeDialog = useCallback(() => setDialog(null), []);

  const value = useMemo(() => ({ toast, openDialog, closeDialog }), [toast, openDialog, closeDialog]);

  return (
    <OverlayContext.Provider value={value}>
      {children}
      {dialog && (
        <div class="dialog-smoke" onMouseDown={(e) => e.target === e.currentTarget && closeDialog()}>
          {dialog(closeDialog)}
        </div>
      )}
      <div class="toasts" role="status" aria-live="polite">
        {toasts.map((t) => <div key={t.id} class="toast">{t.text}</div>)}
      </div>
    </OverlayContext.Provider>
  );
}

export function useOverlays() {
  const value = useContext(OverlayContext);
  if (!value) throw new Error('useOverlays hors de OverlayProvider');
  return value;
}
