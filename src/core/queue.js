// File de lecture pure (portage de core/queue.py) : navigation, aléatoire,
// répétition, et sérialisation pour la reprise au prochain lancement.
//
// L'aléatoire ne mélange pas la liste : il tire un ordre de lecture séparé
// (comme Media3), pour que le désactiver retrouve l'ordre d'origine.

export const RepeatMode = Object.freeze({ OFF: 'off', ALL: 'all', ONE: 'one' });

const REPEAT_CYCLE = [RepeatMode.OFF, RepeatMode.ALL, RepeatMode.ONE];

// OFF → ALL → ONE → OFF, le cycle habituel d'un lecteur.
export function nextRepeat(mode) {
  return REPEAT_CYCLE[(REPEAT_CYCLE.indexOf(mode) + 1) % REPEAT_CYCLE.length];
}

// Une piste telle que gardée dans la file : de quoi l'afficher et la rejouer
// sans redemander le serveur. albumId + trackNumber : deux pistes qui se
// suivent sur un album ne sont pas séparées par le fondu.
export function queueItem({
  trackId, title = '', artistName = '', albumTitle = '', coverUrl = null, isFavorite = false,
  streamUrl = '', albumId = null, trackNumber = null, duration = null, replayGain = null,
}) {
  return Object.freeze({
    trackId, title, artistName, albumTitle, coverUrl, isFavorite, streamUrl,
    albumId, trackNumber, duration, replayGain,
  });
}

const isInt = (v) => Number.isInteger(v);

// Un item depuis une entrée sérialisée, ou null si elle n'est pas exploitable.
// Seuls les champs connus sont retenus : un instantané écrit par une version
// plus récente reste lisible.
function itemFromSaved(track) {
  if (!track || typeof track !== 'object' || !isInt(track.trackId)) return null;
  const text = (v) => (v == null ? '' : String(v));
  return queueItem({
    trackId: track.trackId,
    title: text(track.title),
    artistName: text(track.artistName),
    albumTitle: text(track.albumTitle),
    coverUrl: track.coverUrl || null,
    isFavorite: Boolean(track.isFavorite),
    streamUrl: text(track.streamUrl),
    albumId: isInt(track.albumId) ? track.albumId : null,
    trackNumber: isInt(track.trackNumber) ? track.trackNumber : null,
    duration: typeof track.duration === 'string' ? track.duration : null,
    replayGain: track.replayGain && typeof track.replayGain === 'object' ? track.replayGain : null,
  });
}

function shuffled(values, random) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export class Queue {
  constructor({ random = Math.random } = {}) {
    this._random = random;
    this._items = [];
    this._order = []; // ordre de lecture (index dans _items)
    this._position = 0; // position dans _order
    this._shuffle = false;
    this._repeat = RepeatMode.OFF;
  }

  // ── Chargement ─────────────────────────────────────────────────────────────

  // Remplace la file ; startIndex se réfère à la liste donnée, dans son ordre.
  load(items, startIndex = 0) {
    this._items = [...items];
    this._rebuildOrder(false);
    if (this._items.length) {
      const start = Math.max(0, Math.min(startIndex, this._items.length - 1));
      const position = this._order.indexOf(start);
      this._position = position >= 0 ? position : 0;
    } else {
      this._position = 0;
    }
    return this.state();
  }

  clear() {
    this._items = [];
    this._order = [];
    this._position = 0;
    return this.state();
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  hasNext() {
    if (!this._items.length) return false;
    if (this._repeat !== RepeatMode.OFF) return true;
    return this._position < this._order.length - 1;
  }

  hasPrevious() {
    return this._items.length > 0 && (this._repeat === RepeatMode.ALL || this._position > 0);
  }

  // Piste suivante. En mode ONE, avance quand même (rejouer après une fin
  // naturelle, c'est trackEnded()).
  next() {
    if (!this._items.length) return this.state();
    if (this._position < this._order.length - 1) this._position += 1;
    else if (this._repeat === RepeatMode.ALL) this._position = 0;
    return this.state();
  }

  previous() {
    if (!this._items.length) return this.state();
    if (this._position > 0) this._position -= 1;
    else if (this._repeat === RepeatMode.ALL) this._position = this._order.length - 1;
    return this.state();
  }

  // Saute à la piste d'indice `index` dans l'ordre d'AFFICHAGE (un clic sur
  // une ligne de la file). En aléatoire, le tirage est conservé : la suite
  // s'enchaîne sur le reste du tirage.
  jumpTo(index) {
    if (!this._items.length || index < 0 || index >= this._items.length) return this.state();
    this._position = this._order.indexOf(index);
    return this.state();
  }

  // Les pistes avant la courante dans l'ordre de LECTURE, en trackId.
  playedBefore() {
    if (this._position < 0 || this._position >= this._order.length) return [];
    return this._order.slice(0, this._position).map((i) => this._items[i].trackId);
  }

  // La piste qui suivrait sur une fin naturelle, SANS avancer (ordre de
  // lecture). En mode ONE : la piste courante.
  peekNext() {
    if (!this._items.length || this._position < 0 || this._position >= this._order.length) return null;
    if (this._repeat === RepeatMode.ONE) return this._items[this._order[this._position]];
    if (this._position < this._order.length - 1) return this._items[this._order[this._position + 1]];
    if (this._repeat === RepeatMode.ALL) return this._items[this._order[0]];
    return null;
  }

  // La piste jouée juste avant la courante (ordre de lecture), ou null.
  peekPrevious() {
    if (!this._items.length || this._position <= 0 || this._position >= this._order.length) return null;
    return this._items[this._order[this._position - 1]];
  }

  // Fin naturelle de la piste (≠ next() manuel) : en mode ONE elle rejoue, en
  // fin de file sans ALL la lecture s'arrête.
  trackEnded() {
    if (!this._items.length) return this.state();
    if (this._repeat === RepeatMode.ONE) return this.state();
    if (this._position < this._order.length - 1) this._position += 1;
    else if (this._repeat === RepeatMode.ALL) this._position = 0;
    else this._position = this._order.length; // au-delà : plus rien à jouer
    return this.state();
  }

  updateFavorite(trackId, isFavorite) {
    const index = this._items.findIndex((item) => item.trackId === trackId && item.isFavorite !== isFavorite);
    if (index >= 0) this._items[index] = queueItem({ ...this._items[index], isFavorite });
    return this.state();
  }

  // Ajoute en fin de file et en fin d'ordre de lecture (le tirage déjà fait
  // reste intact). Une file épuisée reste épuisée : à l'appelant de relancer.
  append(items) {
    const added = [...items];
    if (!added.length) return this.state();
    const start = this._items.length;
    const exhausted = this._order.length > 0 && this._position >= this._order.length;
    this._items.push(...added);
    for (let i = 0; i < added.length; i += 1) this._order.push(start + i);
    if (exhausted) this._position = this._order.length;
    return this.state();
  }

  // « Lire ensuite » : juste après la piste en cours, dans l'affichage comme
  // dans la lecture (même en aléatoire). File vide ou épuisée : elles
  // deviennent la suite, la première étant courante.
  insertNext(items) {
    const added = [...items];
    if (!added.length) return this.state();
    if (!this._items.length) return this.load(added);
    if (this._position >= this._order.length) return this._restartWith(added);
    const insertAt = this._order[this._position] + 1;
    const count = added.length;
    this._items.splice(insertAt, 0, ...added);
    this._order = this._order.map((i) => (i >= insertAt ? i + count : i));
    const newIndices = Array.from({ length: count }, (_, k) => insertAt + k);
    this._order.splice(this._position + 1, 0, ...newIndices);
    return this.state();
  }

  _restartWith(items) {
    const start = this._items.length;
    this._items.push(...items);
    for (let i = 0; i < items.length; i += 1) this._order.push(start + i);
    this._position = this._order.indexOf(start);
    return this.state();
  }

  // Déplace une piste dans l'ordre d'AFFICHAGE. La courante reste courante ;
  // hors aléatoire, l'ordre de lecture suit l'affichage.
  move(fromIndex, toIndex) {
    const size = this._items.length;
    if (fromIndex < 0 || fromIndex >= size || toIndex < 0 || toIndex >= size || fromIndex === toIndex) {
      return this.state();
    }
    const currentItem = this._position < this._order.length ? this._order[this._position] : null;
    const newDisplay = Array.from({ length: size }, (_, i) => i);
    newDisplay.splice(toIndex, 0, newDisplay.splice(fromIndex, 1)[0]);
    const oldToNew = new Map(newDisplay.map((old, now) => [old, now]));
    this._items = newDisplay.map((old) => this._items[old]);
    this._order = this._shuffle ? this._order.map((i) => oldToNew.get(i)) : Array.from({ length: size }, (_, i) => i);
    if (currentItem !== null) this._position = this._order.indexOf(oldToNew.get(currentItem));
    return this.state();
  }

  // Retire une piste, même la courante : la position se recale sur celle
  // qui suivait. L'ordre de lecture est conservé (pas de nouveau tirage).
  remove(trackId) {
    const index = this._items.findIndex((item) => item.trackId === trackId);
    return index < 0 ? this.state() : this.removeAt(index);
  }

  // Retire l'entrée `itemIndex` (ordre d'affichage) : utile quand une même
  // piste figure deux fois dans la file.
  removeAt(itemIndex) {
    if (itemIndex < 0 || itemIndex >= this._items.length) return this.state();
    const orderPosition = this._order.indexOf(itemIndex);
    this._items.splice(itemIndex, 1);
    this._order = this._order.filter((i) => i !== itemIndex).map((i) => (i > itemIndex ? i - 1 : i));
    if (orderPosition < this._position) this._position -= 1;
    else if (orderPosition === this._position) {
      this._position = Math.min(this._position, Math.max(0, this._order.length - 1));
    }
    return this.state();
  }

  // ── Aléatoire / répétition ─────────────────────────────────────────────────

  setShuffle(enabled) {
    if (enabled === this._shuffle) return this.state();
    this._shuffle = enabled;
    this._rebuildOrder(true);
    return this.state();
  }

  cycleRepeat() {
    this._repeat = nextRepeat(this._repeat);
    return this.state();
  }

  setRepeat(mode) {
    if (REPEAT_CYCLE.includes(mode)) this._repeat = mode;
    return this.state();
  }

  _rebuildOrder(keepCurrent) {
    const currentItem = keepCurrent && this._position < this._order.length ? this._order[this._position] : null;
    let indices = Array.from({ length: this._items.length }, (_, i) => i);
    if (this._shuffle) {
      indices = shuffled(indices, this._random);
      if (currentItem !== null && indices.length) {
        indices = [currentItem, ...indices.filter((i) => i !== currentItem)];
      }
    }
    this._order = indices;
    this._position = currentItem !== null ? this._order.indexOf(currentItem) : 0;
  }

  // ── État / sérialisation ───────────────────────────────────────────────────

  state() {
    const valid = this._items.length > 0 && this._position >= 0 && this._position < this._order.length;
    const currentIndex = valid ? this._order[this._position] : null;
    return Object.freeze({
      items: [...this._items],
      currentIndex,
      current: currentIndex === null ? null : this._items[currentIndex],
      hasItem: currentIndex !== null,
      shuffle: this._shuffle,
      repeat: this._repeat,
    });
  }

  // Instantané pour la reprise : l'ordre d'affichage d'origine, l'index de la
  // piste courante dans cet ordre ; l'aléatoire repart neutre.
  toSaved({ serverUrl, sourceType = null, sourceId = null, dynamicMix = false, positionMs = 0, sourceName = null }) {
    const { currentIndex } = this.state();
    return {
      serverUrl,
      tracks: this._items.map((item) => ({ ...item })),
      index: currentIndex ?? 0,
      positionMs,
      sourceType,
      sourceId,
      sourceName,
      dynamicMix,
    };
  }

  // Reconstruit une file depuis toSaved() ; aléatoire et répétition à OFF.
  // Entrées inexploitables écartées plutôt que de faire échouer la reprise.
  static fromSaved(saved, options) {
    const queue = new Queue(options);
    const tracks = Array.isArray(saved?.tracks) ? saved.tracks : [];
    const items = tracks.map(itemFromSaved).filter(Boolean);
    queue.load(items, isInt(saved?.index) ? saved.index : 0);
    return queue;
  }
}
