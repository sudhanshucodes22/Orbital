// Deterministic baseline capture for the Orbital port.
//
//   node capture.mjs           capture baselines into reference/baselines/
//   node capture.mjs --check   re-capture and diff hashes against the manifest
//
// The page animates continuously, so naive screenshots are never reproducible.
// See freeze.js for how determinism is obtained. Four sets are produced:
//
//   layout/  full page, 4 widths      deterministic  <- the main parity target
//   states/  interactive state matrix deterministic  <- what a port breaks first
//   hero/    scroll-driven morph      deterministic
//   live/    everything running       NOT deterministic, human reference only
//
// Only the first three are hashed. `live/` is excluded from --check by design.

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const SERVE_DIR = path.join(REPO, 'reference/artifact-export');
const OUT_DIR = path.join(REPO, 'reference/baselines');
const PAGE = 'Orbital Launch.dc.html';

const CHECK = process.argv.includes('--check');
const WIDTHS = [1440, 1024, 768, 375];
const VIEWPORT_H = 900;
const SETTLE_MS = 900;

// Chrome's subpixel antialiasing is not bit-stable across page instances: the
// same section re-rendered in the same browser drifts by ~2 pixels out of 2.3
// million (measured). Byte equality is therefore the wrong comparison
// primitive. Anything that actually matters -- a shifted element, a wrong
// colour, a missing block -- moves thousands of pixels, far above this floor.
const DIFF_THRESHOLD = 0.1; // per-pixel colour delta, 0..1
const MAX_DIFF_RATIO = 0.0005; // 0.05% of pixels may differ

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
};

function startServer(dir) {
  const server = createServer(async (req, res) => {
    try {
      const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
      const file = path.join(dir, rel);
      if (!file.startsWith(dir)) return res.writeHead(403).end();
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }))
  );
}

const shots = [];

/** A capture set that silently produces nothing is worse than no harness at
 *  all, because --check would then pass on an empty comparison. Every group
 *  asserts its expected count. */
function expectCount(group, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${group}: captured ${actual} shots, expected ${expected}`);
  }
}

/** In --check mode captures go to a scratch tree so the baselines are never
 *  overwritten by the very run that is supposed to validate them. */
const WRITE_DIR = CHECK ? path.join(REPO, 'reference/.baseline-check') : OUT_DIR;

async function shoot(target, name, opts = {}) {
  const file = path.join(WRITE_DIR, `${name}.png`);
  await mkdir(path.dirname(file), { recursive: true });
  const buf = await target.screenshot({ path: file, ...opts });
  const hash = createHash('sha256').update(buf).digest('hex').slice(0, 16);
  shots.push({ name, hash, bytes: buf.length });
  console.log(`  ${name}  ${hash}  ${(buf.length / 1024).toFixed(0)} KB`);
  return hash;
}

/** Returns { pixels, total, ratio } or { missing: true } / { resized: true }. */
async function comparePng(baselinePath, candidatePath, diffPath) {
  if (!existsSync(baselinePath)) return { missing: true };
  const a = PNG.sync.read(await readFile(baselinePath));
  const b = PNG.sync.read(await readFile(candidatePath));
  if (a.width !== b.width || a.height !== b.height) {
    return { resized: true, from: `${a.width}x${a.height}`, to: `${b.width}x${b.height}` };
  }
  const diff = new PNG({ width: a.width, height: a.height });
  const pixels = pixelmatch(a.data, b.data, diff.data, a.width, a.height, {
    threshold: DIFF_THRESHOLD,
  });
  const total = a.width * a.height;
  const ratio = pixels / total;
  if (ratio > MAX_DIFF_RATIO) {
    await mkdir(path.dirname(diffPath), { recursive: true });
    await writeFile(diffPath, PNG.sync.write(diff));
  }
  return { pixels, total, ratio };
}

/** Reveal-on-scroll elements are hidden inline by initReveal() and only shown
 *  when their IntersectionObserver fires. Force them so captures do not depend
 *  on observer timing. */
async function forceReveals(page) {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('[data-reveal]')) {
      el.style.opacity = '1';
      el.style.transform = 'none';
    }
  });
}

async function newPage(browser, { width, freeze = true }) {
  const page = await browser.newPage({
    viewport: { width, height: VIEWPORT_H },
    deviceScaleFactor: 1,
    reducedMotion: 'no-preference',
  });
  if (freeze) await page.addInitScript({ path: path.join(HERE, 'freeze.js') });
  return page;
}

async function load(page, port) {
  await page.goto(`http://127.0.0.1:${port}/${encodeURIComponent(PAGE)}`, {
    waitUntil: 'load',
  });
  await page.evaluate(() => document.fonts.ready);
  // The 3 MB stray screenshot decodes asynchronously and is 540x351 in six
  // places, so until it lands the document height (and every element position
  // below it) is wrong. Without this wait, captures drift between runs.
  await page.evaluate(() =>
    Promise.all(
      [...document.images]
        .filter((img) => !img.complete)
        .map(
          (img) =>
            new Promise((resolve) => {
              img.addEventListener('load', resolve, { once: true });
              img.addEventListener('error', resolve, { once: true });
            })
        )
    )
  );
  await page.waitForTimeout(SETTLE_MS);
}

async function main() {
  if (!existsSync(SERVE_DIR)) throw new Error(`missing export dir: ${SERVE_DIR}`);

  const { server, port } = await startServer(SERVE_DIR);
  const browser = await chromium.launch({ channel: 'chrome' });
  const chromeVersion = browser.version();
  console.log(`chrome ${chromeVersion} · serving ${path.basename(SERVE_DIR)} on :${port}\n`);

  const outExisting = existsSync(OUT_DIR) ? await readdir(OUT_DIR) : [];
  if (!CHECK && outExisting.length) await rm(OUT_DIR, { recursive: true, force: true });
  if (CHECK) await rm(WRITE_DIR, { recursive: true, force: true });

  // ---- layout: full page, every width, hero morph pinned to its end state ----
  console.log('layout/');
  const nLayout = shots.length;
  for (const width of WIDTHS) {
    const page = await newPage(browser, { width });
    await load(page, port);
    await forceReveals(page);
    await page.evaluate(() => document.documentElement.style.setProperty('--hp', '1'));
    await shoot(page, `layout/full-${width}`, { fullPage: true });
    await page.close();
  }

  expectCount('layout', shots.length - nLayout, WIDTHS.length);

  // ---- states: interactive matrix at 1440 ----
  console.log('\nstates/');
  const nStates = shots.length;
  {
    const page = await newPage(browser, { width: 1440 });
    await load(page, port);
    await forceReveals(page);

    const demo = page.locator('section#demo');
    for (const label of ['MOBILE', 'DESKTOP', 'TABLET']) {
      await demo.getByRole('button', { name: label }).click();
      await page.waitForTimeout(150);
      await shoot(demo, `states/device-${label.toLowerCase()}`);
    }

    const voice = page.locator('section', { hasText: "You don't regenerate." }).last();
    for (const label of ['Darker hero', 'Glass cards', 'More spacing', 'Apple styling']) {
      await voice.getByRole('button', { name: label }).click();
      await page.waitForTimeout(150);
      await shoot(voice, `states/style-${label.toLowerCase().replace(/\s+/g, '-')}`);
    }

    const faq = page.locator('section', { hasText: 'Questions we get' }).last();
    const QUESTIONS = [
      'Do I ever have to write a prompt?',
      'How messy can the sketch be?',
      'Is the code real, or a locked-in export?',
      'What happens when I ask for an edit?',
      'When does the 3D viewer appear?',
    ];
    for (const [i, q] of QUESTIONS.entries()) {
      // The answer panel echoes the selected question, so each string appears
      // twice in this section. The list row is the first.
      await faq.getByText(q, { exact: true }).first().click();
      await page.waitForTimeout(150);
      await shoot(faq, `states/faq-0${i + 1}`);
    }

    const how = page.locator('section#how');
    for (const [i, label] of ['Draw', 'Show', 'Speak', 'Understand', 'Build', 'Ship'].entries()) {
      await how.getByText(label, { exact: true }).click();
      await page.waitForTimeout(150);
      await shoot(how, `states/step-0${i + 1}-${label.toLowerCase()}`);
    }

    await page.close();
  }

  // ---- hero: scroll-driven sketch->site morph ----
  // requestAnimationFrame is left alive here so the real scroll loop computes
  // --hp and the `detect` React state from the scroll offset. Both are pure
  // functions of scroll position, so this stays deterministic.
  expectCount('states', shots.length - nStates, 3 + 4 + 5 + 6);

  console.log('\nhero/');
  const nHero = shots.length;
  {
    const page = await browser.newPage({
      viewport: { width: 1440, height: VIEWPORT_H },
      deviceScaleFactor: 1,
    });
    await page.addInitScript(() => {
      window.setInterval = () => 0; // typewriter, ticker, style cycle, THREE poll
      const s = document.createElement('style');
      s.textContent =
        'canvas{visibility:hidden!important}*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}html{scroll-behavior:auto!important}';
      const attach = () => document.head.appendChild(s);
      if (document.head) attach();
      else document.addEventListener('DOMContentLoaded', attach, { once: true });
    });
    await load(page, port);
    await forceReveals(page);

    // --hp saturates at 1 well before scroll 400, so sample the morph finely.
    for (const y of [0, 80, 160, 240, 320, 400]) {
      await page.evaluate((v) => window.scrollTo(0, v), y);
      await page.waitForTimeout(400);
      const hp = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--hp').trim()
      );
      await shoot(page, `hero/scroll-${String(y).padStart(4, '0')}-hp${hp}`);
    }
    await page.close();
  }

  expectCount('hero', shots.length - nHero, 6);

  // ---- live: nothing stubbed. Reference only, never hashed. ----
  console.log('\nlive/ (reference only, not hashed)');
  {
    const page = await newPage(browser, { width: 1440, freeze: false });
    await load(page, port);
    await page.waitForTimeout(2500); // let the globe texture load and settle
    const before = shots.length;
    await shoot(page, 'live/full-1440', { fullPage: true });
    await shoot(page, 'live/hero-1440');
    shots.splice(before); // exclude from the manifest hashes
    await page.close();
  }

  await browser.close();
  server.close();

  // ---- manifest ----
  const manifestPath = path.join(OUT_DIR, 'manifest.json');
  const manifest = {
    capturedFrom: `reference/artifact-export/${PAGE}`,
    gitTag: 'artifact-export',
    chrome: chromeVersion,
    playwright: JSON.parse(await readFile(path.join(HERE, 'node_modules/playwright/package.json'), 'utf8')).version,
    deviceScaleFactor: 1,
    viewportHeight: VIEWPORT_H,
    widths: WIDTHS,
    settleMs: SETTLE_MS,
    note: 'live/ is excluded from hashes; it is a human reference only.',
    shots: Object.fromEntries(shots.map((s) => [s.name, s.hash])),
  };

  if (CHECK) {
    const diffDir = path.join(REPO, 'reference/.baseline-check/_diff');
    const failures = [];
    let worst = { name: null, ratio: 0 };

    console.log('\npixel comparison vs baselines');
    for (const { name } of shots) {
      const res = await comparePng(
        path.join(OUT_DIR, `${name}.png`),
        path.join(WRITE_DIR, `${name}.png`),
        path.join(diffDir, `${name}.png`)
      );
      if (res.missing) {
        failures.push(`${name}: no baseline`);
        continue;
      }
      if (res.resized) {
        failures.push(`${name}: size changed ${res.from} -> ${res.to}`);
        continue;
      }
      if (res.ratio > worst.ratio) worst = { name, ratio: res.ratio };
      if (res.ratio > MAX_DIFF_RATIO) {
        failures.push(`${name}: ${res.pixels} px (${(res.ratio * 100).toFixed(4)}%) — diff written`);
      }
    }

    if (failures.length) {
      console.error(`\nDRIFT — ${failures.length}/${shots.length} exceed ${(MAX_DIFF_RATIO * 100).toFixed(3)}%:`);
      for (const f of failures) console.error(`  ${f}`);
      console.error(`\ndiff images: reference/.baseline-check/_diff/`);
      process.exitCode = 1;
    } else {
      console.log(
        `\nSTABLE — all ${shots.length} within tolerance. ` +
          (worst.name
            ? `Worst: ${worst.name} at ${(worst.ratio * 100).toFixed(5)}%.`
            : 'Every shot reproduced with zero differing pixels.')
      );
      await rm(WRITE_DIR, { recursive: true, force: true });
    }
    return;
  }

  manifest.capturedAt = new Date().toISOString();
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`\n${shots.length} hashed baselines + 2 live references -> reference/baselines/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
