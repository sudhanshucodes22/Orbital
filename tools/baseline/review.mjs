import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
// Ad-hoc visual review of the small breakpoints. Unlike capture.mjs this
// asserts nothing — it just renders the sections a human needs to look at
// when changing responsive behaviour. Output is gitignored.
const OUT = new URL('../../reference/.baseline-check/review/', import.meta.url).pathname;
await mkdir(OUT, { recursive: true });
const b = await chromium.launch({ channel: 'chrome' });

async function shots(width, height, tag) {
  const p = await b.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await p.goto('http://localhost:3000', { waitUntil: 'load' });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(2500);
  await p.evaluate(() => { for (const e of document.querySelectorAll('[data-reveal]')) { e.style.opacity='1'; e.style.transform='none'; } });

  const overflow = await p.evaluate(() => {
    const de = document.documentElement;
    const offenders = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > de.clientWidth + 1) {
        offenders.push({ tag: el.tagName, cls: el.className?.toString?.().slice(0, 40) ?? '', right: Math.round(r.right), w: Math.round(r.width) });
      }
    }
    return { docW: de.scrollWidth, clientW: de.clientWidth, canScrollX: de.scrollWidth > de.clientWidth, offenders: offenders.slice(0, 6) };
  });
  console.log(`${tag}: scrollWidth=${overflow.docW} clientWidth=${overflow.clientW} horizontalScroll=${overflow.canScrollX}`);
  if (overflow.offenders.length) console.log('   offenders:', JSON.stringify(overflow.offenders));

  await p.screenshot({ path: `${OUT}/${tag}-hero.png` });
  for (const [name, sel] of [['demo', 'section#demo'], ['workspace', 'section#workspace'], ['pricing', 'section#pricing']]) {
    const el = p.locator(sel);
    await el.scrollIntoViewIfNeeded();
    await p.waitForTimeout(300);
    await el.screenshot({ path: `${OUT}/${tag}-${name}.png` });
  }
  // open menu
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(300);
  const trig = p.locator('.r-menu-trigger');
  if (await trig.isVisible()) {
    await trig.click();
    await p.waitForTimeout(400);
    await p.screenshot({ path: `${OUT}/${tag}-menu.png` });
  }
  await p.close();
}

await shots(375, 812, 'w375');
await shots(768, 1024, 'w768');
await b.close();
console.log('\nwrote /tmp/rev');
