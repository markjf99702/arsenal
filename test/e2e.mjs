// Uses the page in Chromium the way a person would:  node test/e2e.mjs  (needs Playwright)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(join(execSync('npm root -g').toString().trim(), 'playwright')); }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
// The server answers the way GitHub Pages does at junkdrawer.works/arsenal/: under /arsenal/, so a path from the
// site's root would miss, and a browser may keep each file for ten minutes and asks again by its ETag. `net` is the
// connection: 'up', 'down' (the server drops every connection) or 'stalled' (a train, a captive wifi: it takes each
// request and holds on to it). With `release` set it serves the next release (see the offline checks).
const SITE = '/arsenal/';
let net = 'up', release = false;
const held = [];
const server = createServer((req, res) => {
  if (net === 'down') { req.socket.destroy(); return; }
  if (net === 'stalled') { held.push([req, res]); return; }
  serve(req, res);
}).listen(0);
async function serve(req, res) {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (!path.startsWith(SITE)) { res.writeHead(404); res.end(); return; }
  path = path.slice(SITE.length - 1);
  if (path.endsWith('/')) path += 'index.html';
  let body;
  try { body = await readFile(join(root, path)); } catch { res.writeHead(404); res.end(); return; }
  if (release && path === '/sw.js') body = Buffer.from(String(body).replace(/const FILES = '[0-9a-f]*'/, "const FILES = 'next'"));
  if (release && path === '/index.html') body = Buffer.concat([body, Buffer.from('<!-- the next release -->\n')]);
  const etag = `"${createHash('sha1').update(body).digest('hex').slice(0, 16)}"`;
  const head = { etag, 'cache-control': 'max-age=600', 'content-type': TYPES[extname(path)] || 'text/html' };
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, head); res.end(); return; }
  res.writeHead(200, head);
  res.end(body);
}
const base = `http://localhost:${server.address().port}${SITE}`;
// Waits for ok() to come true, for up to ms, or fails saying what didn't happen.
const until = async (ok, ms, what) => {
  for (const end = Date.now() + ms; !(await ok());) { assert.ok(Date.now() < end, what); await new Promise(r => setTimeout(r, 100)); }
};

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

// On a phone the legend still labels the dashed ring, in one word so it stays clear of two pitches' times.
assert.equal(await page.locator('#legend > span:last-child').innerText(), 'Decide', 'the decision point is not labelled on a phone');
assert.equal(await page.locator('#legend .ring').isVisible(), true, 'the decision point is not labelled on a phone');

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

// The lede's link to Pitch to a hitter is in the page's own colours rather than the browser's blue: its ink, underlined
// in its red, in either palette.
for (const colorScheme of ['light', 'dark']) {
  await page.emulateMedia({ colorScheme });
  const link = await page.evaluate(() => {
    const a = getComputedStyle(document.querySelector('.lede a'));
    const as = v => { const i = document.body.appendChild(document.createElement('i')); i.style.color = v; const c = getComputedStyle(i).color; i.remove(); return c; };
    return { color: a.color === as('var(--ink)') || a.color, line: a.textDecorationColor === as('var(--accent)') || a.textDecorationColor };
  });
  assert.deepEqual(link, { color: true, line: true }, `${colorScheme}: the lede's link`);
}
await page.emulateMedia({ colorScheme: 'light' });

// The at-bat's results in words (big, bold headings: large text) read clearly on the page and the cards in both
// palettes, the dark one whether it comes from the system or from a host's data-theme: at least 3 to 1, as WCAG AA asks.
for (const [colorScheme, theme] of [['light', null], ['dark', null], ['light', 'dark']]) {
  await page.emulateMedia({ colorScheme });
  const low = await page.evaluate(theme => {
    if (theme) document.documentElement.dataset.theme = theme;
    const token = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const lum = hex => {
      const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
    const low = [];
    for (const res of ['--res-strike', '--res-ball', '--res-play']) for (const on of ['--paper', '--card']) {
      const r = ratio(token(res), token(on));
      if (!(r >= 3)) low.push(`${res} on ${on}: ${r.toFixed(2)} to 1`);
    }
    delete document.documentElement.dataset.theme;
    return low;
  }, theme);
  assert.deepEqual(low, [], `${theme ? 'data-theme ' + theme : colorScheme}: result colours too faint`);
}
await page.emulateMedia({ colorScheme: 'light' });

// A finger off the ball in the grip drawing is the same skin tone on the dark page as on the light one, rather than
// the see-through skin over the dark page. The spot is on the four-seamer's ring finger, beside the ball.
{
  await page.evaluate(() => window.arsenal.pick('FF'));
  const seen = {};
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme });
    seen[colorScheme] = await page.evaluate(() => {
      const c = document.getElementById('grip'), R = Math.min(c.width, c.height) * 0.36;
      const x = Math.round(c.width / 2 + 0.85 * R), y = Math.round(c.height * 0.47 + 0.8 * R);
      const [r, g, b, a] = c.getContext('2d').getImageData(x, y, 1, 1).data;
      const page = getComputedStyle(c).backgroundColor.match(/\d+/g).map(Number);
      return [r, g, b].map((v, i) => Math.round((v * a + page[i] * (255 - a)) / 255));
    });
  }
  await page.emulateMedia({ colorScheme: 'light' });
  const apart = Math.max(...seen.light.map((v, i) => Math.abs(v - seen.dark[i])));
  assert.ok(apart <= 12, `a finger off the ball is rgb(${seen.dark}) on the dark page and rgb(${seen.light}) on the light one`);
}

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

// From the side, the eephus's lob stays under the speed and time in the top-left corner, on its own or with a fastball.
{
  await page.evaluate(() => window.arsenal.pick('EP'));
  await page.locator('#view [data-v="side"]').click();
  for (const pair of ['', 'FF']) {
    await page.locator('#pair').selectOption(pair);
    await arrived();
    const through = await page.evaluate(() => {
      const stage = window.arsenal.stage, cam = stage.camera(), dpr = cam.dpr;
      const frame = document.querySelector('.frame').getBoundingClientRect();
      const text = el => { const r = document.createRange(); r.selectNodeContents(el); const b = r.getBoundingClientRect(); return { left: b.left - frame.left, right: b.right - frame.left, top: b.top - frame.top, bottom: b.bottom - frame.top }; };
      const boxes = [text(document.querySelector('.readout .speed')), text(document.getElementById('ro-time'))];
      let n = 0;
      for (const f of stage.flights) {
        for (let i = 0; i <= 200; i++) {
          const s = cam.project(f.pos((f.T * i) / 200)), x = s.x / dpr, y = s.y / dpr;
          if (boxes.some(b => x >= b.left && x <= b.right && y >= b.top && y <= b.bottom)) n++;
        }
      }
      return n;
    });
    assert.equal(through, 0, `from the side, ${through} points along the eephus${pair ? ' and the four-seamer' : ''} run through the speed and time`);
  }
  await page.locator('#pair').selectOption('');
  await page.locator('#view [data-v="catcher"]').click();
  await page.evaluate(() => window.arsenal.pick('SL'));
  await arrived();
}

// Throw it with a partner pitch: two flights from the same release point.
await page.locator('#pair').selectOption('FF');
await arrived();
const flights = await page.evaluate(() => window.arsenal.stage.flights.map(f => ({ code: f.p.code, x: f.release.x, z: f.release.z })));
assert.deepEqual(flights.map(f => f.code), ['SL', 'FF']);
assert.equal(flights[0].x, flights[1].x);

// The controls stay the same height from pitch to pitch, and the list has room for every partner, even the longest:
// "Four-seam fastball (usual partner)".
{
  const { heights, cramped } = await page.evaluate(() => {
    const select = document.getElementById('pair'), heights = new Set(), cramped = [];
    const measure = document.createElement('canvas').getContext('2d');
    for (const code of [...document.querySelectorAll('.chip')].map(b => b.dataset.code)) {
      window.arsenal.pick(code);
      heights.add(Math.round(document.querySelector('.controls').getBoundingClientRect().height));
      const cs = getComputedStyle(select);
      measure.font = cs.font;
      const room = select.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 16; // 16px for the arrow
      for (const o of select.options) if (measure.measureText(o.text).width > room) cramped.push(`${code}: ${o.text}`);
    }
    return { heights: [...heights], cramped };
  });
  assert.equal(heights.length, 1, `the controls change height from pitch to pitch: ${heights.join(', ')}px`);
  assert.deepEqual(cramped, [], 'partners cut off in the "Throw with" list');
}

// Lefty: released from the other side.
await page.locator('#hand [data-v="L"]').click();
await arrived();
assert.ok(await page.evaluate(() => window.arsenal.stage.flights[0].release.x > 0), 'a lefty releases on the first-base side');
await page.locator('#hand [data-v="R"]').click();

// The card, the table and the chart give each pitch the same share of all pitches and the same speed, with the same
// places: the changeup's 86.0 mph, not 86, and the cutter's 8.0%, not 8%.
{
  const shares = await page.evaluate(() => [...document.querySelectorAll('.chip')].map(b => b.dataset.code).map(code => {
    window.arsenal.pick(code);
    const stat = name => [...document.querySelectorAll('#c-stats > div')].find(d => d.querySelector('dt').textContent === name).querySelector('b').textContent;
    const row = document.querySelector(`.lineup tbody tr[data-code="${code}"]`);
    const dot = document.querySelector('.move-chart .dot.on');
    dot.dispatchEvent(new FocusEvent('focus'));
    const tip = /([\d.]+ mph) · ([\d.]+%) of pitches/.exec(document.getElementById('tip').textContent);
    dot.dispatchEvent(new FocusEvent('blur'));
    return {
      code, card: stat('Thrown'), table: row.querySelector('td:nth-child(2) .val').textContent, tip: tip?.[2],
      speed: { card: stat('Speed'), table: `${row.querySelector('td:nth-child(3) .val').textContent} mph`, tip: tip?.[1] },
    };
  }));
  assert.equal(shares.length, 13);
  for (const s of shares) {
    assert.ok(s.card === s.table && s.card === s.tip, `${s.code}: ${s.card} on the card, ${s.table} in the table, ${s.tip} in the chart`);
    assert.ok(s.speed.card === s.speed.table && s.speed.card === s.speed.tip, `${s.code}: ${s.speed.card} on the card, ${s.speed.table} in the table, ${s.speed.tip} in the chart`);
  }
  const by = Object.fromEntries(shares.map(s => [s.code, s]));
  assert.deepEqual([by.CH.speed.table, by.FC.table], ['86.0 mph', '8.0%']);
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

// The small things to tap reach further than they look, 44px tall, without taking taps from the controls around them.
// On a phone the No-spin ghost checkbox has rows of controls 8px above and below, so it reaches as far as those.
{
  const reach = await page.evaluate(() => {
    const tall = el => {
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect(), x = r.left + Math.min(r.width / 2, 30), mid = r.top + r.height / 2;
      let top = mid, bottom = mid;
      while (top > mid - 40 && el.contains(document.elementFromPoint(x, top - 0.5))) top -= 0.5;
      while (bottom < mid + 40 && el.contains(document.elementFromPoint(x, bottom + 0.5))) bottom += 0.5;
      return bottom - top;
    };
    const ownsItsEdge = el => { el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.left + r.width / 2, r.bottom - 1)); };
    return {
      previous: tall(document.getElementById('prev')), next: tall(document.getElementById('next')),
      'From behind': tall(document.querySelector('#spinview [data-v="behind"]')), 'From the side': tall(document.querySelector('#spinview [data-v="side"]')),
      'a pitch in the table': tall(document.querySelector('.lineup tbody tr:nth-child(6) th button')),
      ghost: tall(document.querySelector('label.check')),
      keptTheirOwn: [...document.querySelectorAll('#speed button, #hand button')].every(ownsItsEdge),
    };
  });
  for (const name of ['previous', 'next', 'From behind', 'From the side', 'a pitch in the table']) {
    assert.ok(reach[name] >= 44, `${name}: a tap lands on it only within ${reach[name]}px`);
  }
  assert.ok(reach.ghost >= 36, `the No-spin ghost checkbox: a tap lands on it only within ${reach.ghost}px`);
  assert.ok(reach.keptTheirOwn, 'the No-spin ghost checkbox takes taps on the speed or hand buttons above it');
}

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

// Pitch to a hitter: call pitches by tapping a pitch, a spot and Throw it, until the at-bat ends. Every pitch is logged
// and marked, the count follows the model, a link replays the same at-bat, and "100 times" charts every pitch.
{
  const before = problems.length;
  await page.goto('about:blank');
  await page.goto(base + '#ab.average.R.1p'); // the README's hitter, before the first pitch
  const idle = () => page.waitForFunction(() => !window.arsenal.atBat.state.busy, null, { timeout: 15000 });
  // How to play is at the top of the call box, before the pitches, and nothing stands for the last pitch yet.
  const first = await page.evaluate(async () => ({
    how: document.getElementById('ab-how').textContent.replace(String((await import(new URL('js/flight.js', location.href))).DECIDE), 'DECIDE'),
    above: document.getElementById('ab-how').getBoundingClientRect().bottom <= document.getElementById('ab-pitches').getBoundingClientRect().top,
    last: getComputedStyle(document.getElementById('ab-last')).display,
  }));
  assert.deepEqual(first, {
    how: 'Pick a pitch and a spot, then throw it. The hitter has to commit at the decision point, DECIDE seconds from the plate, and a swing at a pitch out of the zone is a chase. Strikes are red (called, swinging or fouled), balls green, balls in play blue.',
    above: true, last: 'none',
  }, 'before the first pitch');
  // Picked with the keyboard, a pitch and a spot keep focus, and so does Throw while the ball flies (at Slow, so there's
  // time to look) and once it has landed.
  const focused = () => page.evaluate(() => {
    const a = document.activeElement;
    return { id: a.id, name: a.getAttribute('aria-label') || a.textContent.trim().split(' ')[0], pressed: a.getAttribute('aria-pressed'), busy: window.arsenal.atBat.state.busy };
  });
  await page.locator('#ab-pitches .ab-chip', { hasText: 'Slider' }).focus();
  await page.keyboard.press('Enter');
  assert.deepEqual(await focused(), { id: '', name: 'Slider', pressed: 'true', busy: false }, 'focus after picking a pitch with Enter');
  await page.locator('#ab-spots [aria-label="down and away"]').focus();
  await page.keyboard.press('Enter');
  assert.deepEqual(await focused(), { id: '', name: 'down and away', pressed: 'true', busy: false }, 'focus after picking a spot with Enter');
  assert.equal(await page.locator('#ab-choice').innerText(), 'Slider, down and away');
  await page.locator('#ab-speed [data-v="0.25"]').click();
  await page.locator('#ab-throw').focus();
  await page.keyboard.press('Enter');
  assert.deepEqual(await focused(), { id: 'ab-throw', name: 'Throw', pressed: null, busy: true }, 'focus while the pitch flies');
  await idle();
  assert.deepEqual(await focused(), { id: 'ab-throw', name: 'Throw', pressed: null, busy: false }, 'focus once the pitch has landed');
  await page.locator('#ab-speed [data-v="1"]').click();
  assert.equal(await page.locator('#ab-log li').count(), 1);
  assert.ok((await page.locator('#ab-last .res').innerText()).length > 2, 'no result shown for the first pitch');
  const model = () => page.evaluate(() => { const ab = window.arsenal.atBat.state.ab; return { balls: ab.balls, strikes: ab.strikes, n: ab.pitches.length, result: ab.result, marks: window.arsenal.atBat.stage.opts.marks.length }; });
  let m = await model();
  if (!m.result) assert.equal((await page.locator('#ab-count .ct').innerText()), `${m.balls}-${m.strikes}`);
  for (let i = 0; i < 20 && !(await model()).result; i++) {
    // A hundred of each, from the count as it stands: never a count past the end, like 4-1 or 2-3.
    await page.locator('#ab-run').click();
    assert.match(await page.locator('#ab-chart > p').first().textContent(), /^League-average righty, .+, in a [0-3]-[0-2] count(, right after the [a-z -]+)?: what happens out of 100 throws of each pitch\.$/);
    await page.locator('#ab-suggest').click();
    assert.match(await page.locator('#ab-hint').innerText(), /^A typical call in a \d-\d count: /);
    await page.locator('#ab-throw').click();
    await idle();
  }
  m = await model();
  assert.ok(m.result, 'the at-bat never ended');
  // Focus was on Throw, which went with the pitch controls: it's on the result now.
  assert.equal(await page.evaluate(() => document.activeElement.id), 'ab-result', 'focus at the end of the at-bat');
  assert.equal(await page.locator('#ab-end').isHidden(), false, 'no result card at the end of the at-bat');
  assert.equal(await page.locator('#ab-callbox').isHidden(), true, 'the pitch controls are still there after the at-bat ended');
  assert.match(await page.locator('#ab-result').innerText(), /^(strikeout swinging|strikeout looking|walk|hit by pitch|out in play|single|double|triple|home run)$/i);
  assert.ok((await page.locator('#ab-note').innerText()).length > 20, 'no scout\'s note');
  assert.equal(await page.locator('#ab-log li').count(), m.n);
  assert.equal(m.marks, m.n, 'not every pitch is marked where it crossed the plate');
  // The link replays the same at-bat, pitch for pitch.
  const log = await page.locator('#ab-log').innerText();
  const link = await page.evaluate(() => window.arsenal.atBat.link());
  await page.goto('about:blank');
  await page.goto(base + '#' + link);
  await idle();
  assert.equal(await page.locator('#ab-log').innerText(), log, 'the link replayed a different at-bat');
  assert.equal(await page.locator('#ab-notice').isHidden(), true, 'a notice over a link that played as it was');
  // A link asking for what can't be done still opens, and says so over the call box, or over the end card.
  for (const [hash, said] of [
    ['#ab.nobody.R.1p.SL6', 'There’s no pitcher called “nobody” here, so this is the league-average righty.'],
    ['#ab.average.R.1p.FF6.SL23.CH16.FF3.SL24.CU22.FF6.FF6.FF6', 'The link had 3 more pitches after the at-bat ended; they were left out.'],
    ['#ab.rogers.R.9.SI16.FF3.SI2', 'Tyler Rogers doesn’t throw a four-seamer, so the link’s last 2 pitches were left out.'],
    ['#ab.average.R.9.FF6.SL40', 'The link’s pitch 2 is called to a spot that isn’t on the grid, so that pitch was left out.'],
  ]) {
    await page.goto('about:blank');
    await page.goto(base + hash);
    await idle();
    assert.equal(await page.locator('#ab-notice').textContent(), said, hash);
    assert.equal(await page.locator('#ab-notice').isVisible(), true, `${hash}: the notice is hidden`);
  }
  await page.locator('#ab-pitcher').selectOption('sale');
  assert.equal(await page.locator('#ab-notice').isHidden(), true, 'the link’s notice is still there for a new at-bat');
  await page.goto('about:blank');
  await page.goto(base + '#' + link);
  await idle();
  // Where the clipboard is allowed, Copy link copies it and says so.
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.locator('#ab-copy').click();
  await page.waitForFunction(() => document.getElementById('ab-copied').textContent);
  assert.equal(await page.locator('#ab-copied').textContent(), 'Link copied. Whoever opens it sees this exact at-bat.');
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'https://junkdrawer.works/arsenal/#' + link, 'Copy link copied something else');
  assert.equal(await page.locator('#ab-link').isHidden(), true, 'the link field shows after the link was copied');
  // Once it's over there's no next pitch, so a hundred of each look back at the last one, from the count it was in.
  const endedOn = await page.evaluate(() => { const l = window.arsenal.atBat.state.ab.pitches.at(-1); return `${l.before.balls}-${l.before.strikes}`; });
  assert.equal(await page.locator('#ab-run').textContent(), `What else could he have thrown on that ${endedOn} pitch?`);
  await page.locator('#ab-run').click();
  assert.match(await page.locator('#ab-chart > p').first().textContent(), new RegExp(`^On that ${endedOn} pitch, called .+, instead of the [a-z -]+: what happens out of 100 throws of each pitch\\.$`));
  assert.equal(await page.locator('#ab-chart .hundred-bars li').count(), await page.evaluate(() => window.arsenal.atBat.state.pitcher.pitches.length));
  // Another pitcher, and a left-handed batter: the grid turns round so his inside is on the right.
  await page.locator('#ab-next').click();
  assert.equal(await page.locator('#ab-run').textContent(), 'Throw each of his pitches 100 times from here');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'ab-throw', 'focus after Next hitter');
  await page.locator('#ab-pitcher').selectOption('rogers');
  assert.equal(await page.locator('#ab-pitches .ab-chip').count(), 2);
  assert.equal(await page.locator('#ab-live').textContent(), 'New at-bat: Tyler Rogers to a right-handed batter.');
  // His name set apart from his line, which has a colon of its own.
  assert.equal(await page.locator('#ab-line').textContent(), 'Tyler Rogers. A submariner: an 83 mph sinker from below the knees.');
  assert.equal(await page.locator('#ab-line b').textContent(), 'Tyler Rogers.');
  assert.equal(await page.locator('#ab-spots button').first().getAttribute('aria-label'), 'high and off the plate inside');
  await page.locator('#ab-batter [data-v="L"]').click();
  assert.equal(await page.locator('#ab-spots button').first().getAttribute('aria-label'), 'high and off the plate away');
  // A new pitcher or batter starts a new at-bat, and a screen reader hears who's up.
  assert.equal(await page.locator('#ab-live').textContent(), 'New at-bat: Tyler Rogers to a left-handed batter.');
  // The new pitcher's pitches and the turned grid pick too.
  await page.locator('#ab-pitches .ab-chip').last().click();
  await page.locator('#ab-spots [aria-label="down and away"]').click();
  assert.match(await page.locator('#ab-choice').innerText(), /^\w+, down and away$/);
  assert.equal(await page.locator('#ab-spots [aria-pressed="true"]').getAttribute('aria-label'), 'down and away');
  await page.locator('#ab-throw').click();
  await idle();
  assert.equal(await page.locator('#ab-log li').count(), 1);
  // Nothing in it scrolls sideways on the narrowest phones.
  for (const width of [320, 360]) {
    await page.setViewportSize({ width, height: 740 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `the page scrolls sideways at ${width}px`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  assert.deepEqual(problems.slice(before), [], 'problems while pitching to a hitter');
}

// Pitch to a hitter on a phone, tapped the way a thumb would. The readout over the picture says what each pitch did,
// and a shared link shows the count and the pitches before the one it throws again.
const STRIKEOUT = '#ab.average.R.1p.FF6.SL23.CH16.FF3.SL24.CU22'; // the README's: a strikeout swinging on a 2-2 curve
for (const [width, height] of [[390, 844], [320, 640]]) {
  const phoneCtx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  await phoneCtx.addInitScript(() => {
    // The clipboard is refused, as it is in some in-app browsers and in the framed copy.
    if (navigator.clipboard) navigator.clipboard.writeText = () => Promise.reject(new DOMException('The Clipboard API has been blocked', 'NotAllowedError'));
    // Taps "What would a catcher call?" and the hundred throws, and says whether they answered.
    window.askNow = () => {
      for (const id of ['ab-suggest', 'ab-run']) document.getElementById(id).click();
      return { waits: ['ab-suggest', 'ab-run'].map(id => document.getElementById(id).getAttribute('aria-disabled')), hint: document.getElementById('ab-hint').textContent, chart: document.getElementById('ab-chart').childElementCount };
    };
  });
  const ph = await phoneCtx.newPage();
  watch(ph);
  const idle = () => ph.waitForFunction(() => !window.arsenal.atBat.state.busy, null, { timeout: 15000 });
  const at = `at ${width}px`;
  await ph.goto(base + STRIKEOUT.replace(/\.FF6.*/, '')); // the same hitter, before the first pitch
  await ph.evaluate(() => document.fonts.ready);
  await ph.locator('#ab-pitches .ab-chip', { hasText: 'Four-seam' }).tap();
  await ph.locator('#ab-spots [aria-label="up and in"]').tap();
  // Throw it with the button low on the screen, where a thumb is: the picture is on screen while the ball flies.
  await ph.evaluate(() => scrollBy(0, document.getElementById('ab-throw').getBoundingClientRect().bottom - (innerHeight - 40)));
  await ph.locator('#ab-throw').tap();
  // While it flies, the catcher's call and the hundred throws wait: the model has already thrown it, so they'd give it away.
  const flying = await ph.evaluate(() => {
    const r = document.getElementById('ab-flight').getBoundingClientRect();
    return { busy: window.arsenal.atBat.state.busy, seen: (Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)) / r.height, asked: window.askNow() };
  });
  assert.ok(flying.busy, `${at}, the pitch had landed before it could be checked`);
  assert.ok(flying.seen >= 0.8, `${at}, only ${Math.round(Math.max(0, flying.seen) * 100)}% of the picture is on screen while the pitch flies`);
  assert.deepEqual(flying.asked, { waits: ['true', 'true'], hint: '', chart: 0 }, `${at}, asked while the pitch was in the air`);
  await idle();
  assert.deepEqual(await ph.evaluate(() => ['ab-suggest', 'ab-run'].map(id => document.getElementById(id).getAttribute('aria-disabled'))), ['false', 'false'], `${at}, the buttons still wait after the pitch landed`);
  assert.equal(await ph.locator('#ab-last .res').textContent(), 'Called strike');
  assert.equal(await ph.locator('#ab-ro').textContent(), 'Called strike · 94.8\u00a0mph four-seamer', `${at}, the readout doesn't say what the pitch did`);

  // Strike three thrown with the button low: the result card takes the controls' place, out from behind the picture.
  await ph.goto('about:blank');
  await ph.goto(base + STRIKEOUT.replace(/\.CU22$/, ''));
  await idle();
  await ph.locator('#ab-pitches .ab-chip', { hasText: 'Curve' }).tap();
  await ph.locator('#ab-spots [aria-label="in the dirt"]').tap();
  await ph.evaluate(() => scrollBy(0, document.getElementById('ab-throw').getBoundingClientRect().bottom - (innerHeight - 40)));
  await ph.locator('#ab-throw').tap();
  await idle();
  const ended = await ph.evaluate(() => ({ picture: document.getElementById('ab-flight').getBoundingClientRect().bottom, card: document.getElementById('ab-end').getBoundingClientRect().top }));
  assert.ok(ended.card >= ended.picture && ended.card < height - 150, `${at}, the result card starts at ${Math.round(ended.card)}px, under a picture ending at ${Math.round(ended.picture)}px`);

  // A link: while its last pitch is thrown again, the count and the log are from before it.
  await ph.goto('about:blank');
  await ph.goto(base + STRIKEOUT);
  const replay = await ph.evaluate(() => {
    const { busy, ab } = window.arsenal.atBat.state, last = ab.pitches.at(-1);
    return {
      busy, count: document.querySelector('#ab-count .ct').textContent, log: document.querySelectorAll('#ab-log li').length,
      ro: document.getElementById('ab-ro').textContent, asked: window.askNow(),
      want: { count: `${last.before.balls}-${last.before.strikes}`, log: ab.pitches.length - 1, ro: `Pitch ${last.n} · ${last.mph.toFixed(1)} mph` },
    };
  });
  assert.ok(replay.busy, `${at}, the link's last pitch had landed before it could be checked`);
  assert.deepEqual(replay.want, { count: '2-2', log: 5, ro: 'Pitch 6 · 80.3 mph' }, 'the README strikeout plays differently now');
  assert.deepEqual({ count: replay.count, log: replay.log }, { count: '2-2', log: 5 }, `${at}, while the link's last pitch flies`);
  assert.equal(replay.ro, 'Pitch 6 · 80.3\u00a0mph curveball', `${at}, while the link's last pitch flies`);
  assert.deepEqual(replay.asked, { waits: ['true', 'true'], hint: '', chart: 0 }, `${at}, asked while the link's last pitch flies`);
  await idle();
  assert.equal(await ph.locator('#ab-ro').textContent(), `${await ph.locator('#ab-result').textContent()} · 6 pitches`);
  // "mph" stays with its number (a no-break space) when a log line wraps on a phone.
  assert.equal((await ph.locator('#ab-log').textContent()).match(/\d\u00a0mph/g)?.length, 6, `${at}, the log's speeds can wrap before "mph"`);
  // Once it's over, the count gives way to the scorebook's mark and the count it ended on, and that's what a screen
  // reader hears too, not a count of 2 and 2 after strike three. A strikeout looking is a backwards K; a walk is BB.
  const ending = () => ph.evaluate(() => {
    const ct = document.querySelector('#ab-count .ct');
    return { mark: ct.textContent, label: ct.getAttribute('aria-label'), flipped: getComputedStyle(ct).transform === 'matrix(-1, 0, 0, 1, 0, 0)', on: document.querySelector('#ab-count .on')?.textContent, heard: document.getElementById('ab-live').textContent };
  });
  assert.deepEqual(await ending(), { mark: 'K', label: 'Strikeout swinging', flipped: false, on: 'on a 2-2 pitch', heard: 'Strikeout swinging on a 2-2 pitch.' }, `${at}, at the end of the strikeout`);
  for (const [link, want] of [
    ['#ab.average.R.2.FF8.FF6.SL16.FF7.CU13', { mark: 'K', label: 'Strikeout looking', flipped: true, on: 'on a 1-2 pitch', heard: 'Strikeout looking on a 1-2 pitch.' }],
    ['#ab.average.R.3a.FF8.FF6.SL16.FF7', { mark: 'BB', label: 'Walk', flipped: false, on: 'on a 3-0 pitch', heard: 'Walk on a 3-0 pitch.' }],
  ]) {
    await ph.goto('about:blank');
    await ph.goto(base + link);
    await idle();
    assert.deepEqual(await ending(), want, `${at}, at the end of ${link}`);
  }
  await ph.goto('about:blank');
  await ph.goto(base + STRIKEOUT);
  await idle();

  // Copy link with the clipboard refused: it says so and puts the link in a field, selected, to copy by hand. The end
  // card stays inside the call box, and nothing scrolls sideways.
  await ph.locator('#ab-copy').tap();
  const copied = await ph.evaluate(() => {
    const field = document.getElementById('ab-link'), end = document.getElementById('ab-end').getBoundingClientRect(), box = document.querySelector('.bat-call').getBoundingClientRect();
    return {
      said: document.getElementById('ab-copied').textContent, link: field?.value, shown: !!field && !field.hidden,
      focused: !!field && document.activeElement === field, selected: !!field && field.selectionStart === 0 && field.selectionEnd === field.value.length,
      inside: end.left >= box.left && end.right <= box.right, sideways: document.documentElement.scrollWidth > innerWidth,
    };
  });
  assert.deepEqual(copied, { said: "Couldn’t copy here. Select the link and copy it:", link: 'https://junkdrawer.works/arsenal/' + STRIKEOUT, shown: true, focused: true, selected: true, inside: true, sideways: false }, `${at}, Copy link with the clipboard refused`);

  // The hundred throws look back at strike three: what else he could have thrown on that 2-2 pitch, rather than a next
  // pitch from a count of 2 and 3. Tapped low on the screen, the chart comes into view below the picture, and each bar
  // has only the outcomes that happened, so they all start at the same place.
  assert.equal(await ph.locator('#ab-run').textContent(), 'What else could he have thrown on that 2-2 pitch?');
  await ph.evaluate(() => scrollBy(0, document.getElementById('ab-run').getBoundingClientRect().bottom - (innerHeight - 20)));
  await ph.locator('#ab-run').tap();
  for (let y = -1, now; (now = await ph.evaluate(() => scrollY)) !== y; y = now) await ph.waitForTimeout(250);
  const hundred = await ph.evaluate(() => {
    const c = document.getElementById('ab-chart'), r = c.getBoundingClientRect(), f = document.getElementById('ab-flight').getBoundingClientRect();
    return {
      said: [...c.querySelectorAll('p')].map(p => p.textContent), below: r.top >= f.bottom - 1, onScreen: r.top < innerHeight - 150,
      empty: [...c.querySelectorAll('.sg')].filter(s => !(parseFloat(s.style.flexGrow) > 0)).length,
      starts: new Set([...c.querySelectorAll('.bar')].map(b => Math.round(b.firstElementChild.getBoundingClientRect().left))).size,
    };
  });
  assert.deepEqual(hundred, {
    said: ['On that 2-2 pitch, called in the dirt, instead of the curveball: what happens out of 100 throws of each pitch.', "Blues went the pitcher’s way, oranges the hitter’s."],
    below: true, onScreen: true, empty: 0, starts: 1,
  }, `${at}, the hundred throws at the end of the strikeout`);
  // Every word on the page, the at-bat's included, uses a typographic apostrophe.
  assert.deepEqual(await ph.evaluate(() => document.body.innerText.match(/\w'\w/g)), null, `${at}, straight apostrophes on the page`);

  // The next hitter starts clean: no readout left from the last one.
  // Scrolled so the end card is behind the picture, it's still there to tap; the pitch controls come back below it.
  await ph.evaluate(() => scrollBy(0, document.getElementById('ab-end').getBoundingClientRect().top - 60));
  await ph.locator('#ab-next').tap();
  const back = await ph.evaluate(() => ({ picture: document.getElementById('ab-flight').getBoundingClientRect().bottom, controls: document.getElementById('ab-callbox').getBoundingClientRect().top }));
  assert.ok(back.controls >= back.picture && back.controls < height - 100, `${at}, after Next hitter the pitch controls start at ${Math.round(back.controls)}px, under a picture ending at ${Math.round(back.picture)}px`);
  assert.equal(await ph.locator('#ab-ro').textContent(), '', `${at}, the readout still describes the last at-bat`);
  assert.equal(await ph.locator('#ab-count .ct').textContent(), '0-0');
  // So does a new pitcher picked while a pitch is in the air.
  await ph.locator('#ab-throw').tap();
  await ph.locator('#ab-pitcher').selectOption('skenes');
  await ph.waitForTimeout(1200);
  assert.deepEqual(await ph.evaluate(() => ({ busy: window.arsenal.atBat.state.busy, ro: document.getElementById('ab-ro').textContent, log: document.querySelectorAll('#ab-log li').length })), { busy: false, ro: '', log: 0 }, `${at}, after a new pitcher mid-pitch`);
  // Skenes's six pitches take three rows, and the batter's side is one line over the grid, at his end of it.
  for (const batter of ['R', 'L']) {
    await ph.locator(`#ab-batter [data-v="${batter}"]`).tap();
    const box = await ph.evaluate(() => {
      const side = document.getElementById('ab-side'), s = side.getBoundingClientRect(), g = document.getElementById('ab-spots').getBoundingClientRect();
      return {
        rows: new Set([...document.querySelectorAll('#ab-pitches .ab-chip')].map(b => Math.round(b.getBoundingClientRect().top))).size,
        oneLine: s.height < parseFloat(getComputedStyle(side).lineHeight) * 1.5, above: s.bottom <= g.top,
        width: Math.round(s.left - g.left) === 0 && Math.round(s.right - g.right) === 0, align: getComputedStyle(side).textAlign,
      };
    });
    assert.deepEqual(box, { rows: 3, oneLine: true, above: true, width: true, align: batter === 'R' ? 'left' : 'right' }, `${at}, the call box for a ${batter === 'R' ? 'right' : 'left'}-handed batter`);
  }
  // With a keyboard, Shift+Tab back from the pitches reaches the speed buttons, which had scrolled away under the
  // picture: they come out from behind it, as the call box's buttons do.
  await ph.evaluate(() => scrollBy(0, document.getElementById('ab-throw').getBoundingClientRect().bottom - (innerHeight - 40)));
  await ph.locator('#ab-pitches .ab-chip').first().focus();
  await ph.keyboard.press('Shift+Tab');
  const shifted = await ph.evaluate(() => ({ on: document.activeElement.closest('#ab-speed') ? 'speed' : document.activeElement.textContent, top: document.activeElement.getBoundingClientRect().top, picture: document.getElementById('ab-flight').getBoundingClientRect().bottom }));
  assert.ok(shifted.on === 'speed' && shifted.top >= shifted.picture, `${at}, Shift+Tab to ${shifted.on} put it at ${Math.round(shifted.top)}px, behind a picture ending at ${Math.round(shifted.picture)}px`);
  assert.equal(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${at}, the page scrolls sideways`);
  await phoneCtx.close();
}

// A phone held sideways is a short screen. Neither picture is taller than it, and the at-bat's is beside the call box,
// so it's on screen while a pitch thrown with the button low on the screen flies. Strike three's end card, which takes
// the pitch controls' place, comes into view.
for (const [width, height] of [[844, 390], [667, 375]]) {
  const sideCtx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const side = await sideCtx.newPage();
  watch(side);
  const at = `held sideways at ${width}x${height}`;
  await side.goto(base + STRIKEOUT.replace(/\.CU22$/, ''));
  await side.waitForFunction(() => !window.arsenal.atBat.state.busy, null, { timeout: 15000 });
  const fits = await side.evaluate(() => ({
    explorer: document.getElementById('flight').getBoundingClientRect().height <= innerHeight,
    atBat: document.getElementById('ab-flight').getBoundingClientRect().height <= innerHeight,
    sideways: document.documentElement.scrollWidth > innerWidth,
  }));
  assert.deepEqual(fits, { explorer: true, atBat: true, sideways: false }, `${at}, a picture is taller than the screen, or the page scrolls sideways`);
  await side.locator('#ab-pitches .ab-chip', { hasText: 'Curve' }).tap();
  await side.locator('#ab-spots [aria-label="in the dirt"]').tap();
  await side.evaluate(() => scrollBy(0, document.getElementById('ab-throw').getBoundingClientRect().bottom - (innerHeight - 40)));
  await side.locator('#ab-throw').tap();
  const flying = await side.evaluate(() => {
    const r = document.getElementById('ab-flight').getBoundingClientRect();
    return { busy: window.arsenal.atBat.state.busy, seen: (Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)) / r.height };
  });
  assert.ok(flying.busy, `${at}, the pitch had landed before it could be checked`);
  assert.ok(flying.seen >= 0.8, `${at}, only ${Math.round(Math.max(0, flying.seen) * 100)}% of the picture is on screen while the pitch flies`);
  await side.waitForFunction(() => !window.arsenal.atBat.state.busy, null, { timeout: 15000 });
  const card = await side.evaluate(() => document.getElementById('ab-end').getBoundingClientRect().top);
  assert.ok(card >= 0 && card < height - 100, `${at}, strike three's end card starts at ${Math.round(card)}px`);
  assert.equal(await side.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${at}, the page scrolls sideways`);
  await sideCtx.close();
}

// The end card's headline is coloured like the last pitch's mark and its number in the log: a strikeout red, a walk or
// a hit by pitch green, a ball in play blue, a home run too. The last pitch's box under it says why without repeating
// the headline in other words.
for (const [link, kind] of [
  [STRIKEOUT, 'strike'], ['#ab.average.R.3a.FF8.FF6.SL16.FF7', 'ball'], ['#ab.average.R.2x.FF6.FF8.CH16.SL16.FF10', 'ball'],
  ['#ab.average.R.3.CH17.FF14.FF16', 'play'], ['#ab.average.R.4c.FF9.SI16.FF7', 'play'],
]) {
  await page.goto('about:blank');
  await page.goto(base + link);
  await page.waitForFunction(() => !window.arsenal.atBat.state.busy, null, { timeout: 15000 });
  const end = await page.evaluate(() => {
    const kind = document.querySelector('#ab-log li:last-child').className.replace('k-', '');
    const probe = document.getElementById('ab-end').appendChild(document.createElement('i'));
    probe.style.color = `var(--res-${kind})`;
    const want = getComputedStyle(probe).color;
    probe.remove();
    return {
      result: document.getElementById('ab-result').textContent, kind, matches: getComputedStyle(document.getElementById('ab-result')).color === want,
      last: document.querySelector('#ab-last p').textContent, headline: document.querySelectorAll('#ab-last .res').length,
    };
  });
  assert.deepEqual({ kind: end.kind, matches: end.matches, last: end.last, headline: end.headline }, { kind, matches: true, last: 'Last pitch', headline: 0 }, `the end card of ${link} (${end.result})`);
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

// Works offline once it has been opened. The server goes down as well as the browser: in some Chromium builds the
// browser's offline switch alone doesn't stop the service worker's own requests, and this passed with no copy at all.
await page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 10000 });
net = 'down';
await ctx.setOffline(true);
await page.reload();
await page.evaluate(() => document.fonts.ready);
assert.match(await heading(), /^Knuckleball/i, 'the page did not load offline');
await ctx.setOffline(false);
net = 'up';

// On a connection that's up but not answering, it opens from the copy too, after the worker's few seconds' wait for
// the network: the page and every file it loads (were any of them left waiting on the network, it wouldn't open).
net = 'stalled';
const t0 = Date.now();
await page.reload({ timeout: 10000 }).catch(() => {});
const took = Date.now() - t0;
assert.ok(took < 8000, `the page took ${took} ms to open on a stalled connection`);
assert.match(await heading(), /^Knuckleball/i, 'the page did not open on a stalled connection');
net = 'up';
for (const [req, res] of held.splice(0)) serve(req, res);

// A new release: every file in the new copy comes from the server, though the browser still has its own copies of
// the old ones for ten minutes. (The next release changes index.html, and so FILES in sw.js, as a real one does.)
release = true;
await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
await until(() => page.evaluate(async () => !!(await (await caches.match('index.html'))?.text())?.includes('<!-- the next release -->')),
  10000, "the new release's offline copy kept the old index.html");
release = false;

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

// On the narrowest phones the card's big numbers stay on one line for every pitch ("2,605 rpm", never "2,605" over
// "rpm"), and nothing scrolls sideways.
for (const width of [320, 360]) {
  const narrowCtx = await browser.newContext({ viewport: { width, height: 700 }, deviceScaleFactor: 2, hasTouch: true, serviceWorkers: 'block' });
  const narrow = await narrowCtx.newPage();
  watch(narrow);
  await narrow.goto(base);
  await narrow.evaluate(() => document.fonts.ready);
  const wrapped = await narrow.evaluate(() => [...document.querySelectorAll('.chip')].map(b => b.dataset.code).flatMap(code => {
    window.arsenal.pick(code);
    return [...document.querySelectorAll('#c-stats b')]
      .filter(b => b.getBoundingClientRect().height > parseFloat(getComputedStyle(b).lineHeight) * 1.5)
      .map(b => `${code}: ${b.textContent}`);
  }));
  assert.deepEqual(wrapped, [], `at ${width}px these numbers on the card wrap onto two lines`);
  assert.equal(await narrow.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `the page scrolls sideways at ${width}px`);
  // The spin view's two labels don't fit side by side here, so the pill cuts one off, but a pressed "From the side" stays
  // inside the pill's rounded end: just past its top corner is the card, not the pressed button.
  await narrow.locator('#spinview [data-v="side"]').click();
  await narrow.evaluate(() => document.getElementById('spinview').scrollIntoView({ block: 'center' }));
  const pill = await narrow.locator('#spinview').boundingBox();
  const corner = await narrow.screenshot({ clip: { x: pill.x + pill.width - 6, y: pill.y, width: 6, height: 6 }, scale: 'css' });
  const past = await narrow.evaluate(async png => {
    const shot = await createImageBitmap(new Blob([Uint8Array.from(atob(png), c => c.charCodeAt(0))], { type: 'image/png' }));
    const ctx = Object.assign(document.createElement('canvas'), { width: shot.width, height: shot.height }).getContext('2d');
    ctx.drawImage(shot, 0, 0);
    const card = getComputedStyle(document.getElementById('card')).backgroundColor.match(/\d+/g).map(Number);
    const seen = [...ctx.getImageData(shot.width - 3, 2, 1, 1).data].slice(0, 3);
    return { seen, apart: Math.max(...seen.map((v, i) => Math.abs(v - card[i]))) };
  }, corner.toString('base64'));
  assert.ok(past.apart <= 12, `at ${width}px a pressed "From the side" shows past the pill's rounded end: rgb(${past.seen})`);
  await narrowCtx.close();
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

// What the page says it is, to a search engine, a link preview and an installed copy: the at-bat too, not only the
// pitches. The preview and the installed copy say the same, more briefly than the description.
{
  const html = await readFile(join(root, 'index.html'), 'utf8'), manifest = JSON.parse(await readFile(join(root, 'manifest.webmanifest'), 'utf8'));
  const desc = html.match(/<meta name="description" content="([^"]*)"/)[1], og = html.match(/<meta property="og:description" content="([^"]*)"/)[1];
  assert.match(desc, /pitch to a hitter/i, 'the description leaves out Pitch to a hitter');
  assert.match(og, /pitch to a hitter/i, 'the link preview leaves out Pitch to a hitter');
  assert.equal(manifest.description, og, 'the installed copy and the link preview describe it differently');
  assert.ok(og.length < desc.length, 'the link preview says more than the description');
}

// sw.js changes whenever a file it keeps does, so a release replaces the whole offline copy at once: FILES in sw.js is
// a fingerprint of every file in SHELL (sha1 of each, in the list's order, an address like './' read as its
// index.html; the first 8 hex of the sha1 of those).
const sw = await readFile(join(root, 'sw.js'), 'utf8');
const shell = [...sw.match(/SHELL = \[([^\]]*)\]/)[1].replace(/\/\/.*/g, '').matchAll(/'([^']*)'/g)].map(m => m[1]);
const all = createHash('sha1');
for (const f of shell) all.update(createHash('sha1').update(await readFile(join(root, f.endsWith('/') ? f + 'index.html' : f))).digest());
const files = all.digest('hex').slice(0, 8);
assert.equal(sw.match(/const FILES = '([0-9a-f]*)'/)?.[1], files, `a file sw.js keeps for offline has changed: set FILES in sw.js to '${files}'`);
console.log('all good');
