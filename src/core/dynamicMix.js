// Synchronisation du mix dynamique (portage de core/dynamic_mix.py). Le
// serveur ne fait que retirer les pistes consommées et recompléter le bas de
// la liste : se remettre à jour revient à retirer ce qui a disparu et ajouter
// à la fin ce qui est nouveau.

export const DYNAMIC_MIX_KEY = 'dynamic_mix';

// Pistes gardées derrière la courante (« précédent » y revient) avant d'être
// consommées. Même valeur que la PWA, Android et le bureau.
export const KEEP_BEHIND = 4;

export function plan(currentIds, serverIds) {
  const server = new Set(serverIds);
  const local = new Set(currentIds);
  return {
    removeIds: currentIds.filter((id) => !server.has(id)),
    appendIds: serverIds.filter((id) => !local.has(id)),
  };
}

// Avancer à la main : arrivé à la piste KEEP_BEHIND + 1, celles d'avant (ordre
// de lecture) sont consommées pour que le bas de la liste se recomplète.
export function trimIds(playedBefore) {
  return playedBefore.length >= KEEP_BEHIND ? [...playedBefore] : [];
}
