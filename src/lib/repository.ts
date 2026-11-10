import { useSyncExternalStore } from "react";
import { CATALOG_NAME } from "../config";
import { isGoogleConfigured } from "../config";
import {
  emptyCatalog,
  emptySync,
  isBlank,
  makeDoll,
  type BlobRecord,
  type Catalog,
  type Doll,
  type DriveMeta,
  type FilmItem,
  type SyncState,
  type YearShot,
} from "../types";
import { audioExtension } from "./audio";
import {
  ensureYouTubeToken,
  fetchEmail,
  getValidToken,
  invalidateToken,
  peekSession,
  peekToken,
  rememberEmail,
} from "./auth";
import { downloadBlob, downloadText, ensureLayout, findChild, shareReader, trashFile, uploadFile } from "./drive";
import { isAuthError, OfflineError } from "./errors";
import { blobDelete, blobGet, blobPut, kvGet, kvSet } from "./idb";
import { mergeCatalogs, parseCatalog } from "./merge";

export type AppMode = "loading" | "setup" | "signin" | "demo" | "google";
export type Phase = "idle" | "syncing" | "offline" | "auth" | "error";
export type Lang = "en" | "te";

export interface Snapshot {
  ready: boolean;
  mode: AppMode;
  email: string;
  lang: Lang;
  phase: Phase;
  banner: string;
  catalog: Catalog;
  sync: SyncState;
  blobEpoch: number;
}

let ready = false;
let mode: AppMode = "loading";
let email = "";
let lang: Lang = "en";
let phase: Phase = "idle";
let banner = "";
let catalog = emptyCatalog();
let syncState = emptySync();
let blobEpoch = 0;
let storageKey = "demo";
let snapshot: Snapshot = build();
const listeners = new Set<() => void>();
const dollGen = new Map<string, number>();
const yearGen = new Map<string, number>();
const filmGen = new Map<string, number>();
let flushing = false;
let flushAgain = false;
let flushTimer: number | null = null;
let booted = false;
let netBound = false;

function build(): Snapshot {
  return { ready, mode, email, lang, phase, banner, catalog, sync: syncState, blobEpoch };
}

function emit() {
  snapshot = build();
  listeners.forEach((listener) => listener());
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot() {
  return snapshot;
}

export function useApp() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function storedLang(): Lang {
  try {
    return localStorage.getItem("mbk-lang") === "te" ? "te" : "en";
  } catch {
    return "en";
  }
}

export function setLanguage(next: Lang) {
  lang = next;
  try {
    localStorage.setItem("mbk-lang", next);
  } catch {
    /* ignore */
  }
  document.documentElement.lang = next === "te" ? "te" : "en";
  emit();
}

async function persist() {
  await kvSet(`catalog:${storageKey}`, catalog);
  await kvSet(`sync:${storageKey}`, syncState);
  emit();
}

async function loadStorage(key: string) {
  storageKey = key;
  const stored = await kvGet<Catalog>(`catalog:${key}`);
  catalog = stored ?? emptyCatalog();
  catalog.dolls ??= [];
  catalog.years ??= [];
  catalog.films ??= [];
  catalog.deleted ??= [];
  const sync = await kvGet<SyncState>(`sync:${key}`);
  syncState = sync ?? emptySync();
  syncState.dirtyDollIds ??= [];
  syncState.dirtyYearIds ??= [];
  syncState.dirtyFilmIds ??= [];
  emit();
}

function touch(map: Map<string, number>, list: string[], id: string): string[] {
  map.set(id, (map.get(id) ?? 0) + 1);
  return list.includes(id) ? list : [...list, id];
}

function touchDoll(id: string) {
  syncState = { ...syncState, dirtyDollIds: touch(dollGen, syncState.dirtyDollIds, id) };
}

function touchYear(id: string) {
  syncState = { ...syncState, dirtyYearIds: touch(yearGen, syncState.dirtyYearIds, id) };
}

function touchFilm(id: string) {
  syncState = { ...syncState, dirtyFilmIds: touch(filmGen, syncState.dirtyFilmIds, id) };
}

function scheduleFlush() {
  if (mode !== "google") return;
  if (flushTimer != null) window.clearTimeout(flushTimer);
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void flush();
  }, 700);
}

function bindNet() {
  if (netBound) return;
  netBound = true;
  window.addEventListener("online", () => {
    if (phase === "auth") return;
    void flush();
  });
  window.setInterval(() => {
    if (phase === "auth") return;
    void flush();
  }, 30_000);
}

async function putBlob(record: BlobRecord) {
  await blobPut(record);
  blobEpoch += 1;
}

export async function createDoll(): Promise<string> {
  const order = catalog.dolls.reduce((max, doll) => Math.max(max, doll.order), 0) + 1;
  const doll = makeDoll(order);
  catalog = { ...catalog, dolls: [...catalog.dolls, doll], updatedAt: doll.updatedAt };
  await persist();
  return doll.id;
}

export async function patchDoll(id: string, partial: Partial<Doll>) {
  const existing = catalog.dolls.find((doll) => doll.id === id);
  if (!existing) return;
  const next: Doll = {
    ...existing,
    ...partial,
    id: existing.id,
    createdAt: existing.createdAt,
    order: existing.order,
    voiceNotes: partial.voiceNotes ?? existing.voiceNotes,
    updatedAt: new Date().toISOString(),
  };
  catalog = {
    ...catalog,
    dolls: catalog.dolls.map((doll) => (doll.id === id ? next : doll)),
    updatedAt: next.updatedAt,
  };
  if (mode === "google") touchDoll(id);
  await persist();
  scheduleFlush();
}

export async function setDollPhoto(id: string, blob: Blob) {
  const key = crypto.randomUUID();
  await putBlob({ id: key, blob, mime: blob.type || "image/jpeg", needsUpload: mode === "google" });
  await patchDoll(id, { photoLocalKey: key, photoDriveId: undefined });
}

export async function addVoice(dollId: string, blob: Blob, mime: string, durationMs: number) {
  const doll = catalog.dolls.find((item) => item.id === dollId);
  if (!doll) return;
  const key = crypto.randomUUID();
  const note = {
    id: crypto.randomUUID(),
    mimeType: mime || blob.type || "audio/webm",
    durationMs,
    createdAt: new Date().toISOString(),
    localKey: key,
  };
  await putBlob({ id: key, blob, mime: note.mimeType, needsUpload: mode === "google" });
  await patchDoll(dollId, { voiceNotes: [...doll.voiceNotes, note] });
}

export async function removeVoice(dollId: string, voiceId: string) {
  const doll = catalog.dolls.find((item) => item.id === dollId);
  if (!doll) return;
  const voice = doll.voiceNotes.find((item) => item.id === voiceId);
  await patchDoll(dollId, { voiceNotes: doll.voiceNotes.filter((item) => item.id !== voiceId) });
  if (voice?.localKey) await blobDelete(voice.localKey);
}

export async function deleteDoll(id: string): Promise<Doll | null> {
  const doll = catalog.dolls.find((item) => item.id === id) ?? null;
  if (!doll) return null;
  const now = new Date().toISOString();
  catalog = {
    ...catalog,
    dolls: catalog.dolls.filter((item) => item.id !== id),
    deleted: [...catalog.deleted.filter((item) => item.id !== id), { id, deletedAt: now }],
    updatedAt: now,
  };
  if (mode === "google") touchDoll(id);
  await persist();
  scheduleFlush();
  return doll;
}

export async function restoreDoll(doll: Doll) {
  const revived = { ...doll, updatedAt: new Date().toISOString() };
  catalog = {
    ...catalog,
    dolls: [...catalog.dolls.filter((item) => item.id !== doll.id), revived],
    deleted: catalog.deleted.filter((item) => item.id !== doll.id),
    updatedAt: revived.updatedAt,
  };
  if (mode === "google") touchDoll(doll.id);
  await persist();
  scheduleFlush();
}

export async function discardIfBlank(id: string) {
  const doll = catalog.dolls.find((item) => item.id === id);
  if (!doll || !isBlank(doll)) return;
  const synced = syncState.dirtyDollIds.includes(id) || Boolean(doll.photoDriveId);
  if (synced) {
    await deleteDoll(id);
    return;
  }
  catalog = { ...catalog, dolls: catalog.dolls.filter((item) => item.id !== id) };
  syncState = { ...syncState, dirtyDollIds: syncState.dirtyDollIds.filter((item) => item !== id) };
  await persist();
}

export async function purgeDollFiles(doll: Doll) {
  const keys = [doll.photoLocalKey, ...doll.voiceNotes.map((voice) => voice.localKey)].filter((key): key is string => Boolean(key));
  for (const key of keys) await blobDelete(key);
  if (mode !== "google") return;
  const token = peekToken();
  if (!token) return;
  const ids = [doll.photoDriveId, ...doll.voiceNotes.map((voice) => voice.driveFileId)].filter((id): id is string => Boolean(id));
  for (const id of ids) {
    try {
      await trashFile(token, id);
    } catch {
      /* leftover file is harmless */
    }
  }
}

export async function setYearPhoto(year: number, blob: Blob) {
  const key = crypto.randomUUID();
  await putBlob({ id: key, blob, mime: blob.type || "image/jpeg", needsUpload: mode === "google" });
  const now = new Date().toISOString();
  const existing = catalog.years.find((item) => item.year === year);
  let item: YearShot;
  if (existing) {
    item = { ...existing, localKey: key, driveFileId: undefined, updatedAt: now };
    catalog = { ...catalog, years: catalog.years.map((row) => (row.id === existing.id ? item : row)), updatedAt: now };
  } else {
    item = { id: crypto.randomUUID(), year, localKey: key, createdAt: now, updatedAt: now };
    catalog = { ...catalog, years: [...catalog.years, item], updatedAt: now };
  }
  if (mode === "google") touchYear(item.id);
  await persist();
  scheduleFlush();
}

export async function saveFilm(blob: Blob, mime: string, title: string): Promise<string> {
  const key = crypto.randomUUID();
  await putBlob({ id: key, blob, mime, needsUpload: mode === "google" });
  const now = new Date().toISOString();
  const item: FilmItem = {
    id: crypto.randomUUID(),
    title,
    mimeType: mime,
    localKey: key,
    createdAt: now,
    updatedAt: now,
  };
  catalog = { ...catalog, films: [...catalog.films, item], updatedAt: now };
  if (mode === "google") touchFilm(item.id);
  await persist();
  scheduleFlush();
  return item.id;
}

function safeFile(name: string): string {
  const cleaned = name.replace(/[^\w\u0C00-\u0C7F .-]+/g, " ").trim().slice(0, 80);
  return cleaned || "film";
}

function unchanged(ids: string[], gens: Map<string, number>, started: Map<string, number>) {
  return ids.filter((id) => (gens.get(id) ?? 0) !== (started.get(id) ?? 0));
}

async function uploadDirtyMedia(token: string, meta: DriveMeta) {
  for (const id of [...syncState.dirtyDollIds]) {
    const doll = catalog.dolls.find((item) => item.id === id);
    if (!doll) continue;
    let photoId: string | undefined;
    let photoKey: string | undefined;
    if (doll.photoLocalKey) {
      const record = await blobGet(doll.photoLocalKey);
      if (record?.needsUpload) {
        photoId = await uploadFile(token, {
          name: `${doll.id}.jpg`,
          mime: record.mime || "image/jpeg",
          blob: record.blob,
          parentId: meta.photosId,
        });
        photoKey = doll.photoLocalKey;
        record.needsUpload = false;
        record.driveFileId = photoId;
        await blobPut(record);
      }
    }
    const voiceIds = new Map<string, string>();
    for (const voice of doll.voiceNotes) {
      if (!voice.localKey) continue;
      const record = await blobGet(voice.localKey);
      if (!record?.needsUpload) continue;
      const fileId = await uploadFile(token, {
        name: `${doll.id}-${voice.id}.${audioExtension(record.mime || voice.mimeType)}`,
        mime: record.mime || voice.mimeType || "audio/webm",
        blob: record.blob,
        parentId: meta.voiceId,
      });
      record.needsUpload = false;
      record.driveFileId = fileId;
      await blobPut(record);
      voiceIds.set(voice.id, fileId);
    }
    if (photoId || voiceIds.size) {
      catalog = {
        ...catalog,
        dolls: catalog.dolls.map((item) => {
          if (item.id !== id) return item;
          return {
            ...item,
            photoDriveId: photoId && item.photoLocalKey === photoKey ? photoId : item.photoDriveId,
            voiceNotes: item.voiceNotes.map((voice) =>
              voiceIds.has(voice.id) ? { ...voice, driveFileId: voiceIds.get(voice.id) } : voice,
            ),
          };
        }),
      };
    }
  }

  for (const id of [...syncState.dirtyYearIds]) {
    const year = catalog.years.find((item) => item.id === id);
    if (!year?.localKey) continue;
    const record = await blobGet(year.localKey);
    if (!record?.needsUpload) continue;
    const fileId = await uploadFile(token, {
      name: `year-${year.year}.jpg`,
      mime: record.mime || "image/jpeg",
      blob: record.blob,
      parentId: meta.photosId,
    });
    record.needsUpload = false;
    record.driveFileId = fileId;
    await blobPut(record);
    const key = year.localKey;
    catalog = {
      ...catalog,
      years: catalog.years.map((item) => (item.id === id && item.localKey === key ? { ...item, driveFileId: fileId } : item)),
    };
  }

  for (const id of [...syncState.dirtyFilmIds]) {
    const film = catalog.films.find((item) => item.id === id);
    if (!film?.localKey) continue;
    const record = await blobGet(film.localKey);
    if (!record?.needsUpload) continue;
    const ext = (record.mime || film.mimeType).includes("mp4") ? "mp4" : "webm";
    const fileId = await uploadFile(token, {
      name: `${safeFile(film.title)}.${ext}`,
      mime: record.mime || film.mimeType || "video/webm",
      blob: record.blob,
      parentId: meta.filmsId,
    });
    record.needsUpload = false;
    record.driveFileId = fileId;
    await blobPut(record);
    const key = film.localKey;
    catalog = {
      ...catalog,
      films: catalog.films.map((item) => (item.id === id && item.localKey === key ? { ...item, driveFileId: fileId } : item)),
    };
  }
}

async function cacheRemoteMedia(token: string) {
  const jobs: { key: string; fileId: string }[] = [];
  for (const doll of catalog.dolls) {
    if (doll.photoDriveId) jobs.push({ key: doll.photoLocalKey || `drive:${doll.photoDriveId}`, fileId: doll.photoDriveId });
    for (const voice of doll.voiceNotes) {
      if (voice.driveFileId) jobs.push({ key: voice.localKey || `drive:${voice.driveFileId}`, fileId: voice.driveFileId });
    }
  }
  for (const year of catalog.years) {
    if (year.driveFileId) jobs.push({ key: year.localKey || `drive:${year.driveFileId}`, fileId: year.driveFileId });
  }
  for (const film of catalog.films) {
    if (film.driveFileId) jobs.push({ key: film.localKey || `drive:${film.driveFileId}`, fileId: film.driveFileId });
  }
  for (const job of jobs) {
    if (await blobGet(job.key)) continue;
    try {
      const blob = await downloadBlob(token, job.fileId);
      await putBlob({
        id: job.key,
        blob,
        mime: blob.type || "application/octet-stream",
        driveFileId: job.fileId,
        needsUpload: false,
      });
      emit();
    } catch (error) {
      if (isAuthError(error)) throw error;
    }
  }
}

async function flushOnce() {
  const startedDolls = new Map(dollGen);
  const startedYears = new Map(yearGen);
  const startedFilms = new Map(filmGen);
  const token = await getValidToken();
  let meta = await ensureLayout(token, syncState.meta);
  await uploadDirtyMedia(token, meta);
  const body = new Blob([JSON.stringify(catalog)], { type: "application/json" });
  const catalogId = await uploadFile(token, {
    name: CATALOG_NAME,
    mime: "application/json",
    blob: body,
    parentId: meta.rootId,
    fileId: meta.catalogId,
  });
  meta = { ...meta, catalogId };
  syncState = {
    ...syncState,
    meta,
    dirtyDollIds: unchanged(syncState.dirtyDollIds, dollGen, startedDolls),
    dirtyYearIds: unchanged(syncState.dirtyYearIds, yearGen, startedYears),
    dirtyFilmIds: unchanged(syncState.dirtyFilmIds, filmGen, startedFilms),
  };
  await persist();
  const pending = syncState.dirtyDollIds.length + syncState.dirtyYearIds.length + syncState.dirtyFilmIds.length;
  if (pending > 0) flushAgain = true;
}

export async function flush() {
  if (mode !== "google" || phase === "auth") return;
  const pending = syncState.dirtyDollIds.length + syncState.dirtyYearIds.length + syncState.dirtyFilmIds.length;
  if (!pending) return;
  if (!navigator.onLine) {
    phase = "offline";
    emit();
    return;
  }
  if (flushing) {
    flushAgain = true;
    return;
  }
  flushing = true;
  phase = "syncing";
  emit();
  try {
    do {
      flushAgain = false;
      await flushOnce();
    } while (flushAgain && navigator.onLine);
    const left = syncState.dirtyDollIds.length + syncState.dirtyYearIds.length + syncState.dirtyFilmIds.length;
    phase = left ? "error" : "idle";
    emit();
  } catch (error) {
    if (isAuthError(error)) {
      invalidateToken();
      try {
        await getValidToken();
        await flushOnce();
        phase = "idle";
      } catch (retry) {
        phase = isAuthError(retry) ? "auth" : "error";
      }
    } else if (error instanceof OfflineError || !navigator.onLine) phase = "offline";
    else phase = "error";
    emit();
  } finally {
    flushing = false;
    if (flushAgain && phase !== "auth") void flush();
  }
}

async function bootstrap() {
  if (mode !== "google") return;
  phase = "syncing";
  emit();
  try {
    const token = await getValidToken();
    let meta = await ensureLayout(token, syncState.meta);
    if (!meta.catalogId) {
      meta = { ...meta, catalogId: (await findChild(token, CATALOG_NAME, meta.rootId)) ?? undefined };
    }
    if (meta.catalogId) {
      try {
        const text = await downloadText(token, meta.catalogId);
        const remote = parseCatalog(JSON.parse(text) as unknown);
        if (remote) catalog = mergeCatalogs(catalog, remote, new Set(syncState.dirtyDollIds));
      } catch (error) {
        if (isAuthError(error)) throw error;
      }
    }
    syncState = { ...syncState, meta };
    await persist();
    await cacheRemoteMedia(token);
    phase = "idle";
    emit();
    await flush();
  } catch (error) {
    phase = isAuthError(error) ? "auth" : "offline";
    emit();
  }
}

export async function signIn() {
  banner = "";
  phase = "syncing";
  emit();
  const wasInside = mode === "google";
  try {
    const token = await getValidToken([], { interactive: true });
    const address = await fetchEmail(token);
    rememberEmail(address);
    email = address;
    await loadStorage(`google:${address}`);
    mode = "google";
    try {
      localStorage.removeItem("mbk-mode");
    } catch {
      /* ignore */
    }
    emit();
    await bootstrap();
  } catch (error) {
    if (!wasInside) {
      mode = isGoogleConfigured() ? "signin" : "setup";
      phase = "idle";
      banner = error instanceof Error && error.message === "gis-load" ? "reach" : "";
    } else {
      phase = isAuthError(error) ? "auth" : "offline";
    }
    emit();
  }
}

export function markAuthProblem() {
  phase = "auth";
  emit();
}

export async function shareWithEmail(address: string) {
  if (mode !== "google") throw new Error("needs-google");
  phase = "syncing";
  emit();
  try {
    const token = await getValidToken();
    const meta = await ensureLayout(token, syncState.meta);
    syncState = { ...syncState, meta };
    await persist();
    await shareReader(token, meta.rootId, address.trim());
    phase = "idle";
    emit();
  } catch (error) {
    phase = isAuthError(error) ? "auth" : "error";
    emit();
    throw error;
  }
}

export function signOut() {
  invalidateToken();
  mode = isGoogleConfigured() ? "signin" : "setup";
  email = "";
  catalog = emptyCatalog();
  syncState = emptySync();
  phase = "idle";
  banner = "";
  emit();
}

export async function enterDemo() {
  try {
    localStorage.setItem("mbk-mode", "demo");
  } catch {
    /* ignore */
  }
  await loadStorage("demo");
  mode = "demo";
  phase = "idle";
  banner = "";
  emit();
}

export function leaveDemo() {
  try {
    localStorage.removeItem("mbk-mode");
  } catch {
    /* ignore */
  }
  mode = isGoogleConfigured() ? "signin" : "setup";
  catalog = emptyCatalog();
  syncState = emptySync();
  phase = "idle";
  emit();
}

export async function boot() {
  if (booted) return;
  booted = true;
  try {
    lang = storedLang();
    document.documentElement.lang = lang === "te" ? "te" : "en";
    bindNet();
    const params = new URLSearchParams(location.search);
    let demoFlag = false;
    try {
      demoFlag = params.get("demo") === "1" || localStorage.getItem("mbk-mode") === "demo";
      if (params.get("demo") === "1") localStorage.setItem("mbk-mode", "demo");
    } catch {
      demoFlag = params.get("demo") === "1";
    }
    if (demoFlag) {
      await loadStorage("demo");
      mode = "demo";
      ready = true;
      emit();
      return;
    }
    if (!isGoogleConfigured()) {
      mode = "setup";
      ready = true;
      emit();
      return;
    }
    const existing = peekSession();
    if (!existing?.email) {
      mode = "signin";
      ready = true;
      emit();
      return;
    }
    email = existing.email;
    await loadStorage(`google:${existing.email}`);
    mode = "google";
    ready = true;
    emit();
    await bootstrap();
  } catch {
    mode = isGoogleConfigured() ? "signin" : "setup";
    ready = true;
    phase = "idle";
    emit();
  }
}

export { ensureYouTubeToken };
