import { FOLDER_FILMS, FOLDER_PHOTOS, FOLDER_ROOT, FOLDER_VOICE, CATALOG_NAME } from "../config";
import type { DriveMeta } from "../types";
import { AuthExpiredError, OfflineError } from "./errors";

async function api(token: string, url: string, init: RequestInit = {}): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new OfflineError();
  }
  if (response.status === 401) throw new AuthExpiredError();
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`drive-${response.status}:${detail.slice(0, 160)}`);
  }
  return response;
}

function escapeName(name: string): string {
  return name.replaceAll("'", "\\'");
}

export async function queryFiles(token: string, q: string): Promise<{ id: string; name: string }[]> {
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&spaces=drive&fields=files(id,name)&pageSize=10`;
  const response = await api(token, url);
  const json = (await response.json()) as { files?: { id: string; name: string }[] };
  return json.files ?? [];
}

export async function ensureFolder(token: string, name: string, parentId?: string): Promise<string> {
  const parts = [
    `name = '${escapeName(name)}'`,
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false",
    parentId ? `'${parentId}' in parents` : null,
  ].filter((part): part is string => Boolean(part));
  const found = await queryFiles(token, parts.join(" and "));
  if (found[0]) return found[0].id;
  const response = await api(token, "https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentId ? [parentId] : undefined,
    }),
  });
  const json = (await response.json()) as { id: string };
  return json.id;
}

export async function findChild(token: string, name: string, parentId: string): Promise<string | null> {
  const q = [`name = '${escapeName(name)}'`, `'${parentId}' in parents`, "trashed = false"].join(" and ");
  const found = await queryFiles(token, q);
  return found[0]?.id ?? null;
}

export async function ensureLayout(token: string, existing?: DriveMeta): Promise<DriveMeta> {
  if (existing?.rootId && existing.photosId && existing.voiceId && existing.filmsId) return existing;
  const rootId = existing?.rootId || (await ensureFolder(token, FOLDER_ROOT));
  const photosId = existing?.photosId || (await ensureFolder(token, FOLDER_PHOTOS, rootId));
  const voiceId = existing?.voiceId || (await ensureFolder(token, FOLDER_VOICE, rootId));
  const filmsId = existing?.filmsId || (await ensureFolder(token, FOLDER_FILMS, rootId));
  let catalogId = existing?.catalogId;
  if (!catalogId) catalogId = (await findChild(token, CATALOG_NAME, rootId)) ?? undefined;
  return { rootId, photosId, voiceId, filmsId, catalogId };
}

export async function uploadFile(
  token: string,
  opts: { name: string; mime: string; blob: Blob; parentId?: string; fileId?: string },
): Promise<string> {
  if (opts.blob.size > 5 * 1024 * 1024) return uploadResumable(token, opts);
  return uploadMultipart(token, opts);
}

async function uploadMultipart(
  token: string,
  opts: { name: string; mime: string; blob: Blob; parentId?: string; fileId?: string },
): Promise<string> {
  const boundary = `mbk${crypto.randomUUID().replaceAll("-", "")}`;
  const meta: Record<string, unknown> = { name: opts.name, mimeType: opts.mime };
  if (!opts.fileId && opts.parentId) meta.parents = [opts.parentId];
  const head =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
    `--${boundary}\r\nContent-Type: ${opts.mime}\r\n\r\n`;
  const tail = `\r\n--${boundary}--`;
  const body = new Blob([head, opts.blob, tail]);
  const url = opts.fileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${opts.fileId}?uploadType=multipart`
    : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
  const response = await api(token, url, {
    method: opts.fileId ? "PATCH" : "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  const json = (await response.json()) as { id: string };
  return json.id;
}

async function uploadResumable(
  token: string,
  opts: { name: string; mime: string; blob: Blob; parentId?: string; fileId?: string },
): Promise<string> {
  const meta: Record<string, unknown> = { name: opts.name, mimeType: opts.mime };
  if (!opts.fileId && opts.parentId) meta.parents = [opts.parentId];
  const url = opts.fileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${opts.fileId}?uploadType=resumable`
    : "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable";
  const start = await api(token, url, {
    method: opts.fileId ? "PATCH" : "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": opts.mime,
      "X-Upload-Content-Length": String(opts.blob.size),
    },
    body: JSON.stringify(meta),
  });
  const location = start.headers.get("Location");
  if (!location) throw new Error("drive-location");
  const put = await api(token, location, {
    method: "PUT",
    headers: { "Content-Type": opts.mime },
    body: opts.blob,
  });
  const json = (await put.json()) as { id: string };
  return json.id || opts.fileId || "";
}

export async function downloadBlob(token: string, fileId: string): Promise<Blob> {
  const response = await api(token, `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
  return response.blob();
}

export async function downloadText(token: string, fileId: string): Promise<string> {
  const response = await api(token, `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
  return response.text();
}

export async function shareReader(token: string, fileId: string, email: string): Promise<void> {
  await api(
    token,
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions?sendNotificationEmail=true`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "reader", type: "user", emailAddress: email }),
    },
  );
}

export async function trashFile(token: string, fileId: string): Promise<void> {
  await api(token, `https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trashed: true }),
  });
}
