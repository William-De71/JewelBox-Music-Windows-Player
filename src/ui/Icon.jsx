import { ICONS } from './icons.js';

// <Icon name="play" /> ou <Icon name="heart" filled /> : SVG en ligne, couleur
// héritée du texte (currentColor).
export function Icon({ name, filled = false, size = 20, class: className = '', label }) {
  const svg = ICONS[filled ? `${name}:filled` : name] ?? ICONS[name];
  if (!svg) return null;
  const markup = svg
    .replace(/ (width|height)="\d+"/g, '')
    .replace('<svg ', `<svg width="${size}" height="${size}" fill="currentColor" `);
  return (
    <span
      class={`icon ${className}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
