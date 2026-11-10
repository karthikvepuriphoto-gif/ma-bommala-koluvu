import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

async function installMediaMock(page: Page) {
  await page.addInitScript(() => {
    const Real = window.MediaRecorder;
    class FakeRecorder extends EventTarget {
      state: "inactive" | "recording" = "inactive";
      mimeType: string;
      constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
        super();
        this.mimeType = options?.mimeType || "audio/webm";
      }
      start() {
        this.state = "recording";
        this.dispatchEvent(new Event("start"));
      }
      stop() {
        this.state = "inactive";
        const blob = new Blob([Uint8Array.from([1, 2, 3, 4, 5])], { type: this.mimeType });
        const event = new Event("dataavailable");
        Object.defineProperty(event, "data", { value: blob });
        this.dispatchEvent(event);
        this.dispatchEvent(new Event("stop"));
      }
    }
    function Wrapped(this: unknown, stream: MediaStream, options?: MediaRecorderOptions) {
      const video = typeof stream?.getVideoTracks === "function" ? stream.getVideoTracks() : [];
      if (video.length === 0) return new FakeRecorder(stream, options);
      return new Real(stream, options);
    }
    Wrapped.isTypeSupported = (type: string) => type.startsWith("audio/") || Real.isTypeSupported(type);
    window.MediaRecorder = Wrapped as unknown as typeof MediaRecorder;
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext();
      const dest = context.createMediaStreamDestination();
      return dest.stream;
    };
  });
}

async function layout(page: Page) {
  const result = await page.evaluate(() => {
    const bad: { text: string; w: number; h: number }[] = [];
    for (const el of document.querySelectorAll("button, a, input, select, textarea")) {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      const min = 56;
      if (box.width < min || box.height < min) {
        bad.push({
          text: (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 80),
          w: Math.round(box.width),
          h: Math.round(box.height),
        });
      }
      if (box.left < -1 || box.right > window.innerWidth + 1) {
        bad.push({
          text: `offscreen ${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 40)}`,
          w: Math.round(box.left),
          h: Math.round(box.right),
        });
      }
    }
    const dock = document.querySelector(".dock");
    const dockBox = dock ? dock.getBoundingClientRect() : null;
    return {
      bad,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      dockBottom: dockBox ? Math.round(dockBox.bottom) : null,
      viewH: window.innerHeight,
    };
  });
  expect(result.bad, JSON.stringify(result.bad)).toEqual([]);
  expect(result.overflow).toBeLessThanOrEqual(1);
  if (result.dockBottom != null) {
    expect(Math.abs(result.dockBottom - result.viewH)).toBeLessThanOrEqual(2);
  }
}

async function shot(page: Page, name: string) {
  const dir = process.env.ARTIFACT_DIR;
  if (!dir || test.info().project.name !== "phone") return;
  mkdirSync("/tmp/mbk-shots", { recursive: true });
  const tmp = `/tmp/mbk-shots/${name}.png`;
  await page.screenshot({ path: tmp });
  const { copyFile } = await import("node:fs/promises");
  await copyFile(tmp, `${dir}/${name}.png`);
}

test("demo catalogue, voice note, steps, and a short film", async ({ page }) => {
  page.on("pageerror", (error) => {
    console.log("PAGEERROR", error.message);
  });
  await installMediaMock(page);
  await page.goto("/ma-bommala-koluvu/?demo=1");
  await expect(page.getByRole("heading", { name: /Ma Bommala Koluvu/ })).toBeVisible();
  await layout(page);

  await page.getByRole("button", { name: "Add a doll" }).click();
  await page.getByRole("textbox", { name: "Name" }).fill("Lakshmi");
  await page.getByRole("button", { name: "Step 1" }).click();
  await page.getByTestId("photo-file").setInputFiles("tests/fixtures/doll.png");
  await expect(page.getByTestId("photo-preview")).toBeVisible();
  await shot(page, "screenshot_add_doll");
  await layout(page);

  await page.getByRole("button", { name: "Record a voice note" }).click();
  await page.getByRole("button", { name: "Stop recording" }).click();
  await expect(page.getByRole("button", { name: "Keep this voice note" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Record again" })).toBeVisible();
  await shot(page, "screenshot_voice_keep");
  await layout(page);
  await page.getByRole("button", { name: "Keep this voice note" }).click();
  await page.getByRole("textbox", { name: "Typed notes" }).fill("She stands on the top step.");
  await page.getByRole("button", { name: "Back" }).click();

  await expect(page.getByRole("button", { name: /Lakshmi/ })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, "screenshot_home");
  await layout(page);

  await page.getByRole("button", { name: /Lakshmi/ }).click();
  await expect(page.getByText("She stands on the top step.")).toBeVisible();
  await expect(page.getByRole("img", { name: "Lakshmi" })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, "screenshot_doll_story");
  await layout(page);
  await page.getByRole("button", { name: "Back" }).click();

  await page.getByRole("button", { name: "Browse by step" }).click();
  await expect(page.getByRole("img", { name: "Lakshmi" })).toBeVisible();
  await shot(page, "screenshot_staircase");
  await layout(page);
  await page.getByRole("button", { name: "Back" }).click();

  await page.getByRole("button", { name: "Make a film" }).click();
  await expect(page.getByRole("button", { name: "Show a title card" })).toBeVisible();
  await page.getByRole("button", { name: "Evening flute" }).click();
  await expect(page.getByRole("button", { name: "Evening flute" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Soft", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("heading", { name: "Music", exact: true }).scrollIntoViewIfNeeded();
  await shot(page, "screenshot_film_music");
  await page.getByRole("button", { name: "Hear this" }).click();
  await layout(page);
  await page.getByRole("button", { name: "Show a title card" }).click();
  await page.getByRole("button", { name: "Show a closing card" }).click();
  await page.getByRole("button", { name: "Make the film" }).click();
  await expect(page.getByTestId("film-preview")).toBeVisible({ timeout: 40_000 });
  const src = await page.getByTestId("film-preview").getAttribute("src");
  expect(src).toBeTruthy();
  if (process.env.ARTIFACT_DIR && test.info().project.name === "phone") {
    const bytes = await page.evaluate(async () => {
      const video = document.querySelector("[data-testid='film-preview']") as HTMLVideoElement | null;
      if (!video?.src) return [];
      const response = await fetch(video.src);
      return Array.from(new Uint8Array(await response.arrayBuffer()));
    });
    if (bytes.length > 500) {
      const { writeFile } = await import("node:fs/promises");
      await writeFile(`${process.env.ARTIFACT_DIR}/sample_film_with_music.webm`, Buffer.from(bytes));
    }
  }

  await page.getByRole("button", { name: "Upload to YouTube" }).click();
  await expect(page.getByRole("heading", { name: "Upload to your YouTube channel?" })).toBeVisible();
  const body = (await page.locator("body").innerText()).toLowerCase();
  expect(body.includes("public")).toBe(false);
  await shot(page, "screenshot_youtube_confirm");
  await layout(page);

  const photo = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("ma-bommala-koluvu");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const records = await new Promise<{ mime?: string; blob?: Blob }[]>((resolve, reject) => {
      const tx = db.transaction("blobs", "readonly");
      const request = tx.objectStore("blobs").getAll();
      request.onsuccess = () => resolve(request.result as { mime?: string; blob?: Blob }[]);
      request.onerror = () => reject(request.error);
    });
    const image = records.find((record) => record.mime?.startsWith("image/"));
    if (!image?.blob) return null;
    const bitmap = await createImageBitmap(image.blob);
    return { mime: image.mime, w: bitmap.width, h: bitmap.height };
  });
  expect(photo?.mime).toBe("image/jpeg");
  expect(Math.max(photo!.w, photo!.h)).toBeLessThanOrEqual(2000);
});
