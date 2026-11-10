import { emptyCatalog, type Catalog, type Doll, type FilmItem, type Tombstone, type YearShot } from "../types";

function later(a: string, b: string): boolean {
  return a >= b;
}

function mergeDolls(
  local: Doll[],
  remote: Doll[],
  preferLocal: Set<string>,
): Map<string, Doll> {
  const map = new Map<string, Doll>();
  for (const doll of remote) map.set(doll.id, doll);
  for (const doll of local) {
    const prev = map.get(doll.id);
    if (!prev || preferLocal.has(doll.id) || later(doll.updatedAt, prev.updatedAt)) {
      map.set(doll.id, doll);
    }
  }
  return map;
}

function mergeTombstones(local: Tombstone[], remote: Tombstone[]): Map<string, Tombstone> {
  const map = new Map<string, Tombstone>();
  for (const tomb of [...remote, ...local]) {
    const prev = map.get(tomb.id);
    if (!prev || later(tomb.deletedAt, prev.deletedAt)) map.set(tomb.id, tomb);
  }
  return map;
}

function mergeById<T extends { id: string; updatedAt: string }>(local: T[], remote: T[], prefer: Set<string>): T[] {
  const map = new Map<string, T>();
  for (const item of remote) map.set(item.id, item);
  for (const item of local) {
    const prev = map.get(item.id);
    if (!prev || prefer.has(item.id) || later(item.updatedAt, prev.updatedAt)) map.set(item.id, item);
  }
  return [...map.values()];
}

export function mergeCatalogs(local: Catalog | null, remote: Catalog | null, preferLocalIds: Set<string>): Catalog {
  if (!local && !remote) return emptyCatalog();
  const dolls = mergeDolls(local?.dolls ?? [], remote?.dolls ?? [], preferLocalIds);
  const deleted = mergeTombstones(local?.deleted ?? [], remote?.deleted ?? []);
  for (const [id, tomb] of deleted) {
    const doll = dolls.get(id);
    if (doll && later(doll.updatedAt, tomb.deletedAt) && doll.updatedAt !== tomb.deletedAt) {
      deleted.delete(id);
    } else {
      dolls.delete(id);
    }
  }
  const cutoff = Date.now() - 180 * 24 * 60 * 60 * 1000;
  const yearPrefer = new Set((local?.years ?? []).filter((item) => preferLocalIds.has(item.id)).map((item) => item.id));
  const filmPrefer = new Set((local?.films ?? []).filter((item) => preferLocalIds.has(item.id)).map((item) => item.id));
  return {
    version: 1,
    dolls: [...dolls.values()],
    years: mergeById<YearShot>(local?.years ?? [], remote?.years ?? [], yearPrefer),
    films: mergeById<FilmItem>(local?.films ?? [], remote?.films ?? [], filmPrefer),
    deleted: [...deleted.values()].filter((tomb) => Date.parse(tomb.deletedAt) >= cutoff),
    updatedAt: new Date().toISOString(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

export function parseCatalog(raw: unknown): Catalog | null {
  if (!isRecord(raw) || !Array.isArray(raw.dolls)) return null;
  const dolls = raw.dolls.filter((item): item is Doll => isRecord(item) && typeof item.id === "string");
  const years = Array.isArray(raw.years)
    ? raw.years.filter((item): item is YearShot => isRecord(item) && typeof item.id === "string")
    : [];
  const films = Array.isArray(raw.films)
    ? raw.films.filter((item): item is FilmItem => isRecord(item) && typeof item.id === "string")
    : [];
  const deleted = Array.isArray(raw.deleted)
    ? raw.deleted.filter((item): item is Tombstone => isRecord(item) && typeof item.id === "string" && typeof item.deletedAt === "string")
    : [];
  return {
    version: 1,
    dolls,
    years,
    films,
    deleted,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
}
