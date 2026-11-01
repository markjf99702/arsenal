// Refreshes js/numbers.js from Baseball Savant's Statcast search:  node tools/statcast.mjs [season]
// One request per pitch type, grouped by pitcher; the averages here weight each pitcher by how many they threw. Then one
// more per type for where it crosses the plate (aim).
//   node tools/statcast.mjs --aim    fetches only the aim points, and adds them to js/numbers.js as it stands
import { writeFile, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const aimOnly = process.argv.includes('--aim');
const season = Number(process.argv.slice(2).find(a => /^\d{4}$/.test(a))) || 2026;
const TYPES = ['FF', 'SI', 'FC', 'SL', 'ST', 'CU', 'KC', 'SV', 'CS', 'CH', 'FS', 'FO', 'SC', 'KN', 'EP'];

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  return body.filter(r => r.length === head.length).map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

// One Statcast search for a pitch type, `extra` filters added: a row per pitcher (group 'name') or one for the league.
const searchURL = (code, group, extra = '') => 'https://baseballsavant.mlb.com/statcast_search/csv?all=true&hfGT=R%7C&player_type=pitcher'
  + `&hfPT=${code}%7C&hfSea=${season}%7C${extra}&min_pitches=0&min_results=0&min_pas=0&group_by=${group}`
  + '&sort_col=pitches&sort_order=desc';
const fetchType = code => get(searchURL(code, 'name'));

async function get(url) {
  for (let tries = 0; ; tries++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status}`);
      return parseCSV(await res.text());
    } catch (e) {
      if (tries >= 3) throw e;
      await new Promise(r => setTimeout(r, 2000 * 2 ** tries));
    }
  }
}

const num = s => (s === '' || s == null || Number.isNaN(Number(s)) ? null : Number(s));
const round = (v, d = 1) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);

// Only a knuckleballer throws the knuckleball for real, but position players lob a few in blowouts at 50 mph or so. So its
// speed, spin, movement, release, misses and aim come from the pitchers who threw at least this many (everyone, if
// nobody did); how many were thrown, by how many pitchers and by whom most still count everyone.
const REGULARS_ONLY = { KN: 100 };
const regulars = (rows, code) => { const r = rows.filter(row => Number(row.pitches) >= (REGULARS_ONLY[code] ?? 0)); return r.length ? r : rows; };

// Where the explorer throws each kind of pitch: where a right-handed pitcher's crossed the plate on average to
// right-handed batters, [plate_x, plate_z] in feet from the catcher's view (x to his right, z up). One search for the
// league; for a type counted by its regulars only, a row per pitcher, averaged over the regulars by how many each threw
// (`every` is the type's rows for every pitcher, to find them).
async function fetchAim(code, every) {
  const rr = '&pitcher_throws=R&batter_stands=R';
  let rows;
  if (REGULARS_ONLY[code]) {
    const ids = new Set(regulars(every, code).map(r => String(r.player_id)));
    rows = (await get(searchURL(code, 'name', rr))).filter(r => ids.has(String(r.player_id)));
  } else rows = await get(searchURL(code, 'league', rr));
  let x = 0, z = 0, n = 0;
  for (const r of rows) { const px = num(r.plate_x), pz = num(r.plate_z), k = Number(r.pitches); if (px == null || pz == null || !k) continue; x += px * k; z += pz * k; n += k; }
  return n ? [round(x / n, 2), round(z / n, 2)] : null;
}

// js/numbers.js, with the date its numbers were fetched, and the aim points' if that was another day.
const today = new Date().toISOString().slice(0, 10);
async function write(numbers, total, made, aimed = made) {
  const js = `// Made by tools/statcast.mjs from Baseball Savant's Statcast search on ${made}${aimed !== made ? `, the aim points on ${aimed}` : ''}.
// Every pitch of the ${season} regular season, by pitch type. Averages weight each pitcher by how many they threw.
// The knuckleball's count only pitchers who threw at least ${REGULARS_ONLY.KN} of them, which leaves out position players' lobs.
// rise and arm are spin-induced movement in inches (arm < 0 means toward the glove side); drop includes gravity.
// low and high: the middle 80% of pitchers by their average speed, each counted by how many he threw, or null when the
// average comes from one pitcher.
// aim: where a right-hander's pitch crossed the plate on average to right-handed batters, [plate_x, plate_z] in feet from
// the catcher's view (x to his right, z up). The explorer throws each pitch there.
export const SEASON = ${season};
export const TOTAL = ${total};
export const NUMBERS = ${JSON.stringify(numbers, null, 2).replace(/"(\w+)":/g, '$1:').replace(/\[\s+(-?[\d.]+),\s+(-?[\d.]+)\s+\]/g, '[$1, $2]')};
`;
  await writeFile(join(root, 'js/numbers.js'), js);
}

if (aimOnly) {
  // The numbers as they stand, each with its aim added; the rest isn't fetched again.
  const file = join(root, 'js/numbers.js');
  const { NUMBERS, TOTAL, SEASON } = await import(`${pathToFileURL(file).href}?${Date.now()}`);
  if (SEASON !== season) throw new Error(`js/numbers.js is ${SEASON}'s; run node tools/statcast.mjs --aim ${SEASON}`);
  const made = (await readFile(file, 'utf8')).match(/Statcast search on (\d{4}-\d\d-\d\d)/)[1];
  const numbers = {};
  for (const [code, n] of Object.entries(NUMBERS)) {
    numbers[code] = { ...n, aim: await fetchAim(code, REGULARS_ONLY[code] ? await fetchType(code) : []) };
    console.log(code, 'aim', numbers[code].aim);
  }
  await write(numbers, TOTAL, made, today);
  console.log('added the aim points to js/numbers.js');
  process.exit(0);
}

// Active spin: the share of the spin that moves the ball (the rest is bullet spin). Per pitcher, from its own leaderboard.
const ACTIVE = { FF: 'fourseam', SI: 'sinker', FC: 'cutter', CH: 'changeup', FS: 'splitter', CU: 'curve', KC: 'curve', SL: 'slider', ST: 'sweeper', SV: 'slurve' };
const activeRows = parseCSV(await (await fetch(`https://baseballsavant.mlb.com/leaderboard/active-spin?year=${season}&min=1&hand=&csv=true`)).text());
const active = Object.fromEntries(activeRows.map(r => [String(r.entity_id), r]));

const all = {};
for (const code of TYPES) {
  all[code] = await fetchType(code);
  console.log(code, all[code].length, 'pitchers');
}
const total = Object.values(all).flat().reduce((s, r) => s + Number(r.pitches), 0);

const out = {};
for (const code of TYPES) {
  const every = all[code];
  const n = every.reduce((s, r) => s + Number(r.pitches), 0);
  if (!n) continue;
  // How the pitch behaves comes from these rows: everyone's, or for the knuckleball its regular throwers'.
  const rows = regulars(every, code);
  const m = rows.reduce((s, r) => s + Number(r.pitches), 0);
  const avg = (key, k = 1) => {
    let s = 0, w = 0;
    for (const r of rows) { const v = num(r[key]); if (v == null) continue; s += v * r.pitches; w += Number(r.pitches); }
    return w ? (s / w) * k : null;
  };
  // The middle 80% of pitchers by their average speed, each counted by how many he threw. One pitcher on his own has
  // no range to show.
  const speeds = rows.filter(r => num(r.velocity) != null).map(r => [num(r.velocity), Number(r.pitches)]).sort((a, b) => a[0] - b[0]);
  const pct = p => { let c = 0; for (const [v, k] of speeds) { c += k; if (c >= p * m) return v; } return speeds.at(-1)?.[0] ?? null; };
  const spread = speeds.length > 1;
  let whiffs = 0, swings = 0;
  for (const r of rows) { whiffs += num(r.whiffs) || 0; swings += num(r.swings) || 0; }
  const most = every.reduce((a, b) => (Number(b.pitches) > Number(a.pitches) ? b : a));
  const steady = every.filter(r => Number(r.pitches) >= 200);
  const hardest = steady.length ? steady.reduce((a, b) => (num(b.velocity) > num(a.velocity) ? b : a)) : null;
  let act = 0, actN = 0;
  for (const r of rows) {
    const v = ACTIVE[code] && num(active[r.player_id]?.['active_spin_' + ACTIVE[code]]);
    if (v != null) { act += v * r.pitches; actN += Number(r.pitches); }
  }
  const name = r => r.player_name.split(', ').reverse().join(' ');
  out[code] = {
    pitches: n,
    share: round((100 * n) / total, 2),
    pitchers: every.length,
    mph: round(avg('velocity')),
    low: spread ? round(pct(0.1)) : null,
    high: spread ? round(pct(0.9)) : null,
    rpm: Math.round(avg('spin_rate') ?? 0) || null,
    active: actN ? Math.round(act / actN) : null, // percent of the spin that moves the ball
    rise: round(avg('api_break_z_induced', 12)), // inches, spin only (gravity taken out)
    arm: round(avg('api_break_x_arm', 12)), // inches toward the arm side; negative is glove side
    drop: round(avg('api_break_z_with_gravity', 12)), // inches, gravity included
    height: round(avg('release_pos_z'), 2), // feet
    extension: round(avg('release_extension'), 2), // feet in front of the rubber
    whiff: swings ? round((100 * whiffs) / swings) : null, // misses per 100 swings
    most: { name: name(most), pitches: Number(most.pitches) },
    hardest: hardest && { name: name(hardest), mph: num(hardest.velocity), pitches: Number(hardest.pitches) },
    aim: await fetchAim(code, every),
  };
}

await write(out, total, today);
console.log(`wrote js/numbers.js: ${total} pitches`);
