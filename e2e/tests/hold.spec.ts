/**
 * The held row under the input (story 2.5): one test per row of its E2E matrix, on a long,
 * scrolled list. The fixture's page clock runs the store's 3 s hold timer, so
 * `page.clock.runFor(3_000)` ends a hold. That clock also flows in real time, so each test
 * checks the hold is still on (`li.held`) when it measures. CSP-clean is checked by the fixture
 * at teardown for every test (AD-19).
 */
import {
  expect,
  expectNoA11yViolations,
  failApi,
  test,
  type Seed,
  type Task,
} from "../fixtures.ts";
import type { Page } from "@playwright/test";

const ACTION_FAILED = "Couldn't update that task. It's back as it was.";
const HOUR = 3_600_000;
const HOLD_MS = 3_000;

const input = (page: Page) => page.getByLabel("New task");
const list = (page: Page) => page.getByRole("list", { name: "Tasks" });
const rows = (page: Page) => list(page).getByRole("listitem");
const rowTexts = (page: Page) => rows(page).locator(".text");
const held = (page: Page) => list(page).locator("li.held");
const toast = (page: Page) => page.locator("[data-toast-kind]");
const tick = (page: Page, text: string) =>
  page.getByRole("button", { name: `Mark "${text}" done`, exact: true });
const del = (page: Page, text: string) =>
  page.getByRole("button", { name: `Delete "${text}"`, exact: true });
const row = (page: Page, text: string) =>
  rows(page).filter({ has: del(page, text) });

/** `count` open tasks, oldest first: "task 0" … */
async function seedOpen(seed: Seed, count = 30): Promise<Task[]> {
  const seeded: Task[] = [];
  for (let i = 0; i < count; i += 1) {
    seeded.push(await seed({ text: `task ${i}`, addedAgoMs: (40 - i) * HOUR }));
  }
  return seeded;
}

async function open(
  page: Page,
  count: number,
  width = 1280,
  height = 600,
): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.goto("/");
  await expect(rows(page)).toHaveCount(count);
  await expect(input(page)).toBeFocused();
}

const scrollY = (page: Page) => page.evaluate(() => window.scrollY);

async function scrollTo(page: Page, y: number | "bottom"): Promise<number> {
  await page.evaluate(
    (to) =>
      window.scrollTo(
        0,
        to === "bottom" ? document.documentElement.scrollHeight : to,
      ),
    y,
  );
  return scrollY(page);
}

/** Types `text` into the focused input and presses Enter; waits for it to be the held row. */
async function add(page: Page, text: string): Promise<void> {
  await page.keyboard.type(text);
  await page.keyboard.press("Enter");
  await expect(held(page).locator(".text")).toHaveText(text);
}

const banner = async (page: Page) =>
  (await page.getByRole("banner").boundingBox())!;

/**
 * Ends the hold and lists the durations of the row animations (targets inside
 * `[data-task-row]`) running just after.
 */
async function animationsAfterSettle(page: Page): Promise<number[]> {
  await page.clock.runFor(HOLD_MS);
  return page.evaluate(async () => {
    await new Promise((resolve) =>
      requestAnimationFrame(() => setTimeout(resolve, 40)),
    );
    return document
      .getAnimations()
      .filter((a) => {
        const target = (a.effect as KeyframeEffect | null)?.target;
        return (
          target instanceof Element &&
          target.closest("[data-task-row]") !== null
        );
      })
      .map((a) => Number(a.effect?.getComputedTiming().duration ?? 0))
      .filter((d) => d > 0);
  });
}

test("visible on add: on a list scrolled to the bottom, the new row sits directly below the header", async ({
  page,
  seed,
}) => {
  await seedOpen(seed);
  await open(page, 30);
  const before = await scrollTo(page, "bottom");
  expect(before).toBeGreaterThan(0);

  await add(page, "fresh");

  await expect(rows(page).first()).toHaveClass(/\bheld\b/);
  const header = await banner(page);
  const box = (await held(page).boundingBox())!;
  expect(Math.abs(box.y - (header.y + header.height))).toBeLessThanOrEqual(1);
  expect(box.y + box.height).toBeLessThanOrEqual(600);
  await expect(held(page)).toBeInViewport({ ratio: 1 });
  expect(await scrollY(page)).toBe(before);
  await expect(held(page)).toHaveCount(1);
});

test("settles: after 3 s the row is the last open task, and the page has not scrolled", async ({
  page,
  seed,
}) => {
  await seedOpen(seed);
  await open(page, 30);
  const before = await scrollTo(page, "bottom");
  await add(page, "fresh");

  await page.clock.runFor(HOLD_MS);

  await expect(held(page)).toHaveCount(0);
  await expect(rowTexts(page).last()).toHaveText("fresh");
  await expect(rowTexts(page).first()).toHaveText("task 0");
  expect(await scrollY(page)).toBe(before);
  await expect(input(page)).toBeFocused();
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("reduced motion: the settle has no row animations", async ({
    page,
    seed,
  }) => {
    await seedOpen(seed, 5);
    await open(page, 5);
    await add(page, "fresh");

    expect(await animationsAfterSettle(page)).toEqual([]);
    await expect(rowTexts(page).last()).toHaveText("fresh");
  });
});

test("normal motion: the settle animates the rows for about 200 ms", async ({
  page,
  seed,
}) => {
  await seedOpen(seed, 5);
  await open(page, 5);
  await add(page, "fresh");

  const durations = await animationsAfterSettle(page);

  expect(durations.length).toBeGreaterThan(0);
  for (const d of durations) expect(d).toBe(200);
  await expect(rowTexts(page).last()).toHaveText("fresh");
});

test("focused held control: the tick keeps focus and is scrolled fully into view below the header", async ({
  page,
  seed,
}) => {
  await seedOpen(seed);
  await open(page, 30);
  await scrollTo(page, 200);
  await add(page, "fresh");
  const before = await scrollY(page);

  await page.keyboard.press("Tab");
  await expect(tick(page, "fresh")).toBeFocused();
  // Tabbing to the sticky held row never scrolls the page.
  expect(await scrollY(page)).toBe(before);
  await expect(held(page)).toHaveCount(1);

  await page.clock.runFor(HOLD_MS);

  await expect(held(page)).toHaveCount(0);
  await expect(rowTexts(page).last()).toHaveText("fresh");
  await expect(tick(page, "fresh")).toBeFocused();
  // The flip runs about 200 ms; read the box once the row has landed.
  await expect
    .poll(() =>
      row(page, "fresh").evaluate(
        (el) => el.getAnimations({ subtree: true }).length,
      ),
    )
    .toBe(0);
  const header = await banner(page);
  const box = (await tick(page, "fresh").boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(header.y + header.height - 1);
  expect(box.y + box.height).toBeLessThanOrEqual(600);
});

test("no follow: settling to an off-screen place with focus in the input never scrolls", async ({
  page,
  seed,
}) => {
  await seedOpen(seed);
  await open(page, 30);
  const before = await scrollTo(page, 0);
  await add(page, "fresh");

  await page.clock.runFor(HOLD_MS);

  await expect(held(page)).toHaveCount(0);
  await expect(rowTexts(page).last()).toHaveText("fresh");
  await expect(input(page)).toBeFocused();
  // Its sorted place, the bottom of the open tasks, is below the fold, and the page stays put.
  await expect
    .poll(() =>
      row(page, "fresh").evaluate(
        (el) => el.getAnimations({ subtree: true }).length,
      ),
    )
    .toBe(0);
  await expect(row(page, "fresh")).not.toBeInViewport();
  expect(await scrollY(page)).toBe(before);
});

test("toast below held: an action-error toast sits 8 px below the held row, never over the input", async ({
  page,
  seed,
}) => {
  const seeded = await seedOpen(seed);
  await failApi(page, {
    method: "PUT",
    path: `/api/tasks/${seeded[29]!.id}/tick`,
  });
  await open(page, 30);
  await scrollTo(page, "bottom");
  await add(page, "fresh");

  await tick(page, "task 29").click();
  await expect(toast(page)).toHaveText(ACTION_FAILED);
  await expect(held(page)).toHaveCount(1);

  const heldBox = (await held(page).boundingBox())!;
  const toastBox = (await toast(page).boundingBox())!;
  const inputBox = (await input(page).boundingBox())!;
  expect(toastBox.y).toBeGreaterThanOrEqual(heldBox.y + heldBox.height + 8 - 1);
  expect(toastBox.y).toBeLessThanOrEqual(heldBox.y + heldBox.height + 8 + 1);
  expect(toastBox.y).toBeGreaterThanOrEqual(inputBox.y + inputBox.height);
});

test("no held row: an action-error toast sits at the list top, as before", async ({
  page,
  seed,
}) => {
  const seeded = await seedOpen(seed, 5);
  await failApi(page, {
    method: "PUT",
    path: `/api/tasks/${seeded[2]!.id}/tick`,
  });
  await open(page, 5);

  await tick(page, "task 2").click();
  await expect(toast(page)).toHaveText(ACTION_FAILED);
  await expect(held(page)).toHaveCount(0);

  const listBox = (await list(page).boundingBox())!;
  const toastBox = (await toast(page).boundingBox())!;
  // The list's 1px top border sits between its outer edge (the toast's anchor) and the ul.
  expect(Math.abs(toastBox.y - (listBox.y - 1))).toBeLessThanOrEqual(1);
});

test("clearance: a control focused below the fold clears the header, the held row and the toast", async ({
  page,
  seed,
}) => {
  const seeded = await seedOpen(seed);
  await failApi(page, {
    method: "PUT",
    path: `/api/tasks/${seeded[0]!.id}/tick`,
  });
  await open(page, 30);
  await add(page, "fresh");
  await tick(page, "task 0").click();
  await expect(toast(page)).toHaveText(ACTION_FAILED);

  // A middle row, with rows below it so the page can scroll it right up to the top. Focus it,
  // then a start-aligned scroll (the case Chrome's own focus scroll can avoid by centring): the
  // margin alone must land it just below the header, the held row, the gap and the toast.
  await tick(page, "task 15").focus();
  await tick(page, "task 15").evaluate((el) =>
    el.scrollIntoView({ block: "start" }),
  );
  await expect(held(page)).toHaveCount(1);
  await expect(toast(page)).toHaveCount(1);

  const header = await banner(page);
  const heldBox = (await held(page).boundingBox())!;
  const toastBox = (await toast(page).boundingBox())!;
  const box = (await tick(page, "task 15").boundingBox())!;
  const expected =
    header.y + header.height + heldBox.height + 8 + toastBox.height;
  expect(Math.abs(box.y - expected)).toBeLessThanOrEqual(2);
  expect(box.y).toBeGreaterThanOrEqual(toastBox.y + toastBox.height - 1);
});

for (const width of [320, 1280]) {
  test(`a11y at ${width} px: no critical violations with a held row and a toast`, async ({
    page,
    seed,
  }) => {
    const seeded = await seedOpen(seed, 5);
    await failApi(page, {
      method: "PUT",
      path: `/api/tasks/${seeded[1]!.id}/tick`,
    });
    await open(page, 5, width, 800);
    await add(page, "fresh");
    await tick(page, "task 1").click();
    await expect(toast(page)).toHaveText(ACTION_FAILED);
    await expect(held(page)).toHaveCount(1);

    await expectNoA11yViolations(page);
  });
}
