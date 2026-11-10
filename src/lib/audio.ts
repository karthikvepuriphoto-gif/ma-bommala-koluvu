const AUDIO_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/aac", "audio/mpeg"];

export function pickAudioMime(isSupported: (type: string) => boolean): string {
  return AUDIO_TYPES.find((type) => isSupported(type)) ?? "";
}

export function audioExtension(mime: string): string {
  if (mime.includes("mp4") || mime.includes("aac")) return "mp4";
  if (mime.includes("mpeg")) return "mp3";
  return "webm";
}
