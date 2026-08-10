// Sweeps common device widths for horizontal overflow. 320 in particular
// caught a `minmax(320px, 1fr)` track that no other width exposed.
import { chromium } from 'playwright';
const WIDTHS = [[320,568,'iPhone SE'],[360,740,'common Android'],[375,812,'iPhone 13 mini'],[390,844,'iPhone 14'],[430,932,'15 Pro Max'],[768,1024,'tablet edge'],[812,375,'phone landscape'],[834,1112,'iPad portrait'],[1024,768,'iPad landscape'],[1440,900,'desktop']];
const b = await chromium.launch({ channel: 'chrome' });
let fails = 0;
for (const [w, h, note] of WIDTHS) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.goto(process.env.NEXT_URL ?? 'http://localhost:3000', { waitUntil: 'load' });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(1400);
  const r = await p.evaluate(() => {
    const de = document.documentElement;
    const vis = (s) => { const el = document.querySelector(s); return !!(el && el.getBoundingClientRect().width > 0); };
    return { scrollW: de.scrollWidth, clientW: de.clientWidth, hamburger: vis('.r-menu-trigger'), cta: vis('.r-nav-cta') };
  });
  const ok = r.scrollW <= r.clientW;
  if (!ok) fails++;
  console.log(`${String(w).padStart(4)}x${String(h).padEnd(4)} ${ok ? 'ok      ' : 'OVERFLOW'} scrollW=${String(r.scrollW).padEnd(5)} nav=${r.hamburger ? 'hamburger' : 'links    '} cta=${r.cta ? 'yes' : 'no '}  ${note}`);
  await p.close();
}
await b.close();
console.log(fails ? `\n${fails} width(s) overflow` : `\nno horizontal overflow at any of the ${WIDTHS.length} widths`);
process.exit(fails ? 1 : 0);
