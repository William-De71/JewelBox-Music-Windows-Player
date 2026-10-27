// Pochette carrée ; fond neutre et note de musique tant qu'elle manque ou
// n'a pas pu être chargée.

import { useEffect, useState } from 'preact/hooks';
import { Icon } from './Icon.jsx';

export function Cover({ url, size, alt = '', class: className = '' }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  const style = size ? { width: `${size}px`, height: `${size}px` } : undefined;
  return (
    <div class={`cover ${className}`} style={style}>
      {url && !failed
        ? <img src={url} alt={alt} loading="lazy" decoding="async" draggable={false} onError={() => setFailed(true)} />
        : <Icon name="music_note_2" size={size ? Math.max(16, Math.round(size / 3)) : 32} class="cover__placeholder" />}
    </div>
  );
}
