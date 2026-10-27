// Composants Fluent UI (web components) utilisés par l'app, et thème clair /
// sombre qui suit celui de Windows.

import '@fluentui/web-components/button.js';
import '@fluentui/web-components/divider.js';
import '@fluentui/web-components/dropdown.js';
import '@fluentui/web-components/field.js';
import '@fluentui/web-components/label.js';
import '@fluentui/web-components/listbox.js';
import '@fluentui/web-components/option.js';
import '@fluentui/web-components/progress-bar.js';
import '@fluentui/web-components/slider.js';
import '@fluentui/web-components/spinner.js';
import '@fluentui/web-components/switch.js';
import '@fluentui/web-components/text-input.js';
import '@fluentui/web-components/toggle-button.js';
import '@fluentui/web-components/tooltip.js';
import { setTheme } from '@fluentui/web-components';
import { webDarkTheme, webLightTheme } from '@fluentui/tokens';

export function followSystemTheme() {
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  const apply = () => {
    setTheme(query.matches ? webDarkTheme : webLightTheme);
    document.documentElement.dataset.theme = query.matches ? 'dark' : 'light';
  };
  apply();
  query.addEventListener('change', apply);
}
