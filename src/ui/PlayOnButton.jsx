// « Lire sur… » : lance un album, une playlist ou une liste intelligente sur
// un autre lecteur. Les lecteurs sont listés à l'ouverture du menu : ceux
// qu'on peut piloter et qui savent lancer un média.

import { useState } from 'preact/hooks';

import { useApp } from '../app/context.jsx';
import { useOverlays } from '../app/overlays.jsx';
import { useRemoteSend } from '../app/remote.jsx';
import { controllableOthers, deviceIcon, deviceName, playMediaCommand } from '../core/remoteController.js';
import { MenuButton } from './Menu.jsx';

const noop = () => {};

// type : 'album' | 'playlist' | 'smart' ; id : son identifiant (la clé pour 'smart').
export function PlayOnButton({ type, id }) {
  const { client, deviceId } = useApp();
  const { toast } = useOverlays();
  const send = useRemoteSend();
  const [devices, setDevices] = useState(null);

  const load = () => {
    setDevices(null);
    if (!client) {
      setDevices([]);
      return;
    }
    client.remoteDevices()
      .then((all) => controllableOthers(all, deviceId).filter((d) => d.capabilities.includes('play_media')))
      .catch(() => [])
      .then(setDevices);
  };

  const start = async (device) => {
    if (await send(device.deviceId, playMediaCommand(type, id))) toast(`Lecture lancée sur ${deviceName(device)}`);
  };

  let entries;
  if (devices === null) entries = [{ label: 'Recherche des lecteurs…', disabled: true, onSelect: noop }];
  else if (!devices.length) entries = [{ label: 'Aucun lecteur disponible', disabled: true, onSelect: noop }];
  else entries = devices.map((device) => ({ label: deviceName(device), icon: deviceIcon(device.deviceLabel), onSelect: () => start(device) }));

  return (
    <MenuButton appearance="outline" icon="cast" text="Lire sur…" label="Lire sur un autre appareil" entries={entries} onOpen={load} />
  );
}
