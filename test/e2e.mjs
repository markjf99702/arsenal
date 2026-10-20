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

// From above, the label for the side up the screen stays clear of the speed in the top-left corner and of the legend
// in the top-right, for either hand.
{
  await page.evaluate(() => {
    const fill = CanvasRenderingContext2D.prototype.fillText;
    window.topLabels = [];
    window.stopWatchingLabels = () => { CanvasRenderingContext2D.prototype.fillText = fill; };
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, ...rest) {
      if (/SIDE/.test(text) && this.textBaseline === 'top') {
        const m = this.measureText(text), dpr = window.arsenal.stage.dpr;
        window.topLabels.push({ text, left: x / dpr, right: (x + m.width) / dpr, top: (y - m.actualBoundingBoxAscent) / dpr, bottom: (y + m.actualBoundingBoxDescent) / dpr });
      }
      return fill.call(this, text, x, y, ...rest);
    };
  });
  await page.locator('#view [data-v="top"]').click();
  for (const hand of ['L', 'R']) {
    await page.locator(`#hand [data-v="${hand}"]`).click();
    await arrived();
  }
  const { labels, speed, legend } = await page.evaluate(() => {
    window.stopWatchingLabels();
    const frame = document.querySelector('.frame').getBoundingClientRect();
    const rel = r => ({ left: r.left - frame.left, right: r.right - frame.left, top: r.top - frame.top, bottom: r.bottom - frame.top });
    const digits = document.getElementById('ro-mph').getBoundingClientRect(), unit = document.querySelector('.readout .speed span').getBoundingClientRect();
    return { labels: window.topLabels, speed: rel({ left: digits.left, right: unit.right, top: digits.top, bottom: digits.bottom }), legend: rel(document.getElementById('legend').getBoundingClientRect()) };
  });
  const apart = (a, b) => a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
  assert.deepEqual([...new Set(labels.map(l => l.text))].sort(), ['↑ ARM SIDE', '↑ GLOVE SIDE']);
  for (const l of labels) {
    assert.ok(apart(l, speed), `from above, "${l.text}" is drawn over the speed`);
    assert.ok(apart(l, legend), `from above, "${l.text}" is drawn under the legend`);
  }
  await page.locator('#view [data-v="catcher"]').click();
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

// The chart's dots say which way each pitch moves in words, without minus signs, for the eye and the ear.
{
  const dots = await page.evaluate(() => [...document.querySelectorAll('.move-chart .dot')].map(g => {
    g.dispatchEvent(new FocusEvent('focus'));
    const tip = document.getElementById('tip').textContent;
    g.dispatchEvent(new FocusEvent('blur'));
    return { label: g.getAttribute('aria-label'), tip };
  }));
  for (const { label, tip } of dots) {
    assert.match(label, /^[\w -]+: [\d.]+ inch(es)? (up|down), [\d.]+ inch(es)? to the (arm|glove) side$/, label);
    for (const [, num, unit] of label.matchAll(/([\d.]+) (inch(?:es)?)\b/g)) assert.equal(unit, num === '1' ? 'inch' : 'inches', label);
    assert.match(tip, /[\d.]+ in (up|down), [\d.]+ in (arm|glove) side/, tip);
    assert.doesNotMatch(tip, /-\d/, tip);
  }
}

// The spin text counts the turns the thrown ball makes: its spin rate times its time to the plate.
{
  const turns = await page.evaluate(() => [...document.querySelectorAll('.chip')].map(b => b.dataset.code).map(code => {
    window.arsenal.pick(code);
    const f = window.arsenal.stage.flights[0];
    const said = /about (\d+) turns/.exec(document.getElementById('c-spin').textContent);
    return { code, said: said && Number(said[1]), ball: Math.round(f.rps * f.T) };
  }));
  const counted = turns.filter(t => t.said != null);
  assert.equal(counted.length, 12, 'every pitch but the knuckleball counts its turns');
  for (const t of counted) assert.equal(t.said, t.ball, `${t.code}: the card says ${t.said} turns, the ball makes ${t.ball}`);
}

// On the card, the sideways movement and its unit stay on one line ("glove side 3.9 in", never "in" on its own).
{
  const split = await page.evaluate(() => [...document.querySelectorAll('.chip')].map(b => b.dataset.code).filter(code => {
    window.arsenal.pick(code);
    const box = [...document.querySelectorAll('#c-stats > div')].find(d => d.querySelector('dt').textContent === 'Spin moves it');
    const text = box.querySelector('dd span').firstChild, s = text.textContent;
    const top = (from, to) => { const r = document.createRange(); r.setStart(text, from); r.setEnd(text, to); return r.getBoundingClientRect().top; };
    const num = /[\d.]+(?=\s+in$)/.exec(s);
    return Math.abs(top(num.index, num.index + num[0].length) - top(s.length - 2, s.length)) > 2;
  }));
  assert.deepEqual(split, [], 'the unit wraps away from its number');
}

// The chart and the table pick pitches too.
assert.equal(await page.locator('.move-chart .dot').count(), 13);
assert.equal(await page.locator('.lineup tbody tr').count(), 13);
// The speed bars are the middle 80% of pitches, which is how tools/statcast.mjs works them out.
assert.match(await page.locator('.lineup .hint').textContent(), /bar: middle 80% of pitches\)/);
await page.locator('.move-chart .dot', { hasText: 'Curve' }).first().click();
assert.match(await heading(), /^Curveball/i);
// A dot picked with a tap or with Enter doesn't leave its tooltip open over the chart.
await page.locator('.move-chart .dot', { hasText: 'Sweeper' }).tap();
assert.match(await heading(), /^Sweeper/i);
assert.equal(await page.locator('#tip').isHidden(), true, 'the tooltip stayed open after tapping a dot');
await page.locator('.move-chart .dot', { hasText: 'Slider' }).focus();
assert.equal(await page.locator('#tip').isVisible(), true, 'no tooltip for the dot with focus');
await page.keyboard.press('Enter');
assert.match(await heading(), /^Slider/i);
assert.equal(await page.locator('#tip').isHidden(), true, 'the tooltip stayed open after picking a dot with Enter');
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
// The knuckleball's speed is its one regular thrower's, not dragged down by position players' lobs, so there's no
// range of pitchers' speeds to show, on the card or in the table.
{
  const kn = await page.evaluate(() => ({
    speed: [...document.querySelectorAll('#c-stats > div')].find(d => d.querySelector('dt').textContent === 'Speed').querySelector('dd').textContent,
    bars: document.querySelectorAll('.lineup tr[data-code="KN"] .range .span').length,
    said: document.querySelector('.lineup tr[data-code="KN"] .range').getAttribute('aria-label'),
  }));
  assert.equal(kn.speed, '80.5 mph', `the knuckleball's card says ${kn.speed}`);
  assert.equal(kn.bars, 0, 'the knuckleball has a speed range in the table');
  assert.equal(kn.said, '80.5 mph on average');
}

// Fits a phone: nothing scrolls sideways.
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'the page scrolls sideways on a phone');

// Works offline once it has been opened.
await page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 10000 }).catch(() => {});
await ctx.setOffline(true);
await page.reload();
await page.evaluate(() => document.fonts.ready);
assert.match(await heading(), /^Knuckleball/i, 'the page did not load offline');
await ctx.setOffline(false);

// It clears out only its own old offline copies. Every tool at junkdrawer.works/ shares one address, and so one set
// of copies: another tool's, there before this page's service worker starts, is still there once it has. So is one
// from a tool whose name starts with this one's (arsenal-x).
{
  const sharedCtx = await browser.newContext();
  const shared = await sharedCtx.newPage();
  watch(shared);
  await shared.goto(base + 'icon.svg'); // the same address without the app, so no service worker yet
  await shared.evaluate(async () => {
    await (await caches.open('another-tool-v1')).put('/another-tool/', new Response('another tool'));
    await (await caches.open('arsenal-x-v1')).put('/arsenal-x/', new Response('a tool called arsenal-x'));
    await (await caches.open('arsenal-v0')).put('index.html', new Response('an older Arsenal'));
  });
  await shared.goto(base);
  // It deletes the old copies before it takes over the page, and it's activated once that's done.
  await shared.waitForFunction(() => navigator.serviceWorker.controller?.state === 'activated', null, { timeout: 30000 });
  const left = await shared.evaluate(async () => ({
    other: await caches.has('another-tool-v1'),
    entry: await (await caches.match('/another-tool/', { cacheName: 'another-tool-v1' }))?.text(),
    longer: await (await caches.match('/arsenal-x/', { cacheName: 'arsenal-x-v1' }))?.text(),
    old: await caches.has('arsenal-v0'),
  }));
  assert.equal(left.other, true, "another tool's offline copy was deleted");
  assert.equal(left.entry, 'another tool', "another tool's offline copy lost what was in it");
  assert.equal(left.longer, 'a tool called arsenal-x', "the offline copy of a tool called arsenal-x was deleted");
  assert.equal(left.old, false, "an older Arsenal's offline copy was kept");
  await sharedCtx.close();
}

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
// The spin panel holds still too, so it's drawn when something changes rather than every frame.
{
  await calm.locator('#spin').scrollIntoViewIfNeeded();
  await calm.waitForTimeout(300);
  await calm.evaluate(() => {
    const ctx = document.getElementById('spin').getContext('2d'), clear = ctx.clearRect;
    window.spinDraws = 0;
    ctx.clearRect = function (...a) { window.spinDraws++; return clear.apply(this, a); };
  });
  await calm.waitForTimeout(1000);
  const idle = await calm.evaluate(() => window.spinDraws);
  assert.ok(idle <= 1, `the still spin panel was drawn ${idle} times in a second`);
  await calm.locator('#spinview [data-v="side"]').click();
  await calm.waitForTimeout(300);
  assert.ok(await calm.evaluate(() => window.spinDraws) > idle, 'the still spin panel was not drawn again for the side view');
  const inked = await calm.evaluate(() => { const c = document.getElementById('spin'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; });
  assert.ok(inked > 1000, 'the still spin panel is blank');
}
await calmCtx.close();

assert.deepEqual(problems.filter(p => !p.startsWith('failed:')), [], 'problems while using it');
await browser.close();
server.close();
console.log('all good');
