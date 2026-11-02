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

// What a screen reader finds in the explorer. The movement chart is a group of its dots, named by its heading, without
// every number on its grid and the axes' words read out (as an img its dots would be presentational, ARIA 1.2). The
// "Swing or take?" cue, which only flashes up for the eye, isn't read out of context. The card's movement is "15.6
// inches up", not "upwards arrow 15.6 in". The table's speed range is an image with its words, since ARIA 1.2 doesn't
// allow a label on a plain span.
{
  const move = await page.locator('#move').ariaSnapshot(), frame = await page.locator('.stage .frame').ariaSnapshot();
  const stats = await page.locator('#c-stats').ariaSnapshot(), row = await page.locator('.lineup tbody tr[data-code="FF"]').ariaSnapshot();
  assert.match(move, /^- group "How each one moves":\n/, move.slice(0, 200));
  assert.doesNotMatch(move, /- text:/, 'the movement chart reads out its grid and axes');
  assert.equal((move.match(/- 'button "/g) || []).length, 13, 'the movement chart\'s dots');
  assert.doesNotMatch(frame, /Swing or take/, 'the decision cue is read out of context');
  assert.match(stats, /definition: 15\.6 inches up arm side 7\.8\s?in/, stats);
  assert.doesNotMatch(stats, /↑|↓/, stats);
  assert.match(row, /img "94\.8 mph on average; most pitchers between 92\.0 and 97\.6"/, row);
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

// A segmented button's focus ring is drawn inside it: the pill clips its buttons, so a ring outside one is cut down to
// slivers. The end buttons are rounded like the pill, so the ring follows its ends round. Every pill: the camera, speed,
// hand and spin view, and the at-bat's batter and speed.
{
  await page.keyboard.press('Shift'); // a key, so focus is shown as the keyboard's
  const cut = await page.evaluate(() => {
    const cut = [...document.querySelectorAll('.seg button')].map(b => {
      b.focus({ preventScroll: true });
      const cs = getComputedStyle(b), row = b.parentElement;
      const inside = b.matches(':focus-visible') && cs.outlineStyle === 'solid' && parseFloat(cs.outlineWidth) >= 2 && parseFloat(cs.outlineOffset) <= -parseFloat(cs.outlineWidth);
      const rounded = (b !== row.firstElementChild || parseFloat(cs.borderTopLeftRadius) > 0) && (b !== row.lastElementChild || parseFloat(cs.borderTopRightRadius) > 0);
      return inside && rounded ? null : `${row.getAttribute('aria-label')}, ${b.textContent}: a ${cs.outlineWidth} ring at ${cs.outlineOffset}${rounded ? '' : ', square at the pill’s end'}`;
    }).filter(Boolean);
    document.activeElement.blur();
    scrollTo(0, 0);
    return cut;
  });
  assert.deepEqual(cut, [], 'focus rings cut off by their pill');
}

// Hover looks are only for a pointer that hovers: on a touch screen the last thing tapped kept its hover look.
{
  const loose = await page.evaluate(() => {
    const out = [];
    const walk = (rules, hovers) => {
      for (const r of rules) {
        if (r instanceof CSSMediaRule) walk(r.cssRules, hovers || /\(hover:\s*hover\)/.test(r.conditionText));
        else if (r.selectorText?.includes(':hover') && !hovers) out.push(r.selectorText);
      }
    };
    for (const s of document.styleSheets) walk(s.cssRules, false);
    return out;
  });
  assert.deepEqual(loose, [], 'hover looks that stay on what was tapped on a touch screen');
}

// The strike zone on the at-bat's grid of spots is one framed shape, and the dashed ring of spots outside it is plain
// against the page too: both at least 3 to 1 in either palette, as WCAG 2.2 asks of what shows a control (SC 1.4.11).
// The frame is in the gap round the nine, on every side, and not between them.
for (const colorScheme of ['light', 'dark']) {
  await page.emulateMedia({ colorScheme });
  await page.evaluate(() => document.getElementById('ab-spots').scrollIntoView({ block: 'end' }));
  const png = (await page.screenshot({ clip: await page.locator('#ab-spots').boundingBox(), scale: 'css' })).toString('base64');
  const zone = await page.evaluate(async png => {
    const shot = await createImageBitmap(new Blob([Uint8Array.from(atob(png), c => c.charCodeAt(0))], { type: 'image/png' }));
    const ctx = Object.assign(document.createElement('canvas'), { width: shot.width, height: shot.height }).getContext('2d');
    ctx.drawImage(shot, 0, 0);
    const grid = document.getElementById('ab-spots'), g = grid.getBoundingClientRect(), r = i => grid.children[i].getBoundingClientRect();
    const at = (x, y) => [...ctx.getImageData(Math.floor(x - g.left), Math.floor(y - g.top), 1, 1).data].slice(0, 3);
    const rgb = c => c.match(/[\d.]+/g).slice(0, 3).map(Number);
    const lum = c => { const [R, G, B] = c.map(v => v / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * R + 0.7152 * G + 0.0722 * B; };
    const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
    const paper = rgb(getComputedStyle(grid).backgroundColor), against = c => Math.round(ratio(c, paper) * 10) / 10;
    // The nine are spots 6-8, 11-13 and 16-18, the middle one 12. Each side of the frame is looked at halfway along.
    const tl = r(6), mid = r(12), br = r(18), x = mid.left + mid.width / 2, y = mid.top + mid.height / 2;
    const frame = { left: at(tl.left - 1.5, y), right: at(br.right + 1.5, y), top: at(x, tl.top - 1.5), bottom: at(x, br.bottom + 1.5) };
    return {
      frame: Object.fromEntries(Object.entries(frame).map(([k, c]) => [k, against(c) >= 3 || against(c)])),
      between: against(at(mid.left - 1.5, y)) < 1.2 || against(at(mid.left - 1.5, y)),
      ring: against(rgb(getComputedStyle(grid.children[0]).borderTopColor)) >= 3 || against(rgb(getComputedStyle(grid.children[0]).borderTopColor)),
    };
  }, png);
  assert.deepEqual(zone, { frame: { left: true, right: true, top: true, bottom: true }, between: true, ring: true }, `${colorScheme}: the strike zone on the grid, against the page`);
}
await page.emulateMedia({ colorScheme: 'light' });
await page.evaluate(() => scrollTo(0, 0));

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
  // Each view's caption says what the dots along each path are and what the dashed ring is.
  const said = await page.locator('#caption').textContent();
  assert.ok(said.includes('The dots along each path are the ball every 1/30 of a second: the farther apart, the faster.'), `${v}: ${said}`);
  assert.match(said, /The dashed ring marks the ball 0\.175 seconds from the plate, (about )?when (the|a) hitter has to decide/, `${v}: ${said}`);
}
// The hand is the pitcher's, and says so where it's picked; the chart says what arm side and glove side are.
assert.equal(await page.locator('#hand').evaluate(el => el.previousElementSibling?.textContent), 'Pitcher');
assert.match(await page.locator('#move-desc').textContent(), /Arm side is toward the pitcher’s throwing arm; glove side, the other way\./);

// From above, the label for the side up the screen stays clear of the speed in the top-left corner and of the legend
// in the top-right, for either hand, and with a second pitch's speed beside the first.
for (const pair of ['', 'CH']) {
  await page.locator('#pair').selectOption(pair);
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
  await page.evaluate(() => { window.topLabels = []; });
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
    assert.ok(apart(l, speed), `from above${pair ? ', two pitches' : ''}, "${l.text}" is drawn over the speed`);
    assert.ok(apart(l, legend), `from above${pair ? ', two pitches' : ''}, "${l.text}" is drawn under the legend`);
  }
  await page.locator('#view [data-v="catcher"]').click();
}
await page.locator('#pair').selectOption('');

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
// The speed over the picture is both pitches', and the caption says what throwing them together shows: how far apart
// they are where the hitter has to decide and at the plate, which gets there first, and whose the ghost is. A screen
// reader hears the gap with the times.
{
  const paired = await page.evaluate(() => ({ speed: document.getElementById('ro-mph').textContent, caption: document.getElementById('caption').textContent, heard: document.getElementById('landed').textContent }));
  assert.match(paired.speed, /^86\.3 · 94\.8$/, 'the speed over two pitches thrown together');
  assert.match(paired.caption, / When the hitter has to decide, the slider and the four-seam are (\d+ inches|an inch|less than an inch) apart; at the plate, (\d+ inches|\d ft( \d+ in)?)\. The four-seam gets there 0\.\d\d\u00a0s sooner\. The ghost is the slider’s\.$/, 'the caption for two pitches thrown together');
  assert.match(paired.heard, /^Slider 0\.\d\d seconds, Four-seam 0\.\d\d seconds\. When the hitter has to decide they’re (\d+ inches|an inch|less than an inch) apart; at the plate, (\d+ inches|\d (foot|feet)( \d+ inch(es)?)?)\.$/, 'what a screen reader hears for two pitches thrown together');
}
// On the light palette's pale sky each path has a dark halo, so the yellow line and the pale blue one stand off what's
// beside them at 3 to 1 (WCAG 2.2, SC 1.4.11); on the sky alone the blue was 1.1 to 1.3. From the side, halfway between
// two of the dots, out from each side of each line to just past its halo (with the ghost off, as it runs along the
// slider).
{
  await page.locator('#view [data-v="side"]').click();
  await page.locator('#ghost').uncheck();
  await page.locator('#throw').click();
  await arrived();
  const low = await page.evaluate(() => {
    const stage = window.arsenal.stage, cam = stage.camera(), ctx = document.getElementById('flight').getContext('2d');
    const lum = c => { const [R, G, B] = c.map(v => v / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * R + 0.7152 * G + 0.0722 * B; };
    const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
    const lw = Math.max(1.5, cam.W / cam.dpr / 520) * cam.dpr * 1.2, out = [];
    // Each throw is scattered at random, so now and then the other pitch's line, with its halo (lw + 2 CSS px wide), runs
    // right beside this one where it's looked at: that side is against the other line, not the sky, and is skipped.
    const reach = lw / 2 + cam.dpr + 1;
    let looked = 0;
    stage.flights.forEach((f, i) => {
      const color = i === 0 ? [0xff, 0xd2, 0x3f] : [0x7f, 0xd3, 0xff];
      const other = stage.flights[1 - i], path = [];
      if (other) for (let s = 0; s <= other.T; s += 0.001) path.push(cam.project(other.pos(s)));
      const byOther = (x, y) => path.some(q => Math.hypot(q.x - x, q.y - y) < reach);
      for (const t of [5.5 / 30, 8.5 / 30]) {
        const a = cam.project(f.pos(t - 0.005)), b = cam.project(f.pos(t + 0.005)), p = cam.project(f.pos(t));
        const len = Math.hypot(b.x - a.x, b.y - a.y), nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
        // Out from the middle of the line to a pixel past where its halo ends, the most it stands off anything there.
        for (const side of [1, -1]) {
          const probes = [];
          for (let d = lw / 2; d <= lw / 2 + 1.5 * cam.dpr; d += 0.5) probes.push([p.x + side * nx * d, p.y + side * ny * d]);
          if (probes.some(([x, y]) => byOther(x, y))) continue;
          looked++;
          let best = 0, at = null;
          for (const [x, y] of probes) {
            const px = [...ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data].slice(0, 3);
            if (ratio(color, px) > best) { best = ratio(color, px); at = px; }
          }
          if (best < 3) out.push(`${f.p.short} at ${t.toFixed(2)} s: ${best.toFixed(2)} to 1 against rgb(${at})`);
        }
      }
    });
    return { out, looked };
  });
  assert.deepEqual(low.out, [], 'the paths against what’s beside them on the light sky');
  assert.ok(low.looked >= 2, `only ${low.looked} of the 8 sides looked at were clear of the other line`);
  const halos = await page.evaluate(() => [...document.querySelectorAll('.readout, .legend')].map(el => getComputedStyle(el).textShadow.split(/,(?![^(]*\))/).length));
  assert.ok(halos.every(n => n >= 3), `the words over the pictures have a halo of ${halos.join(', ')} shadows`);
  await page.locator('#ghost').check();
  await page.locator('#view [data-v="catcher"]').click();
}

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

// Inches and mph keep their one decimal place everywhere, as the speed does: the sweeper moves "↑ 1.0 in" and its
// hardest thrower averaged 89.0 mph, the cutter "↑ 8.0 in", the splitter 11.0 inches to the arm side.
{
  const cards = await page.evaluate(() => Object.fromEntries(['ST', 'FC', 'FS', 'KC'].map(code => {
    window.arsenal.pick(code);
    const box = [...document.querySelectorAll('#c-stats > div')].find(d => d.querySelector('dt').textContent === 'Spin moves it');
    const dot = document.querySelector('.move-chart .dot.on');
    dot.dispatchEvent(new FocusEvent('focus'));
    const tip = document.getElementById('tip').textContent;
    dot.dispatchEvent(new FocusEvent('blur'));
    return [code, { moves: box.querySelector('dd').textContent.replace(/\s+/g, ' '), hardest: [...document.querySelectorAll('#c-facts li')].map(li => li.textContent).find(t => t.startsWith('Hardest')) || '', dot: dot.getAttribute('aria-label'), tip }];
  })));
  assert.match(cards.ST.moves, /↑ 1\.0 in/);
  assert.equal(cards.ST.hardest, 'Hardest on average: Max Meyer, 89.0 mph.');
  assert.match(cards.ST.dot, /: 1\.0 inches up, 13\.6 inches to the glove side$/);
  assert.match(cards.ST.tip, /1\.0 in up, 13\.6 in glove side/);
  assert.match(cards.FC.moves, /↑ 8\.0 in/);
  assert.match(cards.FS.moves, /arm side 11\.0 in/);
  assert.match(cards.KC.moves, /↓ 10\.0 in/);
  // And the movement is as big and dark as the card's other numbers, though its arrow is hidden from a screen reader.
  const look = await page.evaluate(() => [...document.querySelectorAll('#c-stats b')].map(b => { const shown = b.querySelector('[aria-hidden]') || b, cs = getComputedStyle(shown); return `${cs.fontSize} ${cs.color}`; }));
  assert.equal(new Set(look).size, 1, `the card's numbers: ${look.join(', ')}`);
  assert.equal(cards.KC.hardest, 'Hardest on average: Trevor Megill, 88.0 mph.');
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
    const text = box.querySelector('dd > span').firstChild, s = text.textContent;
    const top = (from, to) => { const r = document.createRange(); r.setStart(text, from); r.setEnd(text, to); return r.getBoundingClientRect().top; };
    const num = /[\d.]+(?=\s+in$)/.exec(s);
    return Math.abs(top(num.index, num.index + num[0].length) - top(s.length - 2, s.length)) > 2;
  }));
  assert.deepEqual(split, [], 'the unit wraps away from its number');
}

// The chart and the table pick pitches too.
assert.equal(await page.locator('.move-chart .dot').count(), 13);
assert.equal(await page.locator('.lineup tbody tr').count(), 13);
// The speed bars are the middle 80% of pitchers' average speeds, each counted by how many he threw, which is how
// tools/statcast.mjs works them out, not of single pitches; the card says "most pitchers" too.
assert.match(await page.locator('.lineup .hint').textContent(), /bar: middle 80% of pitchers, by pitches thrown\)/);
// The scale runs 70 to 100 mph, so the bars between 80 and 95 have room; the eephus sits off it at the left end, past a
// break, still labelled with its speed, and with no bar.
{
  const table = await page.evaluate(() => {
    const row = code => document.querySelector(`.lineup tbody tr[data-code="${code}"]`);
    const width = el => el.getBoundingClientRect().width;
    const ep = row('EP'), ff = row('FF');
    return {
      scale: [...document.querySelectorAll('.lineup .scale span')].map(s => s.textContent),
      eephus: { val: ep.querySelector('td:nth-child(3) .val').textContent, bars: ep.querySelectorAll('.range .span').length, breaks: ep.querySelectorAll('.range .break').length, atLeft: ep.querySelector('.range .avg').getBoundingClientRect().left - ep.querySelector('.range').getBoundingClientRect().left },
      dot: width(ff.querySelector('.range .avg')),
      // How much of the four-seamer's bar shows either side of its dot.
      shows: (width(ff.querySelector('.range .span')) - width(ff.querySelector('.range .avg'))) / 2,
    };
  });
  assert.deepEqual(table.scale, ['70', '80', '90', '100']);
  assert.deepEqual({ ...table.eephus, atLeft: table.eephus.atLeft < 2 }, { val: '45.3', bars: 0, breaks: 1, atLeft: true });
  assert.equal(table.dot, 8);
  assert.ok(table.shows >= 6, `the four-seamer's bar shows ${table.shows.toFixed(1)}px either side of its dot`);
}
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
// WCAG 2.2 asks that content shown on hover or focus can be dismissed and hovered (SC 1.4.13): Escape hides the tooltip,
// whether it came with focus or with the pointer, and it stays while the pointer moves from the dot onto it, going once
// the pointer has left both.
{
  const dot = page.locator('.move-chart .dot', { hasText: 'Splitter' });
  const tipShown = () => page.locator('#tip').isVisible();
  await dot.focus();
  assert.equal(await tipShown(), true, 'no tooltip for the dot with focus');
  await page.keyboard.press('Escape');
  assert.equal(await tipShown(), false, 'Escape left the tooltip open for the dot with focus');
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')?.split(':')[0]), 'Splitter', 'Escape moved focus');
  await dot.evaluate(g => g.blur());
  await dot.hover();
  assert.equal(await tipShown(), true, 'no tooltip for the dot under the pointer');
  await page.keyboard.press('Escape');
  assert.equal(await tipShown(), false, 'Escape left the tooltip open for the dot under the pointer');
  await page.mouse.move(0, 0);
  await dot.hover();
  const box = await page.locator('#tip').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
  await page.waitForTimeout(600);
  assert.equal(await tipShown(), true, 'the tooltip went as the pointer moved onto it');
  await page.mouse.move(2, 2, { steps: 4 });
  await page.waitForTimeout(600);
  assert.equal(await tipShown(), false, 'the tooltip stayed after the pointer left it');
}

// The spinning ball turns for as long as it's on screen, so a tap, a click or Enter stops it, and again starts it
// (WCAG 2.2, SC 2.2.2); the spin's words say so.
{
  const ball = page.locator('#spin');
  await ball.scrollIntoViewIfNeeded();
  const pose = () => ball.evaluate(c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let h = 0; for (let i = 0; i < d.length; i += 97) h = (h * 31 + d[i]) >>> 0; return h; });
  const said = () => page.locator('#c-spin').textContent();
  assert.equal(await ball.getAttribute('role'), 'button');
  assert.equal(await ball.getAttribute('aria-pressed'), 'false');
  assert.match(await said(), / Tap the ball to stop it\.$/);
  await ball.click();
  assert.equal(await ball.getAttribute('aria-pressed'), 'true', 'the ball isn’t marked stopped after a click');
  assert.match(await said(), / Tap the ball to spin it\.$/);
  const a = await pose();
  await page.waitForTimeout(400);
  assert.equal(await pose(), a, 'the stopped ball still turns');
  await ball.focus();
  await page.keyboard.press('Enter');
  assert.equal(await ball.getAttribute('aria-pressed'), 'false', 'Enter didn’t start the ball again');
  await page.waitForTimeout(400);
  assert.notEqual(await pose(), a, 'the ball didn’t start turning again');
  await page.evaluate(() => scrollTo(0, 0));
}
// Picked with the keyboard further down the page, from the table or with previous and next, the page goes up to the
// pitch and focus goes with it, to its name, rather than staying down the page out of sight.
// (Each starts once the page has stopped scrolling: Chromium can drop a smooth scroll begun while the page is still
// gliding from the last one and has just been jumped by a focus, which this isn't about.)
const settled = async () => { for (let y = -1, now; (now = await page.evaluate(() => scrollY)) !== y; y = now) await page.waitForTimeout(300); };
for (const [from, name] of [[page.locator('.lineup tbody tr', { hasText: 'Sweeper' }).locator('button'), /^Sweeper/i], [page.locator('#next'), /^Curveball/i]]) {
  await settled();
  await from.focus();
  await page.keyboard.press('Enter');
  assert.match(await heading(), name);
  const focus = () => page.evaluate(() => { const a = document.activeElement, r = a.getBoundingClientRect(); return { id: a.id || a.textContent, seen: r.top >= 0 && r.bottom <= innerHeight }; });
  let now;
  for (const end = Date.now() + 3000; !(now = await focus()).seen && Date.now() < end;) await page.waitForTimeout(100);
  assert.deepEqual(now, { id: 'c-name', seen: true }, `focus after picking ${name.source.slice(1)} with the keyboard`);
}

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
    how: 'Pick a pitch and a spot, then throw it. The hitter has to commit at the decision point (the dashed ring on each pitch’s path), DECIDE seconds from the plate, and a swing at a pitch out of the zone is a chase. Strikes are red (called, swinging or fouled), balls green, balls in play blue.',
    above: true, last: 'none',
  }, 'before the first pitch');
  // The pitches and the spots are each a group of radio buttons, one stop for Tab at the one checked, so Throw is a few
  // Tabs from the first pitch rather than thirty. Each pitch is read with its units, as its speed and share show.
  {
    const groups = await page.evaluate(() => ['ab-pitches', 'ab-spots'].map(id => {
      const box = document.getElementById(id), all = [...box.children];
      return { role: box.getAttribute('role'), radios: all.every(b => b.getAttribute('role') === 'radio'), stops: all.filter(b => b.tabIndex >= 0).map(b => b.getAttribute('aria-checked')) };
    }));
    assert.deepEqual(groups, [{ role: 'radiogroup', radios: true, stops: ['true'] }, { role: 'radiogroup', radios: true, stops: ['true'] }], 'the pitches and the spots as groups of radio buttons');
    const chip = await page.locator('#ab-pitches .ab-chip').first().evaluate(b => ({ said: b.getAttribute('aria-label'), shown: b.querySelector('small').textContent }));
    const [, mph, share] = /^Four-seam, (\d+) mph, (\d+%) of his pitches$/.exec(chip.said) || [];
    assert.equal(chip.shown, `${mph}\u00a0mph\u00a0· ${share}`, `a pitch read as "${chip.said}" shows "${chip.shown}"`);
    await page.locator('#ab-pitches .ab-chip').first().focus();
    let tabs = 0;
    for (; tabs < 30 && (await page.evaluate(() => document.activeElement.id)) !== 'ab-throw'; tabs++) await page.keyboard.press('Tab');
    assert.ok(tabs <= 3, `Throw is ${tabs} Tabs on from the first pitch`);
  }
  // The arrow keys pick as they go, and focus goes with them: along the pitches, round from the last to the first; on
  // the grid the way they point as it's drawn (turned round for a left-handed batter, below), stopping at its edges, and
  // Home and End go to the ends of the row. The call under the grid follows.
  const arrows = async (group, keys) => {
    await page.locator(`#${group} [aria-checked="true"]`).focus();
    const went = [];
    for (const key of keys) {
      await page.keyboard.press(key);
      went.push(await page.evaluate(group => {
        const a = document.activeElement, on = document.querySelectorAll(`#${group} [aria-checked="true"]`);
        const name = a.dataset.code ? a.textContent.trim().split(' ')[0] : a.getAttribute('aria-label');
        return on.length === 1 && on[0] === a && a.tabIndex === 0 ? name : `${name}, with ${on.length} checked`;
      }, group));
    }
    return went;
  };
  assert.deepEqual(await arrows('ab-pitches', ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'ArrowUp', 'Home', 'End']), ['Sinker', 'Slider', 'Sinker', 'Four-seam', 'Curve', 'Four-seam', 'Curve'], 'the arrow keys along the pitches');
  assert.deepEqual(await arrows('ab-spots', ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'Home', 'End']), ['in, at the belt', 'down the middle', 'up in the zone', 'high, above the zone', 'high, above the zone', 'high and off the plate inside', 'high and off the plate away'], 'the arrow keys on the grid, for a right-handed batter');
  assert.equal(await page.locator('#ab-choice').innerText(), 'Curve, high and off the plate away');
  // Picked with Enter, a pitch and a spot keep focus, and so does Throw while the ball flies (at Slow, so there's time to
  // look) and once it has landed.
  const focused = () => page.evaluate(() => {
    const a = document.activeElement;
    return { id: a.id, name: a.dataset.code ? a.textContent.trim().split(' ')[0] : a.getAttribute('aria-label') || a.textContent.trim().split(' ')[0], checked: a.getAttribute('aria-checked'), busy: window.arsenal.atBat.state.busy };
  });
  await page.locator('#ab-pitches .ab-chip', { hasText: 'Slider' }).focus();
  await page.keyboard.press('Enter');
  assert.deepEqual(await focused(), { id: '', name: 'Slider', checked: 'true', busy: false }, 'focus after picking a pitch with Enter');
  await page.locator('#ab-spots [aria-label="down and away"]').focus();
  await page.keyboard.press('Enter');
  assert.deepEqual(await focused(), { id: '', name: 'down and away', checked: 'true', busy: false }, 'focus after picking a spot with Enter');
  assert.equal(await page.locator('#ab-choice').innerText(), 'Slider, down and away');
  await page.locator('#ab-speed [data-v="0.25"]').click();
  await page.locator('#ab-throw').focus();
  await page.keyboard.press('Enter');
  assert.deepEqual(await focused(), { id: 'ab-throw', name: 'Throw', checked: null, busy: true }, 'focus while the pitch flies');
  await idle();
  assert.deepEqual(await focused(), { id: 'ab-throw', name: 'Throw', checked: null, busy: false }, 'focus once the pitch has landed');
  await page.locator('#ab-speed [data-v="1"]').click();
  assert.equal(await page.locator('#ab-log li').count(), 1);
  assert.ok((await page.locator('#ab-last .res').innerText()).length > 2, 'no result shown for the first pitch');
  const model = () => page.evaluate(() => { const ab = window.arsenal.atBat.state.ab; return { balls: ab.balls, strikes: ab.strikes, n: ab.pitches.length, result: ab.result, marks: window.arsenal.atBat.stage.opts.marks.length }; });
  let m = await model();
  if (!m.result) assert.equal((await page.locator('#ab-count .ct').innerText()), `${m.balls}-${m.strikes}`);
  for (let i = 0; i < 20 && !(await model()).result; i++) {
    // The hundred throws, from the count as it stands: never a count past the end, like 4-1 or 2-3.
    await page.locator('#ab-run').click();
    assert.match(await page.locator('#ab-chart > h3').textContent(), /^League-average righty, .+, in a [0-3]-[0-2] count(, right after the [a-z -]+)?: what happens per 100 throws of each pitch \(400 thrown\)\.$/);
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
  // How it ended is a heading, so a screen reader can jump to it once the call box (and its headings) are gone, and it
  // looks as it did.
  assert.deepEqual(await page.locator('#ab-result').evaluate(e => [e.tagName, getComputedStyle(e).fontSize]), ['H3', '30px']);
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
  // Over the call box it says what this is, and that's all it says for a link that played as it was.
  assert.equal(await page.locator('#ab-notice').textContent(), `A shared at-bat: the league-average righty to a right-handed batter, ${m.n} pitches.`, 'the notice over a link that played as it was');
  // A link asking for what can't be done still opens, and says so over the call box, or over the end card, after what
  // it is.
  for (const [hash, shared, said] of [
    ['#ab.nobody.R.1p.SL6', 'the league-average righty to a right-handed batter, 1 pitch', 'There’s no pitcher called “nobody” here, so this is the league-average righty.'],
    ['#ab.average.R.1p.FF6.SL23.CH16.FF3.SL24.CU22.FF6.FF6.FF6', 'the league-average righty to a right-handed batter, 6 pitches', 'The link had 3 more pitches after the at-bat ended; they were left out.'],
    ['#ab.rogers.R.9.SI16.FF3.SI2', 'Tyler Rogers to a right-handed batter, 1 pitch', 'Tyler Rogers doesn’t throw a four-seamer, so the link’s last 2 pitches were left out.'],
    ['#ab.average.R.9.FF6.SL40', 'the league-average righty to a right-handed batter, 1 pitch', 'The link’s pitch 2 is called to a spot that isn’t on the grid, so that pitch was left out.'],
    // A link from a message with a full stop or a bracket on the end, and one cut off partway through a pitch: what can
    // be read is played. (Skenes's first pitch here is put in play.)
    ['#ab.skenes.L.k3x9a.FF6.ST23.', 'Paul Skenes to a left-handed batter, 1 pitch', 'The link had one more pitch after the at-bat ended; it was left out.'],
    ['#ab.skenes.L.k3x9a.FF6.ST23)', 'Paul Skenes to a left-handed batter, 1 pitch', 'The link had one more pitch after the at-bat ended; it was left out.'],
    ['#ab.skenes.L.k3x9a.FF6.S', 'Paul Skenes to a left-handed batter, 1 pitch', 'The rest of the link couldn’t be read, so it was left out.'],
    ['#ab.average.R.1p.FF6.SL23.CH16.FF3.SL24.C', 'the league-average righty to a right-handed batter, 5 pitches', 'The rest of the link couldn’t be read, so it was left out.'],
  ]) {
    await page.goto('about:blank');
    await page.goto(base + hash);
    await idle();
    assert.equal(await page.locator('#ab-notice').textContent(), `A shared at-bat: ${shared}. ${said}`, hash);
    assert.equal(await page.locator('#ab-notice').isVisible(), true, `${hash}: the notice is hidden`);
  }
  // Where the at-bat is, and what it says over it, once the address changes. A link opened in a new tab or changed in
  // this one goes to the at-bat, at the top of the screen (12px down, its scroll margin).
  const opened = () => page.evaluate(() => ({ hash: location.hash, top: Math.round(document.getElementById('at-bat').getBoundingClientRect().top), notice: document.getElementById('ab-notice').textContent, n: window.arsenal.atBat.state.ab.pitches.length, pitcher: window.arsenal.atBat.state.pitcher.key }));
  const change = hash => page.evaluate(h => new Promise(resolve => { addEventListener('hashchange', () => setTimeout(resolve, 50), { once: true }); location.hash = h; }), hash);
  // With a full stop on the end, it's the README's strikeout, all of it, and the address drops the full stop.
  await page.goto('about:blank');
  await page.goto(base + '#ab.average.R.1p.FF6.SL23.CH16.FF3.SL24.CU22.');
  await idle();
  assert.deepEqual(await opened(), { hash: '#ab.average.R.1p.FF6.SL23.CH16.FF3.SL24.CU22', top: 12, notice: 'A shared at-bat: the league-average righty to a right-handed batter, 6 pitches.', n: 6, pitcher: 'average' }, 'a link with a full stop on the end');
  // Cut off before its seed, there's nothing to replay: a new at-bat, which says why, and the address is its own.
  await page.goto('about:blank');
  await page.goto(base + '#ab.skenes');
  await idle();
  const garbled = 'This at-bat link is cut off or garbled, so here’s a new at-bat.';
  let o = await opened();
  assert.deepEqual({ ...o, hash: /^#ab\.average\.R\.[0-9a-z]+$/.test(o.hash) }, { hash: true, top: 12, notice: garbled, n: 0, pitcher: 'average' }, 'a link cut off before its seed');
  assert.equal(await page.locator('#ab-notice').isVisible(), true, 'the notice over a garbled link is hidden');
  // The same in a tab already open, from the explorer at the top: changed to a link cut off partway, it replays what it
  // can; changed to a garbled one, the pitcher and batter stay, against a new hitter.
  await page.evaluate(() => scrollTo(0, 0));
  await change('#ab.skenes.L.k3x9a.FF6.S');
  await idle();
  assert.deepEqual(await opened(), { hash: '#ab.skenes.L.k3x9a.FF6', top: 12, notice: 'A shared at-bat: Paul Skenes to a left-handed batter, 1 pitch. The rest of the link couldn’t be read, so it was left out.', n: 1, pitcher: 'skenes' }, 'the address changed to a link cut off partway');
  await page.evaluate(() => scrollTo(0, 0));
  await change('#ab.skenes.X.k3x9a.FF6');
  await idle();
  o = await opened();
  assert.deepEqual({ ...o, hash: /^#ab\.skenes\.L\.[0-9a-z]+$/.test(o.hash) && o.hash !== '#ab.skenes.L.k3x9a' }, { hash: true, top: 12, notice: garbled, n: 0, pitcher: 'skenes' }, 'the address changed to a garbled link');
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
  assert.match(await page.locator('#ab-chart > h3').textContent(), new RegExp(`^On that ${endedOn} pitch, called .+, instead of the [a-z -]+: what happens per 100 throws of each pitch \\(400 thrown\\)\\.$`));
  assert.equal(await page.locator('#ab-chart .hundred-bars li').count(), await page.evaluate(() => window.arsenal.atBat.state.pitcher.pitches.length));
  // Another pitcher, and a left-handed batter: the grid turns round so his inside is on the right.
  await page.locator('#ab-next').click();
  assert.equal(await page.locator('#ab-run').textContent(), 'Throw each of his pitches 400 times from here');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'ab-throw', 'focus after Next hitter');
  await page.locator('#ab-pitcher').selectOption('rogers');
  assert.equal(await page.locator('#ab-pitches .ab-chip').count(), 2);
  assert.equal(await page.locator('#ab-live').textContent(), 'New at-bat: Tyler Rogers to a right-handed batter.');
  // His name set apart from his line, which has a colon of its own.
  assert.equal(await page.locator('#ab-line').textContent(), 'Tyler Rogers. A submariner: an 83 mph sinker from below the knees.');
  assert.equal(await page.locator('#ab-line b').textContent(), 'Tyler Rogers.');
  // The list says what each real pitcher is, after his name, so it tells them apart, and the lefties, before picking.
  assert.deepEqual(await page.locator('#ab-pitcher option').allTextContents(), [
    'League-average righty', 'Paul Skenes – six pitches', 'Jacob Misiorowski – power arm', 'Kevin Gausman – splitter',
    'Cristopher Sánchez – lefty', 'Chris Sale – lefty, big slider', 'Aaron Nola – knuckle curve',
    'Mason Miller – closer, slider', 'Tyler Rogers – submariner', 'Matt Waldron – knuckleball',
  ], 'the pitcher list');
  assert.equal(await page.locator('#ab-spots button').first().getAttribute('aria-label'), 'high and off the plate inside');
  await page.locator('#ab-batter [data-v="L"]').click();
  assert.equal(await page.locator('#ab-spots button').first().getAttribute('aria-label'), 'high and off the plate away');
  // A new pitcher or batter starts a new at-bat, and a screen reader hears who's up.
  assert.equal(await page.locator('#ab-live').textContent(), 'New at-bat: Tyler Rogers to a left-handed batter.');
  // Turned round, the grid's arrow keys still go the way they point: right is toward a left-handed batter's inside.
  assert.deepEqual(await arrows('ab-spots', ['ArrowDown', 'ArrowRight', 'ArrowRight']), ['in the dirt and in', 'in the dirt and off the plate inside', 'in the dirt and off the plate inside'], 'the arrow keys on the grid, for a left-handed batter');
  // The new pitcher's pitches and the turned grid pick too.
  await page.locator('#ab-pitches .ab-chip').last().click();
  await page.locator('#ab-spots [aria-label="down and away"]').click();
  assert.match(await page.locator('#ab-choice').innerText(), /^\w+, down and away$/);
  assert.equal(await page.locator('#ab-spots [aria-checked="true"]').getAttribute('aria-label'), 'down and away');
  await page.locator('#ab-throw').click();
  await idle();
  assert.equal(await page.locator('#ab-log li').count(), 1);
  // Nothing in it scrolls sideways on the narrowest phones.
  for (const width of [320, 360]) {
    await page.setViewportSize({ width, height: 740 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `the page scrolls sideways at ${width}px`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  // Another batter or pitcher is a new hitter: switching away and back doesn't bring back the one just faced, guessing
  // the same pitches. (A link still replays its own hitter: the README strikeout below.)
  {
    const seed = () => page.evaluate(() => window.arsenal.atBat.state.seed);
    const seeds = [await seed()];
    await page.locator('#ab-batter [data-v="R"]').click();
    await page.locator('#ab-batter [data-v="L"]').click();
    seeds.push(await seed());
    await page.locator('#ab-pitcher').selectOption('sale');
    await page.locator('#ab-pitcher').selectOption('rogers');
    seeds.push(await seed());
    assert.equal(new Set(seeds).size, 3, `the same hitter came back after switching the batter or the pitcher and back: ${seeds.join(', ')}`);
  }
  assert.deepEqual(problems.slice(before), [], 'problems while pitching to a hitter');
}

// "What would a catcher call?" gives a typical call for the count, and then what big leaguers did in that count in 2026,
// from the numbers the hitter is tuned to (js/league.js). Asked again in the same count it calls another. Picking a
// pitch or a spot by hand clears it, and a new pitcher partway through an at-bat says so in its place, where everyone
// can see the count, the marks and the log were cleared.
{
  const before = problems.length;
  await page.goto('about:blank');
  await page.goto(base + '#ab.average.R.1p');
  await page.waitForFunction(() => !window.arsenal.atBat.state.busy, null, { timeout: 15000 });
  const hint = () => page.locator('#ab-hint').textContent();
  const asked = [];
  for (let i = 0; i < 5; i++) { await page.locator('#ab-suggest').click(); asked.push(await hint()); }
  const { counts, choice } = await page.evaluate(async () => ({ counts: (await import(new URL('js/league.js', location.href))).COUNTS, choice: document.getElementById('ab-choice').textContent }));
  const k = counts['0-0'], pc = v => `${Math.round(v * 100)}%`;
  const said = `In 0-0 counts in 2026, ${pc(k.fastball)} of pitches were fastballs and ${pc(k.zone)} were in the zone; hitters swung at ${pc(k.swing)}.`;
  for (const a of asked) assert.ok(a.startsWith('A typical call in a 0-0 count: ') && a.endsWith(` ${said}`), `the catcher's call: ${a}`);
  assert.ok(asked.every((a, i) => i === 0 || a !== asked[i - 1]), `asked again in the same count, the catcher called the same pitch: ${asked.join(' | ')}`);
  assert.equal(await page.locator('#ab-live').textContent(), asked.at(-1), 'a screen reader does not hear the catcher\'s call');
  // The call is picked, and it's the one he named.
  const named = /count: (.+)\. In /.exec(asked.at(-1))[1];
  assert.equal(choice.split(', ').slice(1).join(', '), named.split(', ').slice(1).join(', '), `the catcher called "${named}" and "${choice}" was picked`);
  await page.locator('#ab-pitches .ab-chip').last().click();
  assert.equal(await hint(), '', 'the catcher\'s call is still under Throw after picking a pitch by hand');
  await page.locator('#ab-suggest').click();
  await page.locator('#ab-spots [aria-label="down the middle"]').click();
  assert.equal(await hint(), '', 'the catcher\'s call is still under Throw after picking a spot by hand');
  // Another pitcher before the first pitch is just who's pitching; after it, the at-bat that was going is gone.
  await page.locator('#ab-pitcher').selectOption('sale');
  assert.equal(await hint(), '', 'a new pitcher before the first pitch said so under Throw');
  await page.evaluate(() => window.arsenal.atBat.throw('FF', '00'));
  await page.waitForFunction(() => !window.arsenal.atBat.state.busy, null, { timeout: 15000 });
  await page.locator('#ab-pitcher').selectOption('skenes');
  assert.equal(await hint(), 'New at-bat: Paul Skenes to a right-handed batter.', 'a new pitcher partway through an at-bat');
  assert.equal(await page.locator('#ab-live').textContent(), 'New at-bat: Paul Skenes to a right-handed batter.');
  assert.deepEqual(problems.slice(before), [], 'problems asking the catcher');
}

// A screen reader hears a line of its own for each pitch as it lands: which pitch, the spot called and where it crossed
// (as in the log), what happened and the count, then why. Three fouls down the middle are three different lines, two of them in the same count, where it used to
// hear "Foul. The count is 0 and 2." twice.
{
  await page.goto('about:blank');
  await page.goto(base + '#ab.average.R.2');
  await page.waitForFunction(() => !window.arsenal.atBat.state.busy, null, { timeout: 15000 });
  const heard = [];
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.arsenal.atBat.throw('FF', '00'));
    await page.waitForFunction(() => !window.arsenal.atBat.state.busy, null, { timeout: 15000 });
    heard.push(await page.evaluate(() => ({ live: document.getElementById('ab-live').textContent, why: document.querySelector('#ab-last p:last-child').textContent })));
  }
  assert.deepEqual(heard.map(h => h.live.replace(` ${h.why}`, '')), ['Pitch 1, four-seamer, called down the middle, crossed down in the zone: foul. 0 and 1.', 'Pitch 2, four-seamer, called down the middle, crossed away, at the belt: foul. 0 and 2.', 'Pitch 3, four-seamer, called down the middle, crossed up and in: foul. 0 and 2.'], 'what a screen reader hears for three fouls');
  assert.ok(heard.every(h => h.why.length > 20 && h.live.endsWith(` ${h.why}`)), `the why isn't heard: ${heard.map(h => h.live).join(' | ')}`);
  assert.equal(new Set(heard.map(h => h.live)).size, 3, 'a screen reader heard the same line twice');
  assert.equal(await page.locator('#ab-count .sr').textContent(), '0 balls, 2 strikes');
}

// The readout's tag over the at-bat's picture: its words, its kind (strike, ball or play), its fill, and how its white
// words stand off the fill.
const tagged = p => p.evaluate(() => {
  const tag = document.querySelector('#ab-ro .tag');
  if (!tag) return null;
  const cs = getComputedStyle(tag), rgb = c => c.match(/[\d.]+/g).slice(0, 3).map(Number);
  const lum = c => { const [R, G, B] = c.map(v => v / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * R + 0.7152 * G + 0.0722 * B; };
  const [hi, lo] = [lum(rgb(cs.color)), lum(rgb(cs.backgroundColor))].sort((x, y) => y - x);
  return { words: tag.textContent, kind: tag.className.replace('tag k-', ''), fill: cs.backgroundColor, ratio: Math.floor(((hi + 0.05) / (lo + 0.05)) * 10) / 10 };
});

// The at-bat's lines that a dot separates: no line starts with the dot (a no-break space before it keeps it on the line
// before). Gives each line that does, for the message.
const dotStarts = p => p.evaluate(() => {
  const out = [], rect = (n, i) => { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1); return r.getClientRects()[0]; };
  for (const el of document.querySelectorAll('#ab-log li, #ab-pitches .ab-chip, #ab-chart .sum, #ab-ro')) {
    const chars = [], walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n; (n = walker.nextNode());) if (!n.parentElement.closest('.sr')) for (let i = 0; i < n.data.length; i++) chars.push([n, i]);
    chars.forEach(([n, i], k) => {
      if (n.data[i] !== '·') return;
      let j = k - 1;
      while (j >= 0 && /\s/.test(chars[j][0].data[chars[j][1]])) j--;
      const before = j >= 0 && rect(...chars[j]), dot = rect(n, i);
      if (before && dot && dot.top >= before.bottom - 2) out.push(el.innerText.replace(/\n/g, ' / '));
    });
  }
  return out;
});

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
  assert.equal(await ph.locator('#ab-ro').textContent(), 'Called strike\u00a0· 94.8\u00a0mph four-seamer', `${at}, the readout doesn't say what the pitch did`);
  // The pitch's name is kept whole where the line wraps: "four-seamer", not "four-" over "seamer".
  assert.equal(await ph.evaluate(() => document.querySelector('#ab-ro .nw').getClientRects().length), 1, `${at}, the pitch's name in the readout is split over two lines`);
  const tag = await tagged(ph);
  assert.deepEqual(tag && { words: tag.words, kind: tag.kind, readable: tag.ratio >= 4.5 }, { words: 'Called strike', kind: 'strike', readable: true }, `${at}, the readout's tag: ${JSON.stringify(tag)}`);

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

  // A link: while its last pitch is thrown again, the count and the log are from before it. A screen reader isn't told
  // what the pitch before it did, out of the blue: it hears what this is, and the count is read as words.
  await ph.goto('about:blank');
  await ph.goto(base + STRIKEOUT);
  const replay = await ph.evaluate(() => {
    const { busy, ab } = window.arsenal.atBat.state, last = ab.pitches.at(-1);
    return {
      busy, count: document.querySelector('#ab-count .ct').textContent, log: document.querySelectorAll('#ab-log li').length,
      ro: document.getElementById('ab-ro').textContent, asked: window.askNow(),
      heard: { live: document.getElementById('ab-live').textContent, notice: document.getElementById('ab-notice').textContent },
      count2: { said: document.querySelector('#ab-count .sr').textContent, hidden: [...document.querySelectorAll('#ab-count .ct, #ab-count .dots')].every(e => e.getAttribute('aria-hidden') === 'true') },
      want: { count: `${last.before.balls}-${last.before.strikes}`, log: ab.pitches.length - 1, ro: `Pitch ${last.n} · ${last.mph.toFixed(1)} mph` },
    };
  });
  assert.ok(replay.busy, `${at}, the link's last pitch had landed before it could be checked`);
  assert.deepEqual(replay.heard, { live: '', notice: 'A shared at-bat: the league-average righty to a right-handed batter, 6 pitches.' }, `${at}, what a screen reader is told as a link opens`);
  assert.deepEqual(replay.count2, { said: '2 balls, 2 strikes', hidden: true }, `${at}, the count as a screen reader reads it`);
  assert.deepEqual(replay.want, { count: '2-2', log: 5, ro: 'Pitch 6 · 80.3 mph' }, 'the README strikeout plays differently now');
  assert.deepEqual({ count: replay.count, log: replay.log }, { count: '2-2', log: 5 }, `${at}, while the link's last pitch flies`);
  assert.equal(replay.ro, 'Pitch 6\u00a0· 80.3\u00a0mph curveball', `${at}, while the link's last pitch flies`);
  assert.deepEqual(replay.asked, { waits: ['true', 'true'], hint: '', chart: 0 }, `${at}, asked while the link's last pitch flies`);
  await idle();
  assert.equal(await ph.locator('#ab-ro').textContent(), `${await ph.locator('#ab-result').textContent()}\u00a0· 6 pitches`);
  // "mph" stays with its number (a no-break space) when a log line wraps on a phone.
  assert.equal((await ph.locator('#ab-log').textContent()).match(/\d\u00a0mph/g)?.length, 6, `${at}, the log's speeds can wrap before "mph"`);
  // Each pitch in the log starts with the count it was thrown in, as on a broadcast's pitch list, "on 0-1" to a screen
  // reader, on the same line as what happened.
  const counted = await ph.evaluate(() => [...document.querySelectorAll('#ab-log li')].map((li, i) => {
    const at = li.querySelector('.at'), b = li.querySelector('b'), p = window.arsenal.atBat.state.ab.pitches[i];
    const want = `on ${p.before.balls}-${p.before.strikes}`;
    return at?.textContent === want && Math.abs(at.getBoundingClientRect().top - b.getBoundingClientRect().top) < 2 ? want : `${i + 1}: ${at?.textContent} (${want})`;
  }));
  assert.deepEqual(counted, ['on 0-0', 'on 0-1', 'on 1-1', 'on 1-2', 'on 1-2', 'on 2-2'], `${at}, the count on each pitch in the log`);
  // Once it's over, the count gives way to the scorebook's mark and the count it ended on, and that's what a screen
  // reader hears too, not a count of 2 and 2 after strike three. A strikeout looking is a backwards K; a walk is BB.
  const ending = () => ph.evaluate(() => {
    const ct = document.querySelector('#ab-count .ct');
    // What's heard is how it ended, then the scout's note (here NOTE).
    const note = document.getElementById('ab-note').textContent;
    return { mark: ct.textContent, label: ct.getAttribute('aria-label'), flipped: getComputedStyle(ct).transform === 'matrix(-1, 0, 0, 1, 0, 0)', on: document.querySelector('#ab-count .on')?.textContent, heard: note.length > 20 && document.getElementById('ab-live').textContent.replace(note, 'NOTE') };
  });
  assert.deepEqual(await ending(), { mark: 'K', label: 'Strikeout swinging', flipped: false, on: 'on a 2-2 pitch', heard: 'Strikeout swinging on a 2-2 pitch. NOTE' }, `${at}, at the end of the strikeout`);
  for (const [link, want] of [
    ['#ab.average.R.2.FF8.FF6.SL16.FF7.CU13', { mark: 'K', label: 'Strikeout looking', flipped: true, on: 'on a 1-2 pitch', heard: 'Strikeout looking on a 1-2 pitch. NOTE' }],
    ['#ab.average.R.3a.FF8.FF6.SL16.FF7', { mark: 'BB', label: 'Walk', flipped: false, on: 'on a 3-0 pitch', heard: 'Walk on a 3-0 pitch. NOTE' }],
  ]) {
    await ph.goto('about:blank');
    await ph.goto(base + link);
    await idle();
    assert.deepEqual(await ending(), want, `${at}, at the end of ${link}`);
  }
  // A log line that wraps keeps each dot at the end of a line, never at the start of the next: here the strikeout's
  // last line runs to three lines at 320px, and pitch 2's to two at 390px.
  await ph.goto('about:blank');
  await ph.goto(base + '#ab.average.R.1nwgaeb.SI6.CU24.SL22.FF2.CH16');
  await idle();
  assert.deepEqual(await dotStarts(ph), [], `${at}, a line in the log starts with its dot`);
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
  // has only the outcomes that happened, so they all start at the same place. Each pitch is thrown 400 times, a slice a
  // frame, and shown per 100: the button waits while they're thrown, and once they're in, each bar's pieces add up to
  // 100, the line under it says what matters with two strikes, and a screen reader hears the caption.
  assert.equal(await ph.locator('#ab-run').textContent(), 'What else could he have thrown on that 2-2 pitch?');
  await ph.evaluate(() => scrollBy(0, document.getElementById('ab-run').getBoundingClientRect().bottom - (innerHeight - 20)));
  // What the button and the bars say as the chart appears, before its next frame.
  await ph.evaluate(() => {
    const watch = new MutationObserver(() => {
      const bars = document.querySelector('.hundred-bars');
      if (!bars) return;
      window.filling = { waits: document.getElementById('ab-run').getAttribute('aria-disabled'), busy: bars.getAttribute('aria-busy') };
      watch.disconnect();
    });
    watch.observe(document.getElementById('ab-chart'), { childList: true });
  });
  await ph.locator('#ab-run').tap();
  const filling = await ph.evaluate(() => window.filling);
  await ph.waitForFunction(() => !document.querySelector('.hundred-bars').hasAttribute('aria-busy'));
  for (let y = -1, now; (now = await ph.evaluate(() => scrollY)) !== y; y = now) await ph.waitForTimeout(250);
  const hundred = await ph.evaluate(() => {
    const c = document.getElementById('ab-chart'), r = c.getBoundingClientRect(), f = document.getElementById('ab-flight').getBoundingClientRect();
    const bars = [...c.querySelectorAll('.bar')];
    return {
      waits: document.getElementById('ab-run').getAttribute('aria-disabled'),
      heading: c.querySelector('h3').textContent, heard: document.getElementById('ab-live').textContent,
      said: [...c.querySelectorAll('p')].map(p => p.textContent), below: r.top >= f.bottom - 1, onScreen: r.top < innerHeight - 150,
      empty: [...c.querySelectorAll('.sg')].filter(s => !(parseFloat(s.style.flexGrow) > 0)).length,
      starts: new Set(bars.map(b => Math.round(b.firstElementChild.getBoundingClientRect().left))).size,
      hundreds: bars.filter(b => [...b.children].reduce((n, s) => n + parseFloat(s.style.flexGrow), 0) !== 100).length,
      // Its number printed in each piece with 8 or more, and only those.
      numbered: [...c.querySelectorAll('.sg')].filter(s => (s.textContent === '') !== (parseFloat(s.style.flexGrow) < 8) || (s.textContent && s.textContent !== s.style.flexGrow)).length,
      sums: [...c.querySelectorAll('.sum')].map(s => s.textContent).filter(t => !/^\d+ strikeouts?\u00a0· \d+ hits?$/.test(t)),
      labels: bars.map(b => b.getAttribute('aria-label')).filter(l => !/^(\d+ (swinging strikes?|called strikes?|fouls?|outs? in play|balls?|hit batters?|hits?)(, |$))+$/.test(l) || /\b0 /.test(l)),
    };
  });
  assert.deepEqual(filling, { waits: 'true', busy: 'true' }, `${at}, while the hundred throws are thrown`);
  const caption = 'On that 2-2 pitch, called in the dirt, instead of the curveball: what happens per 100 throws of each pitch (400 thrown).';
  assert.deepEqual(hundred, {
    waits: 'false', heading: caption, heard: caption, said: ["Blues went the pitcher’s way, oranges the hitter’s."],
    below: true, onScreen: true, empty: 0, starts: 1, hundreds: 0, numbered: 0, sums: [], labels: [],
  }, `${at}, the hundred throws at the end of the strikeout`);
  // The numbers in the pieces read at 4.5 to 1 on their colour, in either palette, and the palest pieces' edges stand
  // off the card at 3 to 1 (WCAG 2.2, SC 1.4.3 and 1.4.11).
  for (const colorScheme of ['light', 'dark']) {
    await ph.emulateMedia({ colorScheme });
    const low = await ph.evaluate(() => {
      const rgb = c => { const m = c.match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/); return m ? m.slice(1, 4).map(v => Number(v) * 255) : c.match(/[\d.]+/g).slice(0, 3).map(Number); };
      const lum = c => { const [R, G, B] = c.map(v => v / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * R + 0.7152 * G + 0.0722 * B; };
      const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
      const card = rgb(getComputedStyle(document.querySelector('.bat-call')).backgroundColor), low = [];
      for (const k of ['whiff', 'called', 'foul', 'out', 'ball', 'hit']) {
        const cs = getComputedStyle(document.querySelector(`#ab-chart .legend-row .sg-${k}`)), fill = rgb(cs.backgroundColor);
        const text = ratio(rgb(cs.color), fill), edge = cs.boxShadow === 'none' || /transparent|rgba\(0, 0, 0, 0\)/.test(cs.boxShadow) ? fill : rgb(cs.boxShadow);
        if (text < 4.5) low.push(`${k}: its number at ${text.toFixed(2)}`);
        if (ratio(edge, card) < 3) low.push(`${k}: ${ratio(edge, card).toFixed(2)} against the card`);
      }
      return low;
    });
    assert.deepEqual(low, [], `${at}, ${colorScheme}: the hundred throws' colours`);
  }
  await ph.emulateMedia({ colorScheme: 'light' });
  // Every word on the page, the at-bat's included, uses a typographic apostrophe.
  assert.deepEqual(await ph.evaluate(() => document.body.innerText.match(/\w'\w/g)), null, `${at}, straight apostrophes on the page`);
  assert.deepEqual(await dotStarts(ph), [], `${at}, a line in the hundred throws, the log or the readout starts with its dot`);

  // The next hitter starts clean: no readout left from the last one.
  // Scrolled so the end card is behind the picture, it's still there to tap; the pitch controls come back below it.
  await ph.evaluate(() => scrollBy(0, document.getElementById('ab-end').getBoundingClientRect().top - 60));
  await ph.locator('#ab-next').tap();
  const back = await ph.evaluate(() => ({ picture: document.getElementById('ab-flight').getBoundingClientRect().bottom, controls: document.getElementById('ab-callbox').getBoundingClientRect().top }));
  assert.ok(back.controls >= back.picture && back.controls < height - 100, `${at}, after Next hitter the pitch controls start at ${Math.round(back.controls)}px, under a picture ending at ${Math.round(back.picture)}px`);
  assert.equal(await ph.locator('#ab-ro').textContent(), '', `${at}, the readout still describes the last at-bat`);
  assert.equal(await ph.locator('#ab-count .ct').textContent(), '0-0');
  assert.deepEqual(await dotStarts(ph), [], `${at}, a pitch's speed and share start a line with their dot`);
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

// Phones, short and narrow: an iPhone 14 with Safari's bars tucked away (390x750), and the narrowest phones.
for (const [width, height] of [[390, 750], [360, 640], [320, 640]]) {
  const narrowCtx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const ph = await narrowCtx.newPage();
  watch(ph);
  const at = `at ${width}x${height}`;
  await ph.goto(base + '#ab.nola.R.1');
  await ph.evaluate(() => document.fonts.ready);
  // The call fits under the picture that stays at the top of the screen, from the first pitch to Throw, for every
  // pitcher, even Skenes's six pitches, on an iPhone 14 once Safari has tucked its bars away. The grid is still named
  // "Where" to a screen reader, with what its frame means.
  if (width === 390) {
    const short = await ph.evaluate(async () => {
      const out = [];
      for (const key of [...document.getElementById('ab-pitcher').options].map(o => o.value)) {
        const list = document.getElementById('ab-pitcher');
        list.value = key;
        list.dispatchEvent(new Event('change'));
        // A pitch brought into view stops under the picture (its scroll margin), as a thumb would scroll it.
        const first = document.querySelector('#ab-pitches .ab-chip');
        first.scrollIntoView({ block: 'start' });
        await new Promise(r => requestAnimationFrame(r));
        const picture = document.getElementById('ab-flight').parentElement.getBoundingClientRect().bottom + 12, top = first.getBoundingClientRect().top;
        const bottom = document.getElementById('ab-throw').getBoundingClientRect().bottom;
        if (top < picture - 0.5 || bottom > innerHeight) out.push(`${key}: the first pitch at ${Math.round(top)}px under a picture to ${Math.round(picture)}px, Throw down to ${Math.round(bottom)}px of ${innerHeight}`);
      }
      return out;
    });
    assert.deepEqual(short, [], `${at}, the call doesn't fit under the picture`);
    assert.equal(await ph.getByRole('radiogroup', { name: 'Where' }).getAttribute('aria-describedby'), 'ab-side ab-key', `${at}, the grid's name and description`);
    await ph.locator('#ab-pitcher').selectOption('nola');
  }
  // The pitches' chips are all one height, Aaron Nola's "Knuckle curve" kept to one line, on the narrowest phones too.
  const chips = await ph.evaluate(() => {
    const all = [...document.querySelectorAll('#ab-pitches .ab-chip')], kc = all[0].childNodes[1], r = document.createRange();
    r.selectNodeContents(kc);
    return { heights: [...new Set(all.map(c => Math.round(c.getBoundingClientRect().height)))], name: kc.textContent.trim(), lines: [...r.getClientRects()].filter(x => x.width > 1).length };
  });
  assert.deepEqual(chips, { heights: [48], name: 'Knuckle curve', lines: 1 }, `${at}, Nola's pitches`);
  // The lists are in 16px words, which an iPhone doesn't zoom into when they're tapped.
  assert.deepEqual(await ph.evaluate(() => ['pair', 'ab-pitcher'].map(id => getComputedStyle(document.getElementById(id)).fontSize)), ['16px', '16px'], `${at}, the lists' words`);
  // Everything to tap reaches 44px tall: a tap at the top and the bottom of that is its own, not a neighbour's. Then the
  // same at the end of an at-bat, with Next hitter, Copy link and the hundred throws' button.
  const reach = () => ph.evaluate(() => {
    const short = [];
    for (const el of document.querySelectorAll('#throw, #view button, #speed button, #hand button, .picker .chip, #ab-throw, #ab-suggest, #ab-batter button, #ab-speed button, #ab-run, #ab-next, #ab-copy')) {
      if (!el.offsetParent) continue;
      el.scrollIntoView({ block: 'center', inline: 'center' });
      const r = el.getBoundingClientRect(), x = r.left + r.width / 2, mid = r.top + r.height / 2;
      const miss = [mid - 21.5, mid + 21.5].map(y => document.elementFromPoint(x, y)).filter(hit => !el.contains(hit));
      if (miss.length) short.push(`${el.id || el.textContent}: ${miss.map(hit => hit?.id || hit?.textContent.slice(0, 20)).join(', ')}`);
    }
    return short;
  });
  if (width === 390 || width === 320) assert.deepEqual(await reach(), [], `${at}, taps 22px above or below the middle of these go elsewhere`);
  await ph.goto('about:blank');
  await ph.goto(base + STRIKEOUT);
  await ph.waitForFunction(() => !window.arsenal.atBat.state.busy, null, { timeout: 15000 });
  if (width === 390 || width === 320) assert.deepEqual(await reach(), [], `${at}, at the end of an at-bat, taps 22px above or below the middle of these go elsewhere`);
  // The hundred throws' button, on two lines after the at-bat, keeps its words to the left, and has the chips' rounded
  // corners rather than a lozenge's.
  const run = await ph.evaluate(() => {
    const b = document.getElementById('ab-run'), cs = getComputedStyle(b), r = document.createRange();
    r.selectNodeContents(b);
    const lines = [...r.getClientRects()].filter(x => x.width > 0);
    return { lines: lines.length > 1, starts: [...new Set(lines.map(l => Math.round(l.left)))].length, radius: cs.borderTopLeftRadius };
  });
  assert.deepEqual(run, { lines: true, starts: 1, radius: '16px' }, `${at}, the hundred throws' button`);
  await narrowCtx.close();
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

// The count and what happened, over the at-bat's picture's top-left corner, never cover a pitch thrown to a spot off
// the plate: there the high ones, inside to a righty and away to a lefty, cross. On the narrowest phones, a phone, one
// held sideways and a tablet held sideways, with the longest lines there are: Aaron Nola's knuckle curve, while it
// flies, once it's in, and the strikeout swinging it ends in. Every spot's mark off the plate, at its full size, is
// clear of the readout's box.
for (const [width, height] of [[320, 640], [360, 740], [390, 844], [667, 375], [1024, 768]]) {
  const roCtx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const ro = await roCtx.newPage();
  watch(ro);
  const covered = () => ro.evaluate(async () => {
    const { SPOTS, spotXZ } = await import(new URL('js/atbat.js', location.href));
    const { markRadius } = await import(new URL('js/tracker.js', location.href));
    const { stage, state } = window.arsenal.atBat, cam = stage.camera(), dpr = cam.dpr, r = markRadius(cam) / dpr;
    const c = document.getElementById('ab-flight').getBoundingClientRect(), b = document.querySelector('.bat-stage .readout').getBoundingClientRect();
    const box = { left: b.left - c.left, right: b.right - c.left, top: b.top - c.top, bottom: b.bottom - c.top };
    const under = SPOTS.filter(s => !s.zone).filter(s => {
      const [sx, sz] = spotXZ(s, state.batter), p = cam.project([sx, 17 / 12, sz]), x = p.x / dpr, y = p.y / dpr;
      return x + r > box.left && x - r < box.right && y + r > box.top && y - r < box.bottom;
    });
    return { said: document.getElementById('ab-ro').textContent, under: under.map(s => s.id), box: Object.values(box).map(Math.round) };
  });
  for (const [batter, spot] of [['R', 0], ['L', 4]]) {
    const at = `at ${width}x${height} to a ${batter === 'R' ? 'right' : 'left'}-handed batter`;
    await ro.goto('about:blank');
    await ro.goto(`${base}#ab.nola.${batter}.9.KC${spot}.KC${spot}`);
    await ro.waitForFunction(() => window.arsenal.atBat.state.busy, null, { timeout: 15000 });
    const flying = await covered();
    assert.equal(flying.said, 'Pitch 2\u00a0· 78.4\u00a0mph knuckle curve', `${at}, while the pitch flies`);
    assert.deepEqual(flying.under, [], `${at}, while the pitch flies the readout ${JSON.stringify(flying.box)} covers spots`);
    await ro.waitForFunction(() => !window.arsenal.atBat.state.busy, null, { timeout: 15000 });
    const landed = await covered();
    assert.equal(landed.said, 'Swinging strike\u00a0· 78.4\u00a0mph knuckle curve', `${at}, once the pitch is in`);
    assert.deepEqual(landed.under, [], `${at}, once the pitch is in the readout ${JSON.stringify(landed.box)} covers spots`);
    await ro.goto('about:blank');
    await ro.goto(`${base}#ab.nola.${batter}.1p${`.KC${spot}`.repeat(5)}`);
    await ro.waitForFunction(() => !window.arsenal.atBat.state.busy, null, { timeout: 15000 });
    const ended = await covered();
    assert.equal(ended.said, 'Strikeout swinging\u00a0· 5 pitches', `${at}, at the end`);
    assert.deepEqual(ended.under, [], `${at}, at the end the readout ${JSON.stringify(ended.box)} covers spots`);
  }
  await roCtx.close();
}

// On a computer the at-bat's picture starts part-way through a pixel, and its frame's grass green, there until the
// picture is drawn, showed as a line along the bottom, bright on the dark palette's dirt. Neither picture has any of it
// along its bottom edge, in either palette, wherever it is on the screen. (Each palette is a page of its own: switching
// the palette of a page already open repaints it and hid the line.)
for (const colorScheme of ['light', 'dark']) {
  const deskCtx = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme, serviceWorkers: 'block' });
  const desk = await deskCtx.newPage();
  watch(desk);
  await desk.goto(base + STRIKEOUT);
  await desk.waitForFunction(() => !window.arsenal.atBat.state.busy, null, { timeout: 15000 });
  for (const [id, from] of [['ab-flight', 40], ['ab-flight', 100], ['ab-flight', 250], ['flight', 12], ['flight', 40]]) {
    await desk.evaluate(([id, from]) => { const f = document.getElementById(id); scrollTo(0, scrollY + f.getBoundingClientRect().top - from); }, [id, from]);
    await desk.waitForTimeout(200);
    const shot = (await desk.screenshot()).toString('base64');
    const green = await desk.evaluate(async ({ id, shot }) => {
      const f = document.getElementById(id).parentElement.getBoundingClientRect(), img = new Image();
      img.src = `data:image/png;base64,${shot}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const x = c.getContext('2d');
      x.drawImage(img, 0, 0);
      const rows = x.getImageData(Math.ceil(f.left + 20), Math.floor(f.bottom) - 2, Math.floor(f.width - 40), 4).data;
      let n = 0;
      for (let i = 0; i < rows.length; i += 4) if (Math.abs(rows[i] - 63) < 4 && Math.abs(rows[i + 1] - 133) < 4 && Math.abs(rows[i + 2] - 64) < 4) n++;
      return n;
    }, { id, shot });
    assert.equal(green, 0, `${colorScheme}: ${green} pixels of the frame's green along the bottom of #${id} at 1280x800, ${from}px down the screen`);
  }
  await deskCtx.close();
}

// The dark palette's light towers, behind the plate, are each seen whole: under the top of the picture, and clear of the
// speeds and times in its top-left corner and the legend in its top-right, with the longest of those there are (the
// knuckle curve thrown with the knuckleball). A computer shows a pair; a phone has no room for them.
for (const [width, height, want] of [[1280, 800, 2], [390, 844, 0]]) {
  const darkCtx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: width < 1000 ? 2 : 1, colorScheme: 'dark', serviceWorkers: 'block' });
  const dark = await darkCtx.newPage();
  watch(dark);
  await dark.goto(base);
  await dark.evaluate(() => document.fonts.ready);
  for (const [pitch, pair] of [['FF', null], ['KC', 'KN']]) {
    await dark.evaluate(([pitch, pair]) => {
      window.arsenal.pick(pitch);
      document.getElementById('pair').value = pair || '';
      document.getElementById('pair').dispatchEvent(new Event('change'));
    }, [pitch, pair]);
    await dark.waitForFunction(() => window.arsenal.stage.summary()?.every(s => s.arrived), null, { timeout: 15000 });
    await dark.waitForTimeout(100);
    const seen = await dark.evaluate(async () => {
      const { lights } = await import(new URL('js/flight.js', location.href));
      const stage = window.arsenal.stage, cam = stage.camera(), dpr = cam.dpr, c = stage.canvas.getBoundingClientRect();
      const boxes = ['.stage .readout', '#legend'].map(sel => document.querySelector(sel).getBoundingClientRect());
      return lights(cam).map(g => {
        const x = c.left + g.x / dpr, y = c.top + g.y / dpr, r = g.r / dpr;
        const under = boxes.filter(b => x + r > b.left && x - r < b.right && y + r > b.top && y - r < b.bottom).length;
        return under ? 'under the words' : y - r < c.top ? 'cut off at the top' : x - r < c.left || x + r > c.right ? 'cut off at the side' : 'whole';
      });
    });
    assert.deepEqual(seen, Array(want).fill('whole'), `at ${width}px, dark, ${pitch}${pair ? ` with ${pair}` : ''}: the light towers`);
  }
  await darkCtx.close();
}

// The address follows the at-bat once a pitch is thrown, so a reload, or a phone's Share, has the at-bat being played.
{
  const idle = () => page.waitForFunction(() => !window.arsenal.atBat.state.busy, null, { timeout: 15000 });
  const now = () => page.evaluate(() => ({
    hash: location.hash, link: '#' + window.arsenal.atBat.link(), title: document.title,
    count: document.querySelector('#ab-count .ct').textContent, log: document.querySelectorAll('#ab-log li').length,
  }));
  // A plain page keeps its address until the first pitch, even with another batter picked.
  await page.goto('about:blank');
  await page.goto(base + '#at-bat');
  await page.locator('#ab-batter [data-v="L"]').click();
  assert.equal((await now()).hash, '#at-bat', 'the address changed before the first pitch');
  // Two pitches, then a reload: the same at-bat, where it stood.
  await page.goto('about:blank');
  await page.goto(base + STRIKEOUT.replace(/\.FF6.*/, ''));
  for (const [code, spot] of [['FF', '1m1'], ['SL', 'm21']]) {
    await page.evaluate(([c, s]) => window.arsenal.atBat.throw(c, s), [code, spot]);
    await idle();
  }
  const thrown = await now();
  assert.deepEqual({ hash: thrown.hash, title: thrown.title, log: thrown.log }, { hash: STRIKEOUT.replace(/\.CH16.*/, ''), title: 'Pitch to a hitter · Arsenal', log: 2 }, 'after two pitches');
  await page.reload();
  await idle();
  assert.deepEqual(await now(), thrown, 'a reload lost the at-bat being played');
  // From a link, Next hitter's at-bat takes the link's place, so a reload doesn't bring the link's back.
  await page.goto('about:blank');
  await page.goto(base + STRIKEOUT);
  await idle();
  await page.locator('#ab-next').click();
  const next = await now();
  assert.ok(next.hash !== STRIKEOUT && next.hash === next.link && next.log === 0, `after Next hitter from a link the address is ${next.hash}`);
  // A link with pitches left out says in the address what was replayed.
  await page.goto('about:blank');
  await page.goto(base + STRIKEOUT + '.FF6.FF6');
  await idle();
  assert.equal((await now()).hash, STRIKEOUT, 'the address keeps the pitches left out of a link');
  // Picking a pitch takes the address and the title back.
  await page.locator('.chip', { hasText: 'Sweeper' }).click();
  assert.deepEqual(await page.evaluate(() => [location.hash, document.title]), ['#sweeper', 'Sweeper · Arsenal'], 'after picking a pitch');
}

// The end card's headline is coloured like the last pitch's mark and its number in the log: a strikeout red, a walk or
// a hit by pitch green, a ball in play blue, a home run too. The last pitch's box under it says why without repeating
// the headline in other words. Over the picture, how it ended is in a tag of that colour, the same in either palette as
// it's on the picture, with its white words at 4.5 to 1 or more (WCAG 2.2, SC 1.4.3).
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
  const tags = [];
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme });
    tags.push(await tagged(page));
  }
  await page.emulateMedia({ colorScheme: 'light' });
  assert.ok(tags[0]?.ratio >= 4.5, `the readout's tag at the end of ${link}: ${JSON.stringify(tags[0])}`);
  assert.deepEqual(tags, [0, 1].map(() => ({ ...tags[0], words: end.result, kind })), `the readout's tag at the end of ${link}, in the light and dark palettes`);
}

// A link to a pitch keeps the pitch thrown with it and a left-hander, and opens on them.
{
  const showing = () => page.evaluate(() => {
    const { pitch, pair, hand } = window.arsenal.state;
    return {
      hash: location.hash, pitch: pitch.code, pair, hand, list: document.getElementById('pair').value,
      pressed: document.querySelector('#hand [aria-pressed="true"]').dataset.v, lefty: window.arsenal.stage.flights[0].release.x > 0,
    };
  });
  await page.goto('about:blank');
  await page.goto(base + '#sweeper+sinker.lefty');
  assert.deepEqual(await showing(), { hash: '#sweeper+sinker.lefty', pitch: 'ST', pair: 'SI', hand: 'L', list: 'SI', pressed: 'L', lefty: true }, 'opened from #sweeper+sinker.lefty');
  // Throwing it alone, or with a right-hander, or with another pitch, the address says so.
  await page.locator('#pair').selectOption('');
  assert.equal((await showing()).hash, '#sweeper.lefty');
  await page.locator('#hand [data-v="R"]').click();
  assert.equal((await showing()).hash, '#sweeper');
  await page.locator('#pair').selectOption('FF');
  assert.equal((await showing()).hash, '#sweeper+four-seam');
  // Changed by hand, the address is followed. A part that isn't a pitch is left out.
  await page.evaluate(() => new Promise(resolve => { addEventListener('hashchange', () => setTimeout(resolve, 50), { once: true }); location.hash = '#slider+nothing.lefty'; }));
  assert.deepEqual(await showing(), { hash: '#slider+nothing.lefty', pitch: 'SL', pair: null, hand: 'L', list: '', pressed: 'L', lefty: true }, 'after changing the address to #slider+nothing.lefty');
}

// A link straight to a pitch opens on it, in capitals too, or with a bracket or quote from a message on the end.
for (const [hash, name] of [['#Sweeper', /^Sweeper/i], ['#sweeper)', /^Sweeper/i], ['#CHANGEUP%E2%80%9D', /^Changeup/i]]) {
  await page.goto('about:blank');
  await page.goto(base + hash);
  assert.match(await heading(), name, hash);
}
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
  // Every pitcher in Pitch to a hitter's list fits it, with what he is after his name.
  const cut = await narrow.evaluate(() => {
    const select = document.getElementById('ab-pitcher'), cs = getComputedStyle(select), measure = document.createElement('canvas').getContext('2d');
    measure.font = cs.font;
    const room = select.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 24; // 24px for the arrow: a phone's is about 20
    return [...select.options].filter(o => measure.measureText(o.text).width > room).map(o => o.text);
  });
  assert.deepEqual(cut, [], `at ${width}px these pitchers are cut off in the list`);
  assert.equal(await narrow.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `the page scrolls sideways at ${width}px`);
  // The spin view's buttons are "Behind" and "Side" here, as "From behind" and "From the side" don't fit side by side,
  // and a pressed "Side" stays inside the pill's rounded end: just past its top corner is the card, not the pressed button.
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
  assert.ok(past.apart <= 12, `at ${width}px a pressed "Side" shows past the pill's rounded end: rgb(${past.seen})`);
  // Each label fits its button, inside the pill, and the clock's numbers and "to the plate" are at least 11px, however
  // small the panel.
  const spinText = await narrow.evaluate(async () => {
    const pill = document.getElementById('spinview').getBoundingClientRect();
    const cut = [...document.querySelectorAll('#spinview button')].filter(b => {
      const text = document.createRange();
      text.selectNodeContents([...b.children].find(s => getComputedStyle(s).display !== 'none') || b);
      const r = b.getBoundingClientRect(), cs = getComputedStyle(b);
      return text.getBoundingClientRect().width > r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + 0.5 || r.right > pill.right + 0.5;
    }).map(b => b.textContent);
    const ctx = document.getElementById('spin').getContext('2d'), sizes = {};
    ctx.fillText = function (text, ...rest) {
      sizes[text] = Number(/([\d.]+)px/.exec(this.font)[1]) / Math.min(2, devicePixelRatio);
      return CanvasRenderingContext2D.prototype.fillText.call(this, text, ...rest);
    };
    const frames = n => new Promise(r => { const f = () => (n-- > 0 ? requestAnimationFrame(f) : r()); f(); });
    for (const v of ['behind', 'side']) { document.querySelector(`#spinview [data-v="${v}"]`).click(); await frames(3); }
    delete ctx.fillText;
    return { cut, small: Object.entries(sizes).filter(([, px]) => px < 11).map(([t, px]) => `${t}: ${px}px`), drawn: Object.keys(sizes).length };
  });
  assert.deepEqual(spinText, { cut: [], small: [], drawn: 5 }, `at ${width}px, the spin view's labels cut off, or its clock's words too small`);
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
// It says why the ball doesn't fly, and the spinning ball starts out still, there to start with a tap.
assert.match(await calm.locator('#caption').textContent(), / Your device asks for less motion, so each throw is shown where it finishes\.$/);
assert.equal(await calm.locator('#spin').getAttribute('aria-pressed'), 'true');
assert.match(await calm.locator('#c-spin').textContent(), / Tap the ball to spin it\.$/);
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
// The cutter's, slider's and sweeper's spin axes point mostly at you (bullet spin), so the near end of the axis is over
// the ball. It's dark there on the dark page as on the light one: the ball is cream on both, and the dark page's ink is
// nearly as pale. (The end is the last dot drawn.)
{
  await calm.locator('#spinview [data-v="behind"]').click();
  const pale = [];
  for (const colorScheme of ['light', 'dark']) {
    await calm.emulateMedia({ colorScheme });
    pale.push(...await calm.evaluate(async scheme => {
      const ctx = document.getElementById('spin').getContext('2d'), out = [];
      let end;
      ctx.arc = function (x, y, ...rest) { end = [x, y]; return CanvasRenderingContext2D.prototype.arc.call(this, x, y, ...rest); };
      for (const code of ['FC', 'SL', 'ST']) {
        window.arsenal.pick(code);
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const [r, g, b] = ctx.getImageData(Math.round(end[0]), Math.round(end[1]), 1, 1).data;
        const light = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
        if (light > 80) out.push(`${scheme} ${code}: rgb(${r}, ${g}, ${b})`);
      }
      delete ctx.arc;
      return out;
    }, colorScheme));
  }
  assert.deepEqual(pale, [], 'the end of the spin axis is pale over the ball');
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
