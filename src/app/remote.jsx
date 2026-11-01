// Ce que partagent les pages de télécommande et le bouton « Lire sur… » :
// la liste des lecteurs pilotables, en direct, et l'envoi d'un ordre.

import { useEffect, useState } from 'preact/hooks';

import { useApp } from './context.jsx';
import { useOverlays } from './overlays.jsx';

// Les autres lecteurs pilotables (null tant que la liste n'est pas arrivée).
// Le flux reste ouvert tant qu'un composant qui l'utilise est affiché.
export function useRemoteDevices() {
  const { remoteWatch } = useApp();
  const [devices, setDevices] = useState(remoteWatch.devices);
  useEffect(() => {
    remoteWatch.acquire();
    const unsubscribe = remoteWatch.subscribe(setDevices);
    return () => {
      unsubscribe();
      remoteWatch.release();
    };
  }, [remoteWatch]);
  return devices;
}

// send(deviceId, ordre) : un refus (lecteur parti, serveur injoignable) est
// signalé ; le lecteur confirme par son prochain rapport d'état. Rend une
// promesse vraie si l'ordre est parti.
export function useRemoteSend() {
  const { client } = useApp();
  const { toast } = useOverlays();
  return (deviceId, command) => {
    if (!client) return Promise.resolve(false);
    return client.remoteCommand(deviceId, command).then(
      () => true,
      () => {
        toast('La commande n’a pas abouti');
        return false;
      },
    );
  };
}
