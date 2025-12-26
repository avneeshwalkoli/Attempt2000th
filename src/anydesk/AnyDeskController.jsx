export async function startAnyDeskSession() {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: false
  });

  return stream;
}
