// Portage des tests de core/queue.py du lecteur bureau.
import { describe, expect, it } from 'vitest';
import { Queue, queueItem, RepeatMode, nextRepeat } from '../src/core/queue.js';

const makeItems = (count, from = 1) => Array.from({ length: count }, (_, k) => queueItem({
  trackId: from + k, title: `Piste ${from + k}`, artistName: 'Air', albumTitle: 'Moon Safari', streamUrl: `http://s/${from + k}`,
}));
const loaded = (count, start = 0) => { const q = new Queue(); q.load(makeItems(count), start); return q; };
const ids = (state) => state.items.map((i) => i.trackId);
const playOrder = (queue) => {
  const played = [queue.state().current.trackId];
  while (queue.hasNext()) played.push(queue.next().current.trackId);
  return played;
};
const drawn = (queue) => queue._order.map((i) => queue._items[i].trackId);
const repeatOne = (queue) => { queue.cycleRepeat(); queue.cycleRepeat(); };

describe('chargement', () => {
  it('file vide', () => {
    const state = new Queue().state();
    expect(state.current).toBeNull();
    expect(state.hasItem).toBe(false);
  });
  it('index de départ, borné', () => {
    expect(loaded(3, 1).state().current.trackId).toBe(2);
    expect(loaded(3, 99).state().current.trackId).toBe(3);
    expect(loaded(0).state().current).toBeNull();
  });
  it('clear', () => {
    const state = loaded(3).clear();
    expect(state.items).toEqual([]);
    expect(state.current).toBeNull();
  });
});

describe('navigation', () => {
  it('next / previous', () => {
    expect(loaded(3).next().current.trackId).toBe(2);
    expect(loaded(3, 2).previous().current.trackId).toBe(2);
  });
  it('bout de file sans répétition', () => {
    const q = loaded(2, 1);
    expect(q.next().current.trackId).toBe(2);
    expect(q.hasNext()).toBe(false);
    const p = loaded(2, 0);
    expect(p.previous().current.trackId).toBe(1);
    expect(p.hasPrevious()).toBe(false);
  });
  it('répétition ALL boucle', () => {
    const q = loaded(2, 1);
    q.cycleRepeat();
    expect(q.next().current.trackId).toBe(1);
    const p = loaded(2, 0);
    p.cycleRepeat();
    expect(p.previous().current.trackId).toBe(2);
  });
  it('hasNext', () => {
    expect(loaded(3).hasNext()).toBe(true);
    expect(loaded(3, 2).hasNext()).toBe(false);
    const q = loaded(3, 2);
    repeatOne(q);
    expect(q.hasNext()).toBe(true);
    expect(new Queue().hasNext()).toBe(false);
    expect(new Queue().hasPrevious()).toBe(false);
  });
  it('file vide : no-op', () => {
    expect(new Queue().next().current).toBeNull();
    expect(new Queue().previous().current).toBeNull();
  });
});

describe('jumpTo', () => {
  it('ordre d’affichage', () => {
    const state = loaded(5).jumpTo(3);
    expect(state.current.trackId).toBe(4);
    expect(state.currentIndex).toBe(3);
  });
  it('hors bornes ou vide', () => {
    const q = loaded(3, 1);
    for (const index of [-1, 3, 99]) expect(q.jumpTo(index).current.trackId).toBe(2);
    expect(new Queue().jumpTo(0).current).toBeNull();
  });
  it('en aléatoire : la ligne cliquée joue', () => {
    const q = loaded(20);
    q.setShuffle(true);
    const state = q.jumpTo(7);
    expect(state.current.trackId).toBe(8);
    expect(state.shuffle).toBe(true);
  });
  it('en aléatoire : la suite reprend le tirage', () => {
    const q = loaded(10);
    q.setShuffle(true);
    const before = playOrder(q);
    const fifth = before[4];
    q.jumpTo(q.state().items.findIndex((i) => i.trackId === fifth));
    expect(playOrder(q)).toEqual(before.slice(4));
  });
  it('repart d’une file épuisée', () => {
    const q = loaded(3, 2);
    q.trackEnded();
    expect(q.state().current).toBeNull();
    expect(q.jumpTo(0).current.trackId).toBe(1);
    expect(q.hasNext()).toBe(true);
  });
});

describe('trackEnded', () => {
  it('avance comme next', () => expect(loaded(3).trackEnded().current.trackId).toBe(2));
  it('ONE rejoue', () => {
    const q = loaded(3, 1);
    repeatOne(q);
    expect(q.trackEnded().current.trackId).toBe(2);
  });
  it('fin de file : arrêt', () => {
    const state = loaded(2, 1).trackEnded();
    expect(state.current).toBeNull();
    expect(state.hasItem).toBe(false);
  });
  it('ALL recommence', () => {
    const q = loaded(2, 1);
    q.cycleRepeat();
    expect(q.trackEnded().current.trackId).toBe(1);
  });
  it('vide', () => expect(new Queue().trackEnded().current).toBeNull());
});

describe('peekNext / peekPrevious', () => {
  it('sans avancer', () => {
    const q = loaded(3);
    expect(q.peekNext().trackId).toBe(2);
    expect(q.state().current.trackId).toBe(1);
  });
  it('fin, ALL, ONE, vide', () => {
    expect(loaded(2, 1).peekNext()).toBeNull();
    const all = loaded(2, 1);
    all.cycleRepeat();
    expect(all.peekNext().trackId).toBe(1);
    const one = loaded(3, 1);
    repeatOne(one);
    expect(one.peekNext().trackId).toBe(2);
    expect(new Queue().peekNext()).toBeNull();
  });
  it('en aléatoire, égale la future piste courante', () => {
    const q = loaded(6);
    q.cycleRepeat();
    q.setShuffle(true);
    for (let k = 0; k < 7; k += 1) {
      const prepared = q.peekNext();
      const displayed = q.trackEnded().current;
      expect(prepared.trackId).toBe(displayed.trackId);
    }
  });
  it('peekPrevious', () => {
    expect(loaded(3, 0).peekPrevious()).toBeNull();
    expect(loaded(3, 2).peekPrevious().trackId).toBe(2);
  });
});

describe('répétition', () => {
  it('cycle', () => {
    expect(nextRepeat(RepeatMode.OFF)).toBe(RepeatMode.ALL);
    expect(nextRepeat(RepeatMode.ALL)).toBe(RepeatMode.ONE);
    expect(nextRepeat(RepeatMode.ONE)).toBe(RepeatMode.OFF);
    const q = loaded(2);
    expect(q.cycleRepeat().repeat).toBe('all');
    expect(q.cycleRepeat().repeat).toBe('one');
    expect(q.cycleRepeat().repeat).toBe('off');
  });
  it('setRepeat ignore une valeur inconnue', () => {
    const q = loaded(2);
    expect(q.setRepeat('one').repeat).toBe('one');
    expect(q.setRepeat('n-importe').repeat).toBe('one');
  });
});

describe('aléatoire', () => {
  it('garde la piste courante', () => {
    const q = loaded(20, 5);
    const state = q.setShuffle(true);
    expect(state.current.trackId).toBe(6);
    expect(state.shuffle).toBe(true);
  });
  it('chaque piste une fois', () => {
    const q = loaded(10);
    q.setShuffle(true);
    expect(new Set(drawn(q))).toEqual(new Set(Array.from({ length: 10 }, (_, i) => i + 1)));
    expect(drawn(q)).toHaveLength(10);
  });
  it('désactiver retrouve l’ordre d’origine', () => {
    const q = loaded(10, 3);
    q.setShuffle(true);
    const current = q.state().current.trackId;
    const state = q.setShuffle(false);
    expect(state.shuffle).toBe(false);
    expect(state.current.trackId).toBe(current);
    expect(ids(state)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
  it('même valeur, file vide', () => {
    expect(loaded(3).setShuffle(false).shuffle).toBe(false);
    const state = new Queue().setShuffle(true);
    expect(state.shuffle).toBe(true);
    expect(state.current).toBeNull();
  });
  it('tirage déterministe injecté', () => {
    const q = new Queue({ random: () => 0 });
    q.load(makeItems(4), 0);
    q.setShuffle(true);
    expect(drawn(q)[0]).toBe(1);
    expect(drawn(q)).toHaveLength(4);
  });
});

describe('favori', () => {
  it('bascule, même valeur, inconnue', () => {
    expect(loaded(3).updateFavorite(2, true).items[1].isFavorite).toBe(true);
    const q = loaded(3);
    const before = q.state().items;
    expect(q.updateFavorite(2, false).items).toEqual(before);
    expect(loaded(3).updateFavorite(999, true).items.every((i) => !i.isFavorite)).toBe(true);
  });
});

describe('retrait', () => {
  it('autre piste, courante, dernière, inconnue', () => {
    let state = loaded(3, 1).remove(3);
    expect(state.current.trackId).toBe(2);
    expect(state.items).toHaveLength(2);
    expect(loaded(3, 1).remove(2).current.trackId).toBe(3);
    expect(loaded(3, 2).remove(3).current.trackId).toBe(2);
    state = loaded(3).remove(999);
    expect(state.items).toHaveLength(3);
    expect(state.current.trackId).toBe(1);
  });
  it('seule piste', () => {
    expect(loaded(1).remove(1)).toMatchObject({ current: null, items: [] });
    const q = loaded(1);
    q.setShuffle(true);
    expect(q.remove(1)).toMatchObject({ current: null, items: [] });
  });
  it('en aléatoire, l’ordre tiré est gardé', () => {
    const q = loaded(6);
    q.setShuffle(true);
    q.next();
    const upcoming = q._order.slice(q._position).map((i) => q._items[i].trackId);
    q.remove(upcoming[1]);
    expect(playOrder(q)).toEqual([upcoming[0], ...upcoming.slice(2)]);
  });
  it('piste avant la courante', () => {
    const q = loaded(4, 2);
    expect(q.remove(1).current.trackId).toBe(3);
    expect(q.next().current.trackId).toBe(4);
  });
  it('removeAt : une occurrence d’un doublon', () => {
    const q = new Queue();
    q.load([...makeItems(2), ...makeItems(1)], 0);
    const state = q.removeAt(2);
    expect(ids(state)).toEqual([1, 2]);
    expect(state.current.trackId).toBe(1);
    expect(ids(loaded(2).removeAt(5))).toEqual([1, 2]);
  });
});

describe('sérialisation', () => {
  it('aller-retour', () => {
    const q = loaded(4, 2);
    const saved = q.toSaved({ serverUrl: 'http://s:3001', sourceType: 'album', sourceId: '7', positionMs: 15000 });
    expect(saved).toMatchObject({ index: 2, positionMs: 15000, sourceType: 'album', sourceId: '7', sourceName: null });
    expect(saved.tracks).toHaveLength(4);
    const restored = Queue.fromSaved(JSON.parse(JSON.stringify(saved)));
    expect(restored.state().current.trackId).toBe(3);
    expect(ids(restored.state())).toEqual([1, 2, 3, 4]);
  });
  it('ordre d’origine malgré l’aléatoire', () => {
    const q = loaded(5);
    q.setShuffle(true);
    const current = q.state().current.trackId;
    const saved = q.toSaved({ serverUrl: 'x' });
    expect(saved.tracks.map((t) => t.trackId)).toEqual([1, 2, 3, 4, 5]);
    expect(saved.index).toBe(current - 1);
  });
  it('file vide', () => {
    expect(new Queue().toSaved({ serverUrl: 'x' })).toMatchObject({ tracks: [], index: 0 });
    expect(Queue.fromSaved({ tracks: [], index: 0 }).state().current).toBeNull();
    expect(Queue.fromSaved({}).state().current).toBeNull();
    expect(Queue.fromSaved(null).state().current).toBeNull();
  });
  it('aléatoire et répétition repartent à OFF', () => {
    const q = loaded(3);
    q.setShuffle(true);
    q.cycleRepeat();
    const state = Queue.fromSaved(q.toSaved({ serverUrl: 'x' })).state();
    expect(state.shuffle).toBe(false);
    expect(state.repeat).toBe('off');
  });
  it('nom de la source', () => {
    expect(loaded(2).toSaved({ serverUrl: 'x', sourceType: 'smart', sourceId: 'favourites', sourceName: 'Favoris' }).sourceName).toBe('Favoris');
  });
  it('tolérance', () => {
    expect(Queue.fromSaved({ tracks: [{ trackId: 1, title: 'T', rating: 5 }] }).state().current.trackId).toBe(1);
    const item = Queue.fromSaved({ tracks: [{ trackId: 7 }] }).state().current;
    expect(item).toMatchObject({ trackId: 7, title: '', artistName: '', albumTitle: '', coverUrl: null, streamUrl: '', isFavorite: false });
    const restored = Queue.fromSaved({ tracks: [
      { trackId: 1, title: 'ok' }, { title: 'sans id' }, { trackId: 'deux' }, { trackId: null }, 'pas un objet', { trackId: 4 },
    ] });
    expect(ids(restored.state())).toEqual([1, 4]);
    expect(Queue.fromSaved({ tracks: [{ trackId: 1 }, { trackId: 2 }], index: 99 }).state().current.trackId).toBe(2);
  });
});

describe('ajouts', () => {
  it('append en fin sans bouger', () => {
    const q = loaded(2, 1);
    const state = q.append(makeItems(2, 3));
    expect(ids(state)).toEqual([1, 2, 3, 4]);
    expect(state.current.trackId).toBe(2);
    expect(q.next().current.trackId).toBe(3);
    expect(loaded(2).append([]).items).toHaveLength(2);
  });
  it('append après le tirage', () => {
    const q = loaded(4);
    q.setShuffle(true);
    const order = drawn(q);
    q.append(makeItems(2, 5));
    expect(playOrder(q)).toEqual([...order, 5, 6]);
  });
  it('append à une file épuisée ou vide', () => {
    const q = loaded(1);
    q.trackEnded();
    const state = q.append(makeItems(2, 2));
    expect(state.current).toBeNull();
    expect(state.items).toHaveLength(3);
    expect(new Queue().append(makeItems(2)).current.trackId).toBe(1);
  });
  it('insertNext juste après la courante', () => {
    const q = loaded(4, 1);
    const state = q.insertNext([queueItem({ trackId: 10 }), queueItem({ trackId: 11 })]);
    expect(ids(state)).toEqual([1, 2, 10, 11, 3, 4]);
    expect(state.current.trackId).toBe(2);
    expect(playOrder(q)).toEqual([2, 10, 11, 3, 4]);
  });
  it('insertNext en aléatoire passe avant le reste', () => {
    const q = loaded(5);
    q.setShuffle(true);
    q.next();
    const current = q.state().current.trackId;
    const rest = q._order.slice(q._position + 1).map((i) => q._items[i].trackId);
    q.insertNext([queueItem({ trackId: 99 })]);
    expect(playOrder(q)).toEqual([current, 99, ...rest]);
  });
  it('insertNext dans une file vide, épuisée, rien', () => {
    const empty = new Queue().insertNext(makeItems(2));
    expect(ids(empty)).toEqual([1, 2]);
    expect(empty.current.trackId).toBe(1);
    const q = loaded(1);
    q.trackEnded();
    const state = q.insertNext([queueItem({ trackId: 7 })]);
    expect(state.current.trackId).toBe(7);
    expect(ids(state)).toEqual([1, 7]);
    expect(ids(loaded(2).insertNext([]))).toEqual([1, 2]);
  });
});

describe('move', () => {
  it('réordonne et garde la courante', () => {
    const q = loaded(4, 1);
    const state = q.move(3, 0);
    expect(ids(state)).toEqual([4, 1, 2, 3]);
    expect(state.current.trackId).toBe(2);
    expect(playOrder(q)).toEqual([2, 3]);
  });
  it('la courante suit', () => {
    const q = loaded(4);
    const state = q.move(0, 2);
    expect(ids(state)).toEqual([2, 3, 1, 4]);
    expect(state.current.trackId).toBe(1);
    expect(playOrder(q)).toEqual([1, 4]);
  });
  it('en aléatoire, le tirage est gardé', () => {
    const q = loaded(5);
    q.setShuffle(true);
    const order = drawn(q);
    const position = q._position;
    q.move(4, 0);
    expect(drawn(q)).toEqual(order);
    expect(q._position).toBe(position);
  });
  it('hors bornes, même indice, file épuisée', () => {
    expect(ids(loaded(3).move(0, 5))).toEqual([1, 2, 3]);
    expect(ids(loaded(3).move(1, 1))).toEqual([1, 2, 3]);
    const q = loaded(2, 1);
    q.trackEnded();
    const state = q.move(0, 1);
    expect(ids(state)).toEqual([2, 1]);
    expect(state.current).toBeNull();
  });
});

describe('playedBefore', () => {
  it('suit l’ordre de lecture', () => {
    const q = new Queue();
    expect(q.playedBefore()).toEqual([]);
    q.load(makeItems(5));
    expect(q.playedBefore()).toEqual([]);
    q.next();
    q.next();
    expect(q.playedBefore()).toEqual([1, 2]);
    q.setShuffle(true);
    const order = [];
    for (;;) {
      order.push(q.state().current.trackId);
      if (!q.hasNext()) break;
      q.next();
    }
    expect(q.playedBefore()).toEqual(order.slice(0, -1));
  });
  it('vide au-delà de la fin', () => {
    const q = loaded(2, 1);
    q.trackEnded();
    expect(q.playedBefore()).toEqual([]);
  });
});
