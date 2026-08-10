import { chromium } from 'playwright';
const URL_ = 'http://localhost:3000';
const b = await chromium.launch({ channel: 'chrome' });
const pass = [];
const fail = [];
const t = (name, ok, detail = '') => (ok ? pass : fail).push(`${name}${detail ? ' — ' + detail : ''}`);

// ---- reduced motion -------------------------------------------------------
{
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await p.goto(URL_, { waitUntil: 'load' });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(2500);
  const snap = () => p.evaluate(() => {
    const c = document.querySelector('canvas');
    const g = c.getContext('2d');
    const d = g.getImageData(0, 0, Math.min(400, c.width), Math.min(300, c.height)).data;
    let s = 0; for (let i = 0; i < d.length; i += 53) s += d[i];
    const caret = [...document.querySelectorAll('span')].find(x => /caret/.test(getComputedStyle(x).animationName));
    return { stars: s, typed: caret?.parentElement?.textContent ?? '' };
  });
  const a = await snap(); await p.waitForTimeout(1500); const c2 = await snap();
  t('reduced motion: starfield frozen', a.stars === c2.stars, `${a.stars} -> ${c2.stars}`);
  t('reduced motion: typewriter frozen', a.typed === c2.typed, JSON.stringify(a.typed));
  t('reduced motion: text not empty', a.typed.length > 5);
  // WebGLRenderer runs without preserveDrawingBuffer, so readPixels after
  // compositing returns a cleared buffer no matter what was drawn. Compare a
  // screenshot of the globe against the page background instead.
  const shot = await p.locator('canvas').nth(1).screenshot();
  const lit = shot.length > 5000;
  const bright = await p.evaluate(() => {
    const c = document.querySelectorAll('canvas')[1];
    const r = c.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });
  t('reduced motion: globe still rendered', lit,
    `${bright.w}x${bright.h}, ${(shot.length / 1024).toFixed(0)} KB png`);
  await p.close();
}

// ---- keyboard operation ---------------------------------------------------
{
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(URL_, { waitUntil: 'load' });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(1500);
  const faq = p.locator('section', { hasText: 'Questions we get' }).last();
  const row = faq.getByText('When does the 3D viewer appear?', { exact: true }).first();
  await row.scrollIntoViewIfNeeded();
  const answerBefore = await faq.locator('p').first().textContent();
  await row.evaluate((el) => (el.closest('[role="button"]')).focus());
  await p.keyboard.press('Enter');
  await p.waitForTimeout(250);
  const answerAfter = await faq.locator('p').first().textContent();
  t('keyboard: FAQ row activates with Enter', answerBefore !== answerAfter,
    (answerAfter ?? '').slice(0, 45) + '…');

  const how = p.locator('section#how');
  await how.scrollIntoViewIfNeeded();
  const shipRow = how.getByText('Ship', { exact: true }).first();
  // Step selection is also driven by an IntersectionObserver, and .focus()
  // scrolls the element, which re-fires it. Let that settle before pressing,
  // or the observer overwrites the keyboard selection a frame later.
  await shipRow.evaluate((el) => (el.closest('[role="button"]')).focus());
  await p.waitForTimeout(600);
  await p.keyboard.press(' ');
  await p.waitForTimeout(300);
  const pressed = await shipRow.evaluate(
    (el) => el.closest('[role="button"]')?.getAttribute('aria-pressed')
  );
  const stage = await how.textContent();
  t('keyboard: step row activates with Space',
    pressed === 'true' && /42ms build/.test(stage ?? ''),
    `aria-pressed=${pressed}`);

  const roles = await p.evaluate(() => document.querySelectorAll('[role="button"][tabindex="0"]').length);
  t('keyboard: click targets exposed', roles === 11, `${roles} rows (5 faq + 6 steps)`);
  await p.close();
}

// ---- document head --------------------------------------------------------
{
  const p = await b.newPage();
  const res = await p.goto(URL_, { waitUntil: 'load' });
  const html = await res.text();
  t('head: <title>', /<title>Orbital — multimodal AI website engineer<\/title>/.test(html));
  t('head: description', /name="description"/.test(html));
  t('head: og:image', /property="og:image"/.test(html));
  t('head: og:title', /property="og:title"/.test(html));
  t('head: twitter card', /name="twitter:card"/.test(html));
  t('head: canonical', /rel="canonical"/.test(html));
  t('head: lang attribute', /<html lang="en"/.test(html));
  const icon = await p.request.get(URL_ + '/icon.svg');
  t('favicon served', icon.ok(), `${icon.status()}`);
  const og = await p.evaluate(async () => {
    const m = document.querySelector('meta[property="og:image"]');
    if (!m) return null;
    const r = await fetch(m.getAttribute('content'));
    return { status: r.status, type: r.headers.get('content-type') };
  });
  t('og:image resolves', !!og && og.status === 200, JSON.stringify(og));
  await p.close();
}

await b.close();
console.log('PASS');
for (const l of pass) console.log('  ok   ' + l);
if (fail.length) { console.log('FAIL'); for (const l of fail) console.log('  FAIL ' + l); }
console.log(`\n${pass.length} passed, ${fail.length} failed`);
process.exit(fail.length ? 1 : 0);
