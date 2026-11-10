import { AuthExpiredError } from "./errors";

export type AllowedPrivacy = "unlisted" | "private";

export interface VideoResource {
  snippet: { title: string; description: string; categoryId: string };
  status: { privacyStatus: AllowedPrivacy; selfDeclaredMadeForKids: false; embeddable: true };
}

export function buildVideoResource(input: {
  title: string;
  description: string;
  privacy: string;
}): VideoResource {
  if (input.privacy !== "unlisted" && input.privacy !== "private") {
    throw new Error("That sharing choice is not allowed");
  }
  return {
    snippet: {
      title: input.title,
      description: input.description,
      categoryId: "22",
    },
    status: {
      privacyStatus: input.privacy,
      selfDeclaredMadeForKids: false,
      embeddable: true,
    },
  };
}

export function videosInsertUrl(): string {
  const params = new URLSearchParams({
    uploadType: "resumable",
    part: "snippet,status",
    notifySubscribers: "false",
  });
  return `https://www.googleapis.com/upload/youtube/v3/videos?${params.toString()}`;
}

interface VideoResponse {
  id?: string;
  status?: { privacyStatus?: string };
}

function putWithProgress(url: string, token: string, blob: Blob, mime: string, onProgress?: (ratio: number) => void) {
  return new Promise<VideoResponse>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Content-Type", mime);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status === 401) {
        reject(new AuthExpiredError());
        return;
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`youtube-${xhr.status}`));
        return;
      }
      try {
        resolve(JSON.parse(xhr.responseText) as VideoResponse);
      } catch {
        reject(new Error("youtube-parse"));
      }
    };
    xhr.onerror = () => reject(new Error("youtube-network"));
    xhr.send(blob);
  });
}

export async function uploadYouTubeVideo(opts: {
  token: string;
  blob: Blob;
  title: string;
  description: string;
  privacy: AllowedPrivacy;
  onProgress?: (ratio: number) => void;
}): Promise<{ id: string; privacyStatus: string }> {
  const meta = buildVideoResource(opts);
  const mime = opts.blob.type || "video/webm";
  let start: Response;
  try {
    start = await fetch(videosInsertUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.token}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": mime,
        "X-Upload-Content-Length": String(opts.blob.size),
      },
      body: JSON.stringify(meta),
    });
  } catch {
    throw new Error("youtube-network");
  }
  if (start.status === 401) throw new AuthExpiredError();
  if (!start.ok) throw new Error(`youtube-${start.status}`);
  const location = start.headers.get("Location");
  if (!location) throw new Error("youtube-location");
  const json = await putWithProgress(location, opts.token, opts.blob, mime, opts.onProgress);
  return { id: String(json.id ?? ""), privacyStatus: String(json.status?.privacyStatus ?? "") };
}
