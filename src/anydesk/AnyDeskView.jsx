import { useRef, useEffect } from "react";
import { useAnyDesk } from "./useAnyDesk";

export default function AnyDeskView({ roomId, onClose }) {
  const videoRef = useRef(null);
  const { remoteStream } = useAnyDesk(roomId);

  useEffect(() => {
    if (videoRef.current && remoteStream) {
      videoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  return (
    <div className="relative h-full w-full bg-slate-900">
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-50 bg-red-600 px-4 py-2 rounded"
      >
        Close Remote Access
      </button>

      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="h-full w-full object-contain"
      />
    </div>
  );
}
