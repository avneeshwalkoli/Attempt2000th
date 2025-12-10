import { useCallback, useEffect, useState } from 'react';

export function useMediaDevices({
  initialAudioEnabled = true,
  initialVideoEnabled = true,
} = {}) {
  const [localStream, setLocalStream] = useState(null);
  const [isAudioEnabled, setIsAudioEnabled] = useState(initialAudioEnabled);
  const [isVideoEnabled, setIsVideoEnabled] = useState(initialVideoEnabled);
  const [audioDevices, setAudioDevices] = useState([]);
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState('');
  const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState('');

  const updateStream = useCallback(
    async (overrides = {}) => {
      const {
        audioEnabled = isAudioEnabled,
        videoEnabled = isVideoEnabled,
        audioDeviceId = selectedAudioDeviceId,
        videoDeviceId = selectedVideoDeviceId,
      } = overrides;

      const constraints = {
        audio: audioEnabled
          ? audioDeviceId
            ? { deviceId: { exact: audioDeviceId } }
            : true
          : false,
        video: videoEnabled
          ? videoDeviceId
            ? { deviceId: { exact: videoDeviceId }, width: 1280, height: 720 }
            : { width: 1280, height: 720 }
          : false,
      };

      if (localStream) {
        localStream.getTracks().forEach((t) => t.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setLocalStream(stream);
      return stream;
    },
    [
      isAudioEnabled,
      isVideoEnabled,
      selectedAudioDeviceId,
      selectedVideoDeviceId,
      localStream,
    ]
  );

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        const stream = await updateStream();
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        const devices = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;

        const audioInputs = devices.filter((d) => d.kind === 'audioinput');
        const videoInputs = devices.filter((d) => d.kind === 'videoinput');

        setAudioDevices(audioInputs);
        setVideoDevices(videoInputs);

        if (!selectedAudioDeviceId && audioInputs[0]) {
          setSelectedAudioDeviceId(audioInputs[0].deviceId);
        }
        if (!selectedVideoDeviceId && videoInputs[0]) {
          setSelectedVideoDeviceId(videoInputs[0].deviceId);
        }
      } catch (error) {
        console.error('Error initializing media devices:', error);
      }
    };

    init();

    return () => {
      cancelled = true;
      if (localStream) {
        localStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [updateStream]);

  const toggleAudio = useCallback(async () => {
    const enabled = !isAudioEnabled;
    setIsAudioEnabled(enabled);
    if (!localStream && enabled) {
      await updateStream({ audioEnabled: true });
      return;
    }
    if (localStream) {
      localStream.getAudioTracks().forEach((t) => {
        t.enabled = enabled;
      });
    }
  }, [isAudioEnabled, localStream, updateStream]);

  const toggleVideo = useCallback(async () => {
    const enabled = !isVideoEnabled;
    setIsVideoEnabled(enabled);
    if (!localStream && enabled) {
      await updateStream({ videoEnabled: true });
      return;
    }
    if (localStream) {
      localStream.getVideoTracks().forEach((t) => {
        t.enabled = enabled;
      });
    }
  }, [isVideoEnabled, localStream, updateStream]);

  const selectAudioDevice = useCallback(
    async (deviceId) => {
      setSelectedAudioDeviceId(deviceId);
      await updateStream({ audioDeviceId: deviceId });
    },
    [updateStream]
  );

  const selectVideoDevice = useCallback(
    async (deviceId) => {
      setSelectedVideoDeviceId(deviceId);
      await updateStream({ videoDeviceId: deviceId });
    },
    [updateStream]
  );

  return {
    localStream,
    isAudioEnabled,
    isVideoEnabled,
    audioDevices,
    videoDevices,
    selectedAudioDeviceId,
    selectedVideoDeviceId,
    toggleAudio,
    toggleVideo,
    selectAudioDevice,
    selectVideoDevice,
    updateStream,
  };
}
