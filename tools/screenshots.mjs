// Renders the README screenshots (docs/*.png) and the link preview (og.png):  node tools/screenshots.mjs
// Math.random is seeded, so the pitches land in the same places every run.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(join(execSync('npm root -g').toString().trim(), 'playwright')); }
const UPNG = require('upng-js');
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
const SEED = 7;
const browser = await pw.chromium.launch();
await mkdir(join(root, 'docs'), { recursive: true });

async function open(viewport, deviceScaleFactor, hash = '', colorScheme = 'light') {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor, hasTouch: true, serviceWorkers: 'block', colorScheme });
  const page = await ctx.newPage();
  await page.addInitScript(seed => {
    let a = seed; // mulberry32
    Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }, SEED);
  await page.goto(base + hash);
  await page.evaluate(() => document.fonts.ready);
  return page;
}
// Set up a throw and wait until every ball has reached the plate.
async function throwAndWait(page, { code, pair = null, view = 'catcher', speed = 1 }) {
  await page.evaluate(({ code, pair, view, speed }) => {
    document.querySelector(`#view [data-v="${view}"]`).click();
    document.querySelector(`#speed [data-v="${speed}"]`).click();
    window.arsenal.pick(code);
    window.arsenal.state.pair = pair;
    document.getElementById('pair').value = pair || '';
    document.getElementById('pair').dispatchEvent(new Event('change'));
  }, { code, pair, view, speed });
  await page.waitForFunction(() => window.arsenal.stage.summary()?.every(s => s.arrived) && window.arsenal.stage.clock > 2.2, null, { timeout: 20000 });
}
// Shrink a PNG to a 256-colour palette so it stays small.
async function save(path, buffer, colours = 256) {
  const img = (await import('node:zlib'), UPNG.decode(buffer));
  const rgba = UPNG.toRGBA8(img)[0];
  await writeFile(path, Buffer.from(UPNG.encode([rgba], img.width, img.height, colours)));
}

// Phone screenshots for the README.
{
  const page = await open({ width: 390, height: 844 }, 2);
  await throwAndWait(page, { code: 'FF', pair: 'CH' });
  await save(join(root, 'docs/phone-flight.png'), await page.screenshot());

  await throwAndWait(page, { code: 'CU', pair: 'FF', view: 'side' });
  await save(join(root, 'docs/phone-side.png'), await page.screenshot());

  await throwAndWait(page, { code: 'SL' });
  await page.evaluate(() => { const r = document.querySelector('.duo').getBoundingClientRect(); scrollTo(0, scrollY + r.top - 210); });
  await page.waitForTimeout(400);
  await save(join(root, 'docs/phone-card.png'), await page.screenshot());

  await page.evaluate(() => { const r = document.querySelector('#move').getBoundingClientRect(); scrollTo(0, scrollY + r.top - 150); });
  await page.waitForTimeout(200);
  await save(join(root, 'docs/phone-chart.png'), await page.screenshot());
  await page.context().close();
}

// Link preview, 1200 x 630: the name and one line on the left, a real throw on the right.
{
  const page = await open({ width: 1280, height: 900 }, 2);
  await throwAndWait(page, { code: 'FF', pair: 'CU' });
  const flight = await page.evaluate(() => document.getElementById('flight').toDataURL('image/png'));
  const grip = await page.evaluate(() => {
    window.arsenal.pick('CU');
    return document.getElementById('grip').toDataURL('image/png');
  });
  await page.context().close();

  const font = async f => `data:font/woff2;base64,${(await readFile(join(root, 'fonts', f))).toString('base64')}`;
  const card = await open({ width: 1200, height: 630 }, 1);
  await card.setContent(`<!doctype html><html><head><style>
    @font-face { font-family: BC; src: url(${await font('barlow-condensed-700.woff2')}); font-weight: 700; }
    @font-face { font-family: B; src: url(${await font('barlow-500.woff2')}); font-weight: 500; }
    html, body { margin: 0; width: 1200px; height: 630px; background: #f6f1e6; overflow: hidden; }
    .wrap { position: relative; width: 1200px; height: 630px; }
    .text { position: absolute; left: 64px; top: 70px; width: 420px; color: #1b2230; }
    h1 { font: 700 112px/0.95 BC; letter-spacing: .03em; text-transform: uppercase; margin: 0 0 22px; }
    p { font: 500 31px/1.3 B; color: #444c5c; margin: 0; }
    .site { position: absolute; left: 64px; bottom: 54px; font: 700 24px BC; letter-spacing: .06em; text-transform: uppercase; color: #6b7282; }
    .stage { position: absolute; right: 48px; top: 48px; width: 620px; height: 426px; border-radius: 18px; overflow: hidden; box-shadow: 0 8px 30px rgba(60,40,20,.18); }
    .stage img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .grip { position: absolute; right: 520px; bottom: 30px; width: 230px; height: 230px; border-radius: 50%; background: #f6f1e6; box-shadow: 0 6px 24px rgba(60,40,20,.2); overflow: hidden; }
    .grip img { width: 100%; height: 100%; display: block; }
    .tags { position: absolute; right: 48px; bottom: 52px; display: flex; gap: 10px; font: 700 22px BC; letter-spacing: .05em; text-transform: uppercase; color: #1b2230; }
    .tags span { display: flex; align-items: center; gap: 8px; }
    .tags i { width: 28px; height: 5px; border-radius: 3px; }
  </style></head><body><div class="wrap">
    <div class="text"><h1>Arsenal</h1><p>Every pitch in baseball: the grip, the spin, the speed and the break.</p></div>
    <div class="site">junkdrawer.works</div>
    <div class="stage"><img src="${flight}"></div>
    <div class="grip"><img src="${grip}"></div>
    <div class="tags"><span><i style="background:#e0b000"></i>Four-seam</span><span><i style="background:#3aa7d8"></i>Curveball</span></div>
  </div></body></html>`);
  await card.evaluate(() => document.fonts.ready);
  await save(join(root, 'og.png'), await card.screenshot());
  await card.context().close();
}

await browser.close();
server.close();
console.log('screenshots written');
