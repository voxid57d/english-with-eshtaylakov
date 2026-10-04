// Isolated browser fixtures only. No credentials or requests reach Supabase.
// Run against a local Next server: node tests/training-browser.mjs
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright-core";
const base = process.env.TRAIN_TEST_URL || "http://localhost:3100";
const env = await readFile(new URL("../.env.local", import.meta.url), "utf8");
const supabaseUrl = env.match(
  /^NEXT_PUBLIC_SUPABASE_URL\s*=\s*["']?([^\s"']+)/m,
)?.[1];
assert.ok(
  supabaseUrl,
  "Local public Supabase URL is needed to locate the browser session key",
);
const storageKey = `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
});
// The development-only Next badge overlaps bottom navigation on narrow screens.
await context.addInitScript(() =>
  document.addEventListener("DOMContentLoaded", () => {
    const style = document.createElement("style");
    style.textContent = "nextjs-portal { display: none !important; }";
    document.head.append(style);
  }),
);
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("dialog", (dialog) => dialog.accept());
const state = {
  failNextSave: false,
  exercises: [],
  workouts: [],
  measurements: [],
  profile: { birth_year: null, height_cm: null },
};
const today = new Date().toLocaleDateString("en-CA"),
  past = new Date(Date.now() - 86400000).toLocaleDateString("en-CA");
const stats = (w) => {
  const sets = w.exercises.flatMap((e) => e.sets);
  return {
    sets: sets.filter((s) => s.reps !== null).length,
    reps: sets.reduce((n, s) => n + (s.reps || 0), 0),
    volume: sets.reduce((n, s) => n + (s.weight_kg || 0) * (s.reps || 0), 0),
  };
};
async function noOverflow() {
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
    "mobile layout must not overflow",
  );
}
try {
  // Verify actual unauthenticated HTTP behavior before installing any UI fixtures.
  const response = await page.request.get(`${base}/api/train`);
  assert.equal(response.status(), 401);
  assert.match(response.headers()["cache-control"], /no-store/);
  const robots = await page.request.get(`${base}/robots.txt`);
  assert.match(await robots.text(), /Disallow: \/train/);
  await page.goto(`${base}/train`);
  await page.getByRole("button", { name: "Sign in with Google" }).waitFor();
  assert.match(
    await page.locator('meta[name="robots"]').getAttribute("content"),
    /noindex, nofollow/,
  );
  await noOverflow();
  await context.route(`${supabaseUrl}/**`, (route) =>
    route.fulfill({ json: { user: { id: "browser-fixture" } } }),
  );
  await context.addInitScript(
    ({ storageKey }) =>
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          access_token: "browser-fixture-token",
          refresh_token: "fixture",
          expires_at: Math.floor(Date.now() / 1000) + 86400,
          expires_in: 86400,
          token_type: "bearer",
          user: {
            id: "browser-fixture",
            aud: "authenticated",
            role: "authenticated",
            email: "fixture@example.invalid",
          },
        }),
      ),
    { storageKey },
  );
  await context.route("**/api/train**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      p = url.searchParams;
    let result = {};
    if (req.method() === "GET") {
      const view = p.get("view") || "dashboard";
      if (view === "access") result = { authorized: true };
      if (view === "exercises")
        result = {
          exercises: state.exercises.filter((e) =>
            e.name
              .toLowerCase()
              .includes((p.get("search") || "").toLowerCase()),
          ),
          more: false,
        };
      if (view === "recent") result = { exercises: state.exercises };
      if (view === "exercise")
        result = {
          exercise: state.exercises.find((e) => e.id === p.get("id")),
          records: [],
        };
      if (view === "workout")
        result = {
          workout: state.workouts.find((w) => w.id === p.get("id")),
          previous: {},
          records: [],
        };
      if (view === "previous") result = { previous: null };
      if (view === "history")
        result = { workouts: [...state.workouts].reverse(), more: false };
      if (view === "measurements")
        result = {
          profile: state.profile,
          measurements: state.measurements,
          more: false,
        };
      if (view === "dashboard")
        result = {
          workouts: [...state.workouts].reverse(),
          monthCount: state.workouts.length,
          weight: state.measurements[0] ?? null,
          records: [],
          recentExercises: state.exercises,
        };
      if (view === "progress")
        result = {
          measurements: state.measurements,
          workouts: state.workouts,
          more: false,
          performances: state.workouts.flatMap((w) =>
            w.exercises
              .filter((e) => e.exercise_id === p.get("exercise"))
              .map((e) => ({
                ...stats(w),
                workout_id: w.id,
                workout_date: w.workout_date,
                exercise_id: e.exercise_id,
                max_weight: Math.max(...e.sets.map((s) => s.weight_kg || 0)),
                estimated_1rm: 100,
                duration: null,
                distance: null,
              })),
          ),
        };
    } else {
      const input = req.postDataJSON();
      if (input.action === "exercise") {
        const index = state.exercises.findIndex((e) => e.id === input.id);
        if (index < 0) state.exercises.push(input);
        else state.exercises[index] = input;
        result = { exercise: input };
      }
      if (input.action === "start") {
        let workout = state.workouts.find((w) => w.workout_date === input.date);
        if (!workout) {
          workout = {
            id: randomUUID(),
            workout_date: input.date,
            title: "",
            notes: "",
            started_at: input.started_at ?? null,
            ended_at: null,
            revision: 0,
            exercises: [],
          };
          state.workouts.push(workout);
        }
        result = { id: workout.id };
      }
      if (input.action === "workout") {
        if (state.failNextSave) {
          state.failNextSave = false;
          await route.fulfill({status:503,json:{error:"Test connection interrupted. Please retry."}});
          return;
        }
        const index = state.workouts.findIndex(
          (w) => w.id === input.workout.id,
        );
        state.workouts[index] = {
          ...input.workout,
          revision: input.workout.revision + 1,
        };
        result = { revision: state.workouts[index].revision };
      }
      if (input.action === "measurement") {
        state.measurements = [
          input,
          ...state.measurements.filter((m) => m.id !== input.id),
        ];
        result = { id: input.id };
      }
      if (input.action === "profile") {
        state.profile = input;
        result = { saved: true };
      }
    }
    await route.fulfill({ json: result });
  });
  await page.reload();
  await page
    .getByRole("heading", { name: "Your next rep starts here." })
    .waitFor();
  await page.getByRole("link", { name: "+ Add Exercise", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Bench press");
  await page.getByRole("combobox", { name: /Category/ }).fill("Chest");
  await page
    .getByRole("button", { name: "Save exercise", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Bench Press");
  await page
    .getByRole("button", { name: "Save exercise", exact: true })
    .click();
  await page.getByRole("link", { name: "Today", exact: true }).click();
  await page
    .getByRole("button", { name: "Training Today", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Your workout", exact: true })
    .waitFor();
  const workoutUrl = page.url();
  await page
    .getByRole("button", { name: "+ Add Exercise", exact: true })
    .click();
  await page.getByRole("button", { name: /Bench Press Chest/ }).click();
  await page
    .getByRole("spinbutton", {
      name: "Bench Press set 1 Weight (kg)",
      exact: true,
    })
    .fill("75");
  await page
    .getByRole("spinbutton", { name: "Bench Press set 1 Reps", exact: true })
    .fill("8");
  await page.getByRole("button", { name: "Duplicate Previous Set" }).click();
  await page.getByRole("button", { name: "+ Add Set", exact: true }).click();
  await page
    .getByRole("spinbutton", {
      name: "Bench Press set 3 Weight (kg)",
      exact: true,
    })
    .fill("70");
  await page
    .getByRole("spinbutton", { name: "Bench Press set 3 Reps", exact: true })
    .fill("10");
  await page.getByRole("button", { name: "Save workout", exact: true }).click();
  await page.getByText("All changes saved", { exact: true }).waitFor();
  await page.reload();
  await page
    .getByRole("spinbutton", {
      name: "Bench Press set 1 Weight (kg)",
      exact: true,
    })
    .waitFor();
  assert.equal(
    await page
      .getByRole("spinbutton", {
        name: "Bench Press set 1 Weight (kg)",
        exact: true,
      })
      .inputValue(),
    "75",
  );
  await page
    .getByRole("spinbutton", {
      name: "Bench Press set 1 Weight (kg)",
      exact: true,
    })
    .fill("80");
  await page
    .getByRole("button", { name: "Delete Bench Press set 3", exact: true })
    .click();
  state.failNextSave = true;
  await page.getByRole("button", { name: "Save workout", exact: true }).click();
  await page.getByRole("alert").getByText(/Test connection interrupted/).waitFor();
  assert.equal(await page.getByRole("spinbutton",{name:"Bench Press set 1 Weight (kg)",exact:true}).inputValue(),"80");
  await page.getByRole("button", { name: "Save workout", exact: true }).click();
  await page.getByText("All changes saved", { exact: true }).waitFor();
  await noOverflow();
  await mkdir(new URL("../artifacts/training/", import.meta.url), {
    recursive: true,
  });
  await page.screenshot({
    path: "artifacts/training/workout-mobile.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Today", exact: true }).click();
  await page.getByRole("button", { name: /Open Today/, exact: true }).click();
  await page
    .getByRole("heading", { name: "Your workout", exact: true })
    .waitFor();
  assert.equal(page.url(), workoutUrl);
  assert.equal(state.workouts.length, 1);
  await page
    .getByRole("navigation", { name: "Training" })
    .getByRole("link", { name: "History", exact: true })
    .click();
  await page.getByRole("button", { name: /^Log a past workout:/ }).click();
  await page.getByRole("dialog", { name: "Log a past workout" }).getByLabel("Calendar year").selectOption(past.slice(0, 4));
  await page.getByRole("dialog", { name: "Log a past workout" }).getByLabel("Calendar month").selectOption(past.slice(5, 7));
  const pastDate = new Date(`${past}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  await page.getByRole("dialog", { name: "Log a past workout" }).getByRole("button", { name: pastDate, exact: true }).click();
  await page.getByRole("button", { name: "Create / open workout" }).click();
  await page
    .getByRole("heading", { name: "Your workout", exact: true })
    .waitFor();
  assert.equal(state.workouts.length, 2);
  await page.getByRole("link", { name: "Body", exact: true }).click();
  await page.getByLabel("Weight (kg)", { exact: true }).fill("90.2");
  await page
    .getByRole("button", { name: "Save measurement", exact: true })
    .click();
  await page.getByText(new RegExp(today + ".*90.2 kg")).waitFor();
  await noOverflow();
  await page.reload();
  await page.getByText(new RegExp(today + ".*90.2 kg")).waitFor();
  await page.getByRole("link", { name: "Progress", exact: true }).click();
  await page.getByRole("img", { name: /Weight \(kg\)/ }).waitFor();
  await page.getByRole("button", { name: "Choose exercise" }).click();
  await page.getByRole("button", { name: /Bench Press Chest/ }).click();
  await page.getByRole("img", { name: /Maximum weight/ }).waitFor();
  await noOverflow();
  await page.screenshot({
    path: "artifacts/training/progress-mobile.png",
    fullPage: true,
  });
  await page.goto(`${base}/train/exercises/${state.exercises[0].id}`);
  await page.getByRole("heading",{name:"All sessions",exact:true}).waitFor();
  await page.getByRole("img",{name:/Maximum weight/}).waitFor();
  await noOverflow();
  await page.getByRole("link", { name: "Today", exact: true }).click();
  await page
    .getByRole("heading", { name: "Your next rep starts here." })
    .waitFor();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({
    path: "artifacts/training/dashboard-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button",{name:"Switch to day mode"}).click();
  assert.equal(await page.locator("html").getAttribute("data-theme"),"light");
  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow();
  await page.screenshot({
    path: "artifacts/training/dashboard-light-mobile.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: real anonymous API/noindex/robots; fixture-backed exercise CRUD, workouts, sets, refresh, historical dates, measurements, charts, and mobile/dark/light layouts.",
  );
} catch (error) {
  console.log("Browser errors", errors);
  console.log((await page.locator("body").innerText()).slice(-5000));
  throw error;
} finally {
  await browser.close();
}
