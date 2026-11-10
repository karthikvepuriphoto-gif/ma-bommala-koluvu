export interface RenderedFilm {
  blob: Blob;
  mimeType: string;
  ext: string;
  title: string;
}

let last: RenderedFilm | null = null;

export function setLastFilm(film: RenderedFilm) {
  last = film;
}

export function getLastFilm(): RenderedFilm | null {
  return last;
}
