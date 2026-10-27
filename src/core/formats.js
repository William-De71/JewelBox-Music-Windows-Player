// Formatage pur, portage de core/formats.py.

// Durée lisible : 245 → « 4:05 », 3725 → « 1:02:05 ». null, négatif ou non
// fini → « 0:00 ».
export function formatDuration(seconds) {
  const value = Number(seconds);
  if (seconds === null || seconds === undefined || !Number.isFinite(value) || value < 0) {
    return '0:00';
  }
  const total = Math.trunc(value);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return hours ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}
