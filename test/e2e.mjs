// Uses the page in Chromium the way a person would:  node test/e2e.mjs  (needs Playwright)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(join(execSync('npm root -g').toString().trim(), 'playwright')); }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let body;
  try { body = await readFile(join(root, path === '/' ? 'index.html' : path)); } catch { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'text/html' });
  res.end(body);
}).listen(0);
const base = `http://localhost:${server.address().port}/`;

const browser = await pw.chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
const page = await ctx.newPage();
const problems = [];
const watch = p => {
  p.on('pageerror', e => problems.push(e.message));
  p.on('console', m => { if (m.type() === 'error') problems.push(m.text()); });
  p.on('requestfailed', r => problems.push('failed: ' + r.url()));
  p.on('request', r => { if (!r.url().startsWith(base)) problems.push('left the site: ' + r.url()); });
};
watch(page);

await page.goto(base);
await page.evaluate(() => document.fonts.ready);
const heading = () => page.locator('#c-name').innerText();
const arrived = () => page.waitForFunction(() => window.arsenal.stage.summary()?.every(s => s.arrived), null, { timeout: 15000 });

// Opens on the four-seamer and throws it.
assert.match(await heading(), /Four-seam fastball/i);
await arrived();
assert.match(await page.locator('#ro-time').innerText(), /s to the plate/);

// A screen reader hears one line when the ball lands, not each hundredth of a second while it flies.
{
  assert.equal(await page.locator('[aria-live] #ro-time').count(), 0, 'the running time is inside a live region');
  const heard = await page.evaluate(() => new Promise(resolve => {
    const live = [...document.querySelectorAll('[aria-live]')];
    const said = [];
    const watch = new MutationObserver(() => { for (const el of live) { const t = el.textContent.trim(); if (t && t !== said.at(-1)) said.push(t); } });
    for (const el of live) watch.observe(el, { childList: true, characterData: true, subtree: true });
    document.getElementById('throw').click();
    const landed = () => (window.arsenal.stage.summary().every(s => s.arrived) ? setTimeout(() => { watch.disconnect(); resolve(said); }, 300) : requestAnimationFrame(landed));
    requestAnimationFrame(landed);
  }));
  assert.equal(heard.length, 1, `a screen reader was given ${heard.length} lines for one throw: ${heard.slice(0, 3).join(' | ')}`);
  assert.match(heard[0], /^Four-seam, 0\.\d\d seconds to the plate$/);
}

// Grey text reads clearly on the page and on the cards, in both palettes: at least 4.5 to 1, as WCAG AA asks.
for (const colorScheme of ['light', 'dark']) {
  await page.emulateMedia({ colorScheme });
  const { paper, card } = await page.evaluate(() => {
    const token = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const lum = hex => {
      const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
    return { paper: ratio(token('--muted'), token('--paper')), card: ratio(token('--muted'), token('--card')) };
  });
  assert.ok(paper >= 4.5 && card >= 4.5, `${colorScheme}: grey text is ${paper.toFixed(2)} to 1 on the page and ${card.toFixed(2)} to 1 on the cards`);
}
await page.emulateMedia({ colorScheme: 'light' });

// Picking a pitch from the picker updates the card, the address, and throws it.
await page.locator('.chip', { hasText: 'Slider' }).click();
assert.match(await heading(), /^Slider/i);
assert.equal(new URL(page.url()).hash, '#slider');
assert.match(await page.locator('#c-stats').innerText(), /86\.3 mph/);
await arrived();

// Every camera draws without trouble, at real speed.
await page.locator('#speed [data-v="1"]').click();
for (const v of ['side', 'top', 'catcher']) {
  await page.locator(`#view [data-v="${v}"]`).click();
  await page.locator('#throw').click();
  await arrived();
}

// Throw it with a partner pitch: two flights from the same release point.
await page.locator('#pair').selectOption('FF');
await arrived();
const flights = await page.evaluate(() => window.arsenal.stage.flights.map(f => ({ code: f.p.code, x: f.release.x, z: f.release.z })));
assert.deepEqual(flights.map(f => f.code), ['SL', 'FF']);
assert.equal(flights[0].x, flights[1].x);

// Lefty: released from the other side.
await page.locator('#hand [data-v="L"]').click();
await arrived();
assert.ok(await page.evaluate(() => window.arsenal.stage.flights[0].release.x > 0), 'a lefty releases on the first-base side');
await page.locator('#hand [data-v="R"]').click();

// The card, the table and the chart give each pitch the same share of all pitches.
{
  const shares = await page.evaluate(() => [...document.querySelectorAll('.chip')].map(b => b.dataset.code).map(code => {
    window.arsenal.pick(code);
    const card = [...document.querySelectorAll('#c-stats > div')].find(d => d.querySelector('dt').textContent === 'Thrown').querySelector('b').textContent;
    const table = document.querySelector(`.lineup tbody tr[data-code="${code}"] td:nth-child(2) .val`).textContent;
    const dot = document.querySelector('.move-chart .dot.on');
    dot.dispatchEvent(new FocusEvent('focus'));
    const tip = /([\d.]+%) of pitches/.exec(document.getElementById('tip').textContent)?.[1];
    dot.dispatchEvent(new FocusEvent('blur'));
    return { code, card, table, tip };
  }));
  assert.equal(shares.length, 13);
  for (const s of shares) assert.ok(s.card === s.table && s.card === s.tip, `${s.code}: ${s.card} on the card, ${s.table} in the table, ${s.tip} in the chart`);
}

// The chart and the table pick pitches too.
assert.equal(await page.locator('.move-chart .dot').count(), 13);
assert.equal(await page.locator('.lineup tbody tr').count(), 13);
await page.locator('.move-chart .dot', { hasText: 'Curve' }).first().click();
assert.match(await heading(), /^Curveball/i);
await page.locator('.lineup tbody tr', { hasText: 'Splitter' }).locator('button').click();
assert.match(await heading(), /^Splitter/i);

// Next and previous walk through every pitch.
await page.locator('#next').click();
assert.match(await heading(), /^Forkball/i);

// A link named after something every object has, like #constructor, isn't a pitch: it opens on the four-seamer.
{
  const before = problems.length;
  for (const name of ['constructor', '__proto__', 'toString']) {
    await page.goto('about:blank');
    await page.goto(base + '#' + name);
    assert.match(await heading(), /^Four-seam fastball/i, `#${name} did not open on the four-seamer`);
  }
  // Changing the address to one partway through leaves the pitch alone.
  await page.evaluate(() => new Promise(resolve => { addEventListener('hashchange', () => setTimeout(resolve, 50), { once: true }); location.hash = '#valueOf'; }));
  assert.match(await heading(), /^Four-seam fastball/i);
  assert.deepEqual(problems.slice(before), [], 'errors from a link named after an object property');
}

// A link straight to a pitch opens on it.
await page.goto(base + '#knuckleball');
assert.match(await heading(), /^Knuckleball/i);

// Fits a phone: nothing scrolls sideways.
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'the page scrolls sideways on a phone');

// Works offline once it has been opened.
await page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 10000 }).catch(() => {});
await ctx.setOffline(true);
await page.reload();
await page.evaluate(() => document.fonts.ready);
assert.match(await heading(), /^Knuckleball/i, 'the page did not load offline');
await ctx.setOffline(false);

// With reduced motion, every throw lands at once, at every speed.
const calmCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, reducedMotion: 'reduce' });
const calm = await calmCtx.newPage();
watch(calm);
await calm.goto(base + '#eephus');
await calm.evaluate(() => document.fonts.ready);
for (const speed of ['1', '0.25', '0.05']) {
  await calm.locator(`#speed [data-v="${speed}"]`).click();
  const flying = await calm.evaluate(() => [...document.querySelectorAll('.chip')].map(b => b.dataset.code)
    .filter(code => { window.arsenal.pick(code); return !window.arsenal.stage.summary().every(s => s.arrived); }));
  assert.deepEqual(flying, [], `with reduced motion, these still fly at ${speed}× speed`);
}
await calm.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
assert.match(await calm.locator('#landed').textContent(), /^Eephus, 0\.\d\d seconds to the plate$/);
await calmCtx.close();

assert.deepEqual(problems.filter(p => !p.startsWith('failed:')), [], 'problems while using it');
await browser.close();
server.close();
console.log('all good');
