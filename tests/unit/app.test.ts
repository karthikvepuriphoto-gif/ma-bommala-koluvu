import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { BASE_SCOPES, GOOGLE_CLIENT_ID, YOUTUBE_SCOPE, isGoogleConfigured } from "../../src/config";
import { pickAudioMime } from "../../src/lib/audio";
import { NO_VOICE_MS, TITLE_MS, VOICE_PAD_MS, defaultOrder, planSlides } from "../../src/lib/filmPlan";
import { mergeCatalogs } from "../../src/lib/merge";
import { buildVideoResource, videosInsertUrl } from "../../src/lib/youtube";
import { emptyCatalog, type Catalog, type Doll } from "../../src/types";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return [path];
  });
}

function doll(partial: Partial<Doll> & Pick<Doll, "id" | "updatedAt">): Doll {
  return {
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
    createdAt: partial.updatedAt,
    order: 1,
    ...partial,
  };
}

describe("google sign-in config", () => {
  test("the web client id is set and youtube is not part of the first sign-in", () => {
    expect(isGoogleConfigured()).toBe(true);
    expect(isGoogleConfigured("")).toBe(false);
    expect(isGoogleConfigured("YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com")).toBe(false);
    expect(GOOGLE_CLIENT_ID.endsWith(".apps.googleusercontent.com")).toBe(true);
    expect(BASE_SCOPES.join(" ")).not.toContain("youtube");
    expect(YOUTUBE_SCOPE).toBe("https://www.googleapis.com/auth/youtube.upload");
  });
});

describe("catalog merge", () => {
  test("newer remote doll wins unless the local edit is still pending", () => {
    const local = emptyCatalog();
    const remote = emptyCatalog();
    local.dolls = [doll({ id: "a", name: "Local", updatedAt: "2026-01-01T00:00:00.000Z" })];
    remote.dolls = [doll({ id: "a", name: "Remote", updatedAt: "2026-02-01T00:00:00.000Z" })];
    expect(mergeCatalogs(local, remote, new Set()).dolls[0]?.name).toBe("Remote");
    expect(mergeCatalogs(local, remote, new Set(["a"])).dolls[0]?.name).toBe("Local");
  });

  test("a newer removal hides the doll and a later edit brings it back", () => {
    const withDoll: Catalog = {
      ...emptyCatalog(),
      dolls: [doll({ id: "a", name: "Lakshmi", updatedAt: "2026-01-01T00:00:00.000Z" })],
    };
    const removed: Catalog = {
      ...emptyCatalog(),
      deleted: [{ id: "a", deletedAt: "2026-03-01T00:00:00.000Z" }],
    };
    expect(mergeCatalogs(withDoll, removed, new Set()).dolls).toHaveLength(0);
    const revived: Catalog = {
      ...emptyCatalog(),
      dolls: [doll({ id: "a", name: "Lakshmi", updatedAt: "2026-04-01T00:00:00.000Z" })],
    };
    expect(mergeCatalogs(revived, removed, new Set()).dolls).toHaveLength(1);
  });
});

describe("film plan", () => {
  test("orders by step then the order added, and times slides from the voice note", () => {
    const dolls = [
      { id: "b", step: 2, order: 1, voiceMs: null },
      { id: "a", step: 1, order: 2, voiceMs: 2500 },
      { id: "c", step: null, order: 0, voiceMs: null },
    ];
    expect(defaultOrder(dolls)).toEqual(["a", "b", "c"]);
    const slides = planSlides({
      dolls,
      orderIds: defaultOrder(dolls),
      includeIds: ["a", "b", "c"],
      title: true,
      closing: true,
    });
    expect(slides.map((slide) => slide.kind)).toEqual(["title", "doll", "doll", "doll", "closing"]);
    expect(slides[0]?.durationMs).toBe(TITLE_MS);
    expect(slides[1]?.durationMs).toBe(2500 + VOICE_PAD_MS);
    expect(slides[2]?.durationMs).toBe(NO_VOICE_MS);
    expect(slides[4]?.durationMs).toBe(TITLE_MS);
  });
});

describe("voice recording types", () => {
  test("prefers webm opus and can fall back to mp4 for Safari", () => {
    expect(pickAudioMime((type) => type.startsWith("audio/webm"))).toBe("audio/webm;codecs=opus");
    expect(pickAudioMime((type) => type === "audio/mp4")).toBe("audio/mp4");
  });
});

describe("youtube upload", () => {
  test("the upload request never contains a forbidden visibility and does not notify subscribers", () => {
    const forbidden = "public";
    for (const privacy of ["unlisted", "private"] as const) {
      const body = buildVideoResource({
        title: "Ma Bommala Koluvu",
        description: "A family film.",
        privacy,
      });
      const json = JSON.stringify(body);
      expect(json).not.toContain(forbidden);
      expect(body.status.privacyStatus).toBe(privacy);
      expect(body.status.selfDeclaredMadeForKids).toBe(false);
    }
    expect(videosInsertUrl()).toContain("notifySubscribers=false");
    expect(videosInsertUrl()).not.toContain(forbidden);
    expect(() => buildVideoResource({ title: "t", description: "d", privacy: forbidden })).toThrow();
  });

  test("app source never offers that visibility", () => {
    const forbidden = "public";
    const files = [...walk("src"), "index.html"].filter((file) => /\.(ts|tsx|css|html)$/.test(file));
    for (const file of files) {
      expect(readFileSync(file, "utf8").toLowerCase(), file).not.toContain(forbidden);
    }
  });
});
