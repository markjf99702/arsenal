// The one-file copy (npm run build), the way a host shows it: written into a sandboxed frame on another page, with
// srcdoc. Run as part of npm test:  node test/single.mjs  (needs Playwright, and esbuild from npm install)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(join(execSync('npm root -g').toString().trim(), 'playwright')); }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
execSync('node scripts/build.mjs', { cwd: root, stdio: 'ignore' });
const copy = await readFile(join(root, 'dist/arsenal.html'), 'utf8');

// The host: a page of its own, with the copy in a frame that may run scripts and nothing else.
const server = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end('<!doctype html><title>Host</title><body style="margin:0"><iframe id="copy" sandbox="allow-scripts" style="border:0;width:390px;height:844px"></iframe>');
}).listen(0);
const host = `http://127.0.0.1:${server.address().port}/`;

const browser = await pw.chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const problems = [];
  // Chrome says the clipboard isn't allowed in the frame; the copy then offers the link to copy by hand.
  const ok = text => /permissions policy/i.test(text) && /clipboard/i.test(text);
  page.on('pageerror', e => problems.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !ok(m.text())) problems.push(m.text()); });
  await page.goto(host);
  await page.evaluate(html => { document.getElementById('copy').srcdoc = html; }, copy);
  const frame = () => page.frames().find(f => f !== page.mainFrame());
  for (const end = Date.now() + 15000; !(await frame()?.evaluate(() => !!window.arsenal?.atBat).catch(() => false));) {
    assert.ok(Date.now() < end, 'the copy never opened in its frame');
    await page.waitForTimeout(100);
  }
  const copyFrame = frame();
  await copyFrame.evaluate(() => document.fonts.ready);

  // The lede's link to Pitch to a hitter goes down to it, in the copy. (Followed as a link, it was read against the
  // host's address, and the frame left the copy for the host's own page.)
  await copyFrame.locator('.lede a').click();
  let y = -1;
  for (const end = Date.now() + 5000; ;) {
    await page.waitForTimeout(250);
    const now = await copyFrame.evaluate(() => scrollY).catch(() => null);
    if (now === y || Date.now() > end) break;
    y = now;
  }
  const after = await copyFrame.evaluate(() => ({ copy: 'single' in document.documentElement.dataset, top: Math.round(document.getElementById('at-bat')?.getBoundingClientRect().top ?? NaN) })).catch(e => ({ gone: e.message.split('\n')[0] }));
  assert.deepEqual({ url: copyFrame.url(), ...after }, { url: 'about:srcdoc', copy: true, top: 12 }, 'the lede\'s link in the copy');

  // An at-bat plays to its end.
  const ended = await copyFrame.evaluate(async () => {
    const { atBat } = window.arsenal;
    for (let n = 0; n < 30 && !atBat.state.ab.result; n++) {
      atBat.throw('FF', n % 2 ? 'm2m2' : '00');
      while (atBat.state.busy) await new Promise(r => setTimeout(r, 50));
    }
    return { result: atBat.state.ab.result || null, card: !document.getElementById('ab-end').hidden };
  });
  assert.ok(ended.result && ended.card, `the at-bat in the copy didn't end: ${JSON.stringify(ended)}`);
  assert.deepEqual(problems, [], 'errors in the copy');
  console.log('the one-file copy is good');
} finally {
  await browser.close();
  server.close();
}
