import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { copyFile } from "node:fs/promises";

const views = [
  { tag: "390x844", width: 390, height: 844 },
  { tag: "820x1180", width: 820, height: 1180 },
  { tag: "1180x820", width: 1180, height: 820 },
  { tag: "1440x900", width: 1440, height: 900 },
] as const;

async function shot(page: Page, name: string) {
  const dir = process.env.ARTIFACT_DIR;
  if (!dir) return;
  mkdirSync("/tmp/mbk-shots", { recursive: true });
  mkdirSync(dir, { recursive: true });
  const tmp = `/tmp/mbk-shots/${name}.png`;
  await page.screenshot({ path: tmp });
  await copyFile(tmp, `${dir}/${name}.png`);
}

async function seed(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  await page.goto("/ma-bommala-koluvu/?demo=1");
  await page.evaluate(() => indexedDB.deleteDatabase("ma-bommala-koluvu"));
  await page.reload();
  await page.getByRole("button", { name: "Add a doll" }).click();
  await page.getByRole("textbox", { name: "Name" }).fill("Lakshmi");
  await page.getByRole("button", { name: "Step 1" }).click();
  await page.getByTestId("photo-file").setInputFiles("tests/fixtures/doll.png");
  await page.getByTestId("photo-preview").waitFor();
  return errors;
}

async function layout(page: Page) {
  const result = await page.evaluate(() => {
    const bad: string[] = [];
    for (const el of document.querySelectorAll("button, a, input, select, textarea")) {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      if (box.width < 56 || box.height < 56) {
        bad.push(`${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 40)} ${Math.round(box.width)}x${Math.round(box.height)}`);
      }
      if (box.left < -1 || box.right > window.innerWidth + 1) {
        bad.push(`off ${Math.round(box.left)}-${Math.round(box.right)}`);
      }
    }
    return {
      bad,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(result.bad, result.bad.join("\n")).toEqual([]);
  expect(result.overflow).toBeLessThanOrEqual(1);
}

test("larger photos and zoom viewer", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "one browser walks every viewport");
  const errors = await seed(page);

  for (const view of views) {
    await page.setViewportSize({ width: view.width, height: view.height });
    await page.evaluate(() => window.scrollTo(0, 0));
    const editHeight = await page.getByTestId("photo-preview").evaluate((img) => {
      const top = img.getBoundingClientRect().top + window.scrollY - 150;
      window.scrollTo(0, Math.max(0, top));
      return img.getBoundingClientRect().height;
    });
    expect(editHeight).toBeGreaterThan(280);
    await shot(page, `after_${view.tag}_edit`);
    await layout(page);
  }

  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: /Lakshmi/ }).waitFor();
  for (const view of views) {
    await page.setViewportSize({ width: view.width, height: view.height });
    await page.evaluate(() => window.scrollTo(0, 0));
    const cardHeight = await page.locator(".card-photo img").evaluate((img) => img.getBoundingClientRect().height);
    expect(cardHeight).toBeGreaterThan(120);
    await shot(page, `after_${view.tag}_home`);
    await layout(page);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: "Make a film" }).click();
  await page.locator(".film-photo img").waitFor();
  for (const view of views) {
    await page.setViewportSize({ width: view.width, height: view.height });
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(await page.locator(".film-photo img").evaluate((img) => {
      const top = img.getBoundingClientRect().top + window.scrollY - 150;
      window.scrollTo(0, Math.max(0, top));
      return img.getBoundingClientRect().height;
    })).toBeGreaterThan(100);
    await shot(page, `after_${view.tag}_film`);
    await layout(page);
  }
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: /Lakshmi/ }).click();
  await page.getByRole("img", { name: "Lakshmi" }).waitFor();
  for (const view of views) {
    await page.setViewportSize({ width: view.width, height: view.height });
    await page.evaluate(() => window.scrollTo(0, 0));
    const storyHeight = await page.getByRole("img", { name: "Lakshmi" }).evaluate((img) => img.getBoundingClientRect().height);
    expect(storyHeight).toBeGreaterThan(280);
    await shot(page, `after_${view.tag}_story`);
    await layout(page);
  }

  const pagePhoto = page.locator(".photo-launch.hero img");
  const stage = page.locator(".photo-stage");
  const viewerPhoto = page.locator(".photo-stage img");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Look closer" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("button", { name: "Close the photo" })).toBeVisible();
  await expect(stage).toHaveAttribute("data-ready", "true");
  for (const view of views) {
    await page.setViewportSize({ width: view.width, height: view.height });
    await expect(stage).toHaveAttribute("data-ready", "true");
    const story = await pagePhoto.boundingBox();
    const expanded = await viewerPhoto.boundingBox();
    const viewport = page.viewportSize();
    expect(story && expanded && viewport).toBeTruthy();
    expect(expanded!.width).toBeGreaterThan(story!.width + 8);
    expect(expanded!.height).toBeGreaterThan(story!.height + 8);
    const fills =
      expanded!.width >= viewport!.width - 4 || expanded!.height >= viewport!.height - 4;
    expect(fills, `${view.tag} expanded ${expanded!.width}x${expanded!.height}`).toBe(true);
    await shot(page, `after_${view.tag}_expanded`);
    await layout(page);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  const opened = Number(await stage.getAttribute("data-fill"));
  expect(opened).toBeGreaterThan(1);
  await page.getByRole("button", { name: "Zoom in" }).click();
  expect(Number(await stage.getAttribute("data-scale"))).toBeGreaterThan(opened + 0.4);
  const beforePan = await viewerPhoto.evaluate((img) => getComputedStyle(img).transform);
  const box = await stage.boundingBox();
  if (box) {
    await page.mouse.move(box.x + 80, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 150, box.y + box.height / 2);
    await page.mouse.up();
  }
  const afterPan = await viewerPhoto.evaluate((img) => getComputedStyle(img).transform);
  expect(afterPan).not.toBe(beforePan);
  await stage.dblclick();
  expect(Math.abs(Number(await stage.getAttribute("data-scale")) - Number(await stage.getAttribute("data-fill")))).toBeLessThan(0.2);

  const client = await page.context().newCDPSession(page);
  const beforeTouch = Number(await stage.getAttribute("data-scale"));
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: 120, y: 420, id: 1 },
      { x: 200, y: 420, id: 2 },
    ],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { x: 40, y: 420, id: 1 },
      { x: 340, y: 420, id: 2 },
    ],
  });
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  expect(Number(await stage.getAttribute("data-scale"))).toBeGreaterThan(beforeTouch + 0.4);
  await page.waitForTimeout(400);
  await stage.dblclick();
  await page.waitForTimeout(400);

  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 180, y: 400, id: 1 }] });
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 180, y: 400, id: 1 }] });
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  expect(Number(await stage.getAttribute("data-scale"))).toBeGreaterThan(Number(await stage.getAttribute("data-fill")) + 0.4);

  const beforePointer = Number(await stage.getAttribute("data-scale"));
  await stage.dispatchEvent("pointerdown", { pointerId: 1, clientX: 140, clientY: 300, pointerType: "mouse" });
  await stage.dispatchEvent("pointerdown", { pointerId: 2, clientX: 180, clientY: 300, pointerType: "mouse" });
  await stage.dispatchEvent("pointermove", { pointerId: 2, clientX: 280, clientY: 300, pointerType: "mouse" });
  expect(Number(await stage.getAttribute("data-scale"))).toBeGreaterThan(beforePointer);
  await page.waitForTimeout(400);
  await stage.dblclick();
  await page.getByRole("button", { name: "Zoom in" }).click();
  for (const view of views) {
    await page.setViewportSize({ width: view.width, height: view.height });
    await shot(page, `after_${view.tag}_zoom`);
  }
  await page.getByRole("button", { name: "Close the photo" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await shot(page, "after_390x844_closed");
  await page.evaluate(() => window.scrollTo(0, 0));
  const canScroll = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 40);
  if (canScroll) {
    await page.evaluate(() => window.scrollTo(0, 240));
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(40);
  }

  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "This year's Koluvu" }).click();
  await page.locator("input[type=file]").last().setInputFiles("tests/fixtures/doll.png");
  await page.getByRole("img", { name: "2026" }).waitFor();
  for (const view of views) {
    await page.setViewportSize({ width: view.width, height: view.height });
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(await page.getByRole("img", { name: "2026" }).evaluate((img) => {
      const top = img.getBoundingClientRect().top + window.scrollY - 150;
      window.scrollTo(0, Math.max(0, top));
      return img.getBoundingClientRect().height;
    })).toBeGreaterThan(280);
    await shot(page, `after_${view.tag}_year`);
    await layout(page);
  }

  const standalone = await page.context().newCDPSession(page);
  await standalone.send("Emulation.setEmulatedMedia", {
    features: [{ name: "display-mode", value: "standalone" }],
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: /Lakshmi/ }).click();
  const beforeStandalone = await page.locator(".photo-launch.hero img").boundingBox();
  await page.getByRole("button", { name: "Look closer" }).click();
  await expect(page.locator(".photo-stage")).toHaveAttribute("data-ready", "true");
  const standalonePhoto = await page.locator(".photo-stage img").boundingBox();
  expect(standalonePhoto!.height).toBeGreaterThan((beforeStandalone?.height ?? 0) + 8);
  await page.getByRole("button", { name: "Zoom in" }).click();
  expect(Number(await page.locator(".photo-stage").getAttribute("data-scale"))).toBeGreaterThan(1);
  await page.getByRole("button", { name: "Close the photo" }).click();
  await shot(page, "after_390x844_standalone");
  expect(errors.filter((item) => !item.includes("setPointerCapture")), errors.join("\n")).toEqual([]);
});
