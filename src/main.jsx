import { render } from 'preact';
import { invoke, isTauri } from '@tauri-apps/api/core';

import './styles/app.css';
import { followSystemTheme } from './ui/fluent.js';
import { AppProvider } from './app/context.jsx';
import { OverlayProvider } from './app/overlays.jsx';
import { App } from './App.jsx';

followSystemTheme();
// Effet Mica de Windows 11 : la fenêtre est transparente et le fond vient du
// système. Ailleurs (Windows 10, développement sous Linux), la page peint son
// propre fond.
if (isTauri()) {
  invoke('window_backdrop')
    .then((backdrop) => backdrop === 'mica' && document.documentElement.classList.add('mica'))
    .catch(() => {});
}

render(<AppProvider><OverlayProvider><App /></OverlayProvider></AppProvider>, document.getElementById('app'));
