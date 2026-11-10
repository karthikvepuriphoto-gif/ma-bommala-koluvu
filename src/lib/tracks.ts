export const MUSIC_TRACKS = [
  { id: "drone", file: "drone.mp3" },
  { id: "flute", file: "flute.mp3" },
  { id: "veena", file: "veena.mp3" },
  { id: "drums", file: "drums.mp3" },
] as const;

export type MusicTrackId = (typeof MUSIC_TRACKS)[number]["id"];

export function musicFileUrl(file: string): string {
  return `${import.meta.env.BASE_URL}music/${file}`;
}
