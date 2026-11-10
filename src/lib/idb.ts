import { openDB, type IDBPDatabase } from "idb";
import type { BlobRecord } from "../types";

interface Schema {
  kv: { key: string; value: unknown };
  blobs: { key: string; value: BlobRecord };
}

let dbPromise: Promise<IDBPDatabase<Schema>> | null = null;

function database() {
  if (!dbPromise) {
    dbPromise = openDB<Schema>("ma-bommala-koluvu", 1, {
      upgrade(db) {
        db.createObjectStore("kv");
        db.createObjectStore("blobs");
      },
    });
  }
  return dbPromise;
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const value = await (await database()).get("kv", key);
  return value as T | undefined;
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await (await database()).put("kv", value, key);
}

export async function blobGet(id: string): Promise<BlobRecord | undefined> {
  return (await database()).get("blobs", id);
}

export async function blobPut(record: BlobRecord): Promise<void> {
  await (await database()).put("blobs", record, record.id);
}

export async function blobDelete(id: string): Promise<void> {
  await (await database()).delete("blobs", id);
}
