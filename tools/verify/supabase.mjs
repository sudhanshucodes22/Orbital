/** End-to-end verification of the Supabase setup.
 *
 *   npm run build && npm run start      (or npm run dev)
 *   node tools/verify/supabase.mjs
 *
 * Drives the real application in two isolated browser contexts, so what is
 * tested is the whole path — middleware, Server Actions, the service layer and
 * Row Level Security together — not raw database calls that would bypass most
 * of it.
 *
 * Creates two throwaway accounts in your Supabase project. They are harmless
 * but they do persist; delete them from Authentication -> Users afterwards if
 * you want a clean slate.
 */
import { chromium } from "playwright";

const URL_ = process.env.NEXT_URL ?? "http://localhost:3000";
const stamp = Date.now();
const USER_A = { email: `orbital-a-${stamp}@example.com`, password: "orbital-test-pw-A1" };
const USER_B = { email: `orbital-b-${stamp}@example.com`, password: "orbital-test-pw-B2" };

const pass = [];
const fail = [];
const check = (name, ok, detail = "") =>
  (ok ? pass : fail).push(`${name}${detail ? ` — ${detail}` : ""}`);

const browser = await chromium.launch({ channel: "chrome" });

/** Each user gets their own context so cookies never bleed between them. */
async function contextFor() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  return { ctx, page: await ctx.newPage() };
}

async function signUp(page, { email, password }) {
  await page.goto(`${URL_}/sign-up`, { waitUntil: "load" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await Promise.all([
    page.waitForURL(/\/projects|\/sign-up/, { timeout: 20000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForTimeout(1200);
  return page.url();
}

async function signIn(page, { email, password }) {
  await page.goto(`${URL_}/sign-in`, { waitUntil: "load" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await Promise.all([
    page.waitForURL(/\/projects/, { timeout: 20000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForTimeout(1200);
  return page.url();
}

try {
  // ---- 0. capabilities ---------------------------------------------------
  {
    const res = await fetch(`${URL_}/api/health`);
    const body = await res.json();
    const c = body.capabilities ?? {};
    check("health: auth configured", c.auth === true, JSON.stringify(c));
    check("health: database configured", c.database === true);
    check("health: storage configured", c.storage === true);
    if (!c.auth) {
      console.log("\nauth is not configured — stopping. Fill in .env.local and restart.\n");
      throw new Error("unconfigured");
    }
  }

  // ---- 1. signed out ------------------------------------------------------
  {
    const { ctx, page } = await contextFor();
    const res = await page.goto(`${URL_}/projects`, { waitUntil: "load" });
    check("signed out: /projects redirects to sign-in", /\/sign-in/.test(page.url()), page.url());
    check("signed out: redirect preserves ?next", page.url().includes("next=%2Fprojects"));
    const landing = await page.goto(`${URL_}/`, { waitUntil: "load" });
    check("signed out: landing page still 200", landing?.status() === 200);
    void res;
    await ctx.close();
  }

  // ---- 2. user A: sign up, create, read ----------------------------------
  const a = await contextFor();
  let projectHref = null;
  {
    const url = await signUp(a.page, USER_A);
    check("A: sign-up reaches /projects", url.includes("/projects"), url);

    const empty = await a.page.textContent("body");
    check("A: new account starts with no projects", /Nothing in orbit yet/.test(empty ?? ""));

    await a.page.fill('input[name="name"]', "Alpha private project");
    await a.page.click('button[type="submit"]');
    await a.page.waitForTimeout(2000);

    const link = a.page.locator('a[href^="/projects/"]').first();
    projectHref = await link.getAttribute("href");
    check("A: project created and listed", Boolean(projectHref), projectHref ?? "no link found");
    check(
      "A: project name shown",
      /Alpha private project/.test((await a.page.textContent("body")) ?? "")
    );

    if (projectHref) {
      await a.page.goto(URL_ + projectHref, { waitUntil: "load" });
      check(
        "A: can open own project",
        /Alpha private project/.test((await a.page.textContent("body")) ?? "")
      );
    }
  }

  // ---- 3. user B: isolation ----------------------------------------------
  const b = await contextFor();
  {
    const url = await signUp(b.page, USER_B);
    check("B: sign-up reaches /projects", url.includes("/projects"), url);

    const body = (await b.page.textContent("body")) ?? "";
    check("B: cannot see A's project in the list", !/Alpha private project/.test(body));
    check("B: own list is empty", /Nothing in orbit yet/.test(body));

    if (projectHref) {
      const res = await b.page.goto(URL_ + projectHref, { waitUntil: "load" });
      const text = (await b.page.textContent("body")) ?? "";
      check(
        "B: opening A's project by URL returns 404",
        res?.status() === 404 || /Nothing at this address/.test(text),
        `status ${res?.status()}`
      );
      check("B: A's project name never rendered", !/Alpha private project/.test(text));
    }
  }

  // ---- 4. sign out --------------------------------------------------------
  {
    await a.page.goto(`${URL_}/projects`, { waitUntil: "load" });
    await a.page.click('button:has-text("Sign out")');
    await a.page.waitForTimeout(1500);
    await a.page.goto(`${URL_}/projects`, { waitUntil: "load" });
    check("A: after sign-out /projects redirects again", /\/sign-in/.test(a.page.url()), a.page.url());
  }

  // ---- 5. sign back in: data persisted ------------------------------------
  {
    const { ctx, page } = await contextFor();
    const url = await signIn(page, USER_A);
    check("A: can sign back in", url.includes("/projects"), url);
    check(
      "A: project persisted across sessions",
      /Alpha private project/.test((await page.textContent("body")) ?? "")
    );
    await ctx.close();
  }

  await a.ctx.close();
  await b.ctx.close();
} catch (error) {
  if (error instanceof Error && error.message !== "unconfigured") {
    fail.push(`harness error — ${error.message}`);
  }
} finally {
  await browser.close();
}

console.log("\nPASS");
for (const l of pass) console.log("  ok   " + l);
if (fail.length) {
  console.log("FAIL");
  for (const l of fail) console.log("  FAIL " + l);
}
console.log(`\n${pass.length} passed, ${fail.length} failed`);
console.log(`test accounts: ${USER_A.email}, ${USER_B.email}`);
process.exit(fail.length ? 1 : 0);
