export interface VoiceNote {
  id: string;
  mimeType: string;
  durationMs: number;
  createdAt: string;
  localKey?: string;
  driveFileId?: string;
}

export interface Doll {
  id: string;
  name: string;
  step: number | null;
  theme: string;
  givenBy: string;
  givenWhen: string;
  yearJoined: string;
  material: string;
  condition: "" | "good" | "repair";
  storageBox: string;
  notes: string;
  photoLocalKey?: string;
  photoDriveId?: string;
  voiceNotes: VoiceNote[];
  createdAt: string;
  updatedAt: string;
  order: number;
}

export interface YearShot {
  id: string;
  year: number;
  localKey?: string;
  driveFileId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FilmItem {
  id: string;
  title: string;
  mimeType: string;
  localKey?: string;
  driveFileId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Tombstone {
  id: string;
  deletedAt: string;
}

export interface Catalog {
  version: 1;
  dolls: Doll[];
  years: YearShot[];
  films: FilmItem[];
  deleted: Tombstone[];
  updatedAt: string;
}

export interface BlobRecord {
  id: string;
  blob: Blob;
  mime: string;
  driveFileId?: string;
  needsUpload: boolean;
}

export interface DriveMeta {
  rootId: string;
  photosId: string;
  voiceId: string;
  filmsId: string;
  catalogId?: string;
}

export interface SyncState {
  meta?: DriveMeta;
  dirtyDollIds: string[];
  dirtyYearIds: string[];
  dirtyFilmIds: string[];
}

export function emptySync(): SyncState {
  return { dirtyDollIds: [], dirtyYearIds: [], dirtyFilmIds: [] };
}

export function emptyCatalog(): Catalog {
  return {
    version: 1,
    dolls: [],
    years: [],
    films: [],
    deleted: [],
    updatedAt: new Date().toISOString(),
  };
}

export function makeDoll(order: number): Doll {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: "",
    step: null,
    theme: "",
    givenBy: "",
    givenWhen: "",
    yearJoined: "",
    material: "",
    condition: "",
    storageBox: "",
    notes: "",
    voiceNotes: [],
    createdAt: now,
    updatedAt: now,
    order,
  };
}

export function isBlank(doll: Doll): boolean {
  return (
    !doll.name.trim() &&
    !doll.photoLocalKey &&
    !doll.photoDriveId &&
    doll.voiceNotes.length === 0 &&
    !doll.notes.trim() &&
    !doll.theme.trim() &&
    !doll.givenBy.trim() &&
    !doll.givenWhen.trim() &&
    !doll.yearJoined.trim() &&
    !doll.material.trim() &&
    !doll.condition &&
    !doll.storageBox.trim() &&
    doll.step == null
  );
}

export function dollTitle(doll: Doll, fallback: string): string {
  const name = doll.name.trim();
  return name || fallback;
}
