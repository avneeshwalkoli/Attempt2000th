import { useEffect, useState } from "react";
import { anydeskSocket } from "./anydeskSocket";

export function useAnyDesk(roomId) {
  const [connected, setConnected] = useState(false);
  const [remoteStream, setRemoteStream] = useState(null);

  useEffect(() => {
    anydeskSocket.emit("anydesk:join", { roomId });

    anydeskSocket.on("anydesk:connected", () => {
      setConnected(true);
    });

    anydeskSocket.on("anydesk:stream", (stream) => {
      setRemoteStream(stream);
    });

    return () => {
      anydeskSocket.emit("anydesk:leave", { roomId });
    };
  }, [roomId]);

  return { connected, remoteStream };
}
