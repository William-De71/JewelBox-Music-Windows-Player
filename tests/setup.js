// Réglages en mémoire entre deux tests : chaque test part d'un stockage vide.
import { afterEach } from 'vitest';

afterEach(() => {
  localStorage.clear();
});
