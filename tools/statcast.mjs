// Refreshes js/numbers.js from Baseball Savant's Statcast search:  node tools/statcast.mjs [season]
// One request per pitch type, grouped by pitcher; the averages here weight each pitcher by how many they threw. Then one
// more per type for where it crosses the plate (aim), and one to Savant's spin-direction leaderboard (spin).
//   node tools/statcast.mjs --aim    fetches only the aim points, and adds them to js/numbers.js as it stands
//   node tools/statcast.mjs --spin   the same for the spin directions
//   node tools/statcast.mjs --spread the same for the spread of movement across pitchers
import { writeFile, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// The parts that can be fetched on their own and added to js/numbers.js as it stands, with what the file's first line
// calls them.
const PARTS = { aim: 'the aim points', spin: 'the spin directions', spread: 'the movement spreads' };
const only = Object.keys(PARTS).filter(k => process.argv.includes(`--${k}`));
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

// Spin direction: which way a pitch's spin itself would push it, before its seams have their say, as Hawk-Eye measures
// its spin axis: a clock angle seen from behind a right-hander, in degrees clockwise from 12 (a left-hander's mirrored).
// Savant's spin-direction leaderboard has it for each pitcher with at least 10 of a pitch, and counts knuckle curves as
// curves. Averaged as directions, each pitcher counted by how many of the pitch he threw (`every`, the type's rows).
// None for the knuckleball, which turns two or three times on the way in, so its seams move it, not its spin.
const SPIN_BOARD = { KC: 'CU' };
async function fetchSpin(code, every) {
  if (code === 'KN') return null;
  const board = await get(`https://baseballsavant.mlb.com/leaderboard/spin-direction-pitches?year=${season}&min=1&pitch_type=${SPIN_BOARD[code] || code}&pov=Pit&csv=true`);
  return spinOf(board, Object.fromEntries(regulars(every, code).map(r => [String(r.player_id), Number(r.pitches)])));
}
// The leaderboard's angle (pov=Pit) is 180 at 12 o'clock and falls clockwise; `weights` is how many each pitcher threw.
function spinOf(board, weights) {
  let x = 0, y = 0;
  for (const r of board) {
    const k = weights[String(r.player_id)], deg = num(r.hawkeye_measured);
    if (!k || deg == null) continue;
    const a = ((180 - deg) * (r.pitch_hand === 'L' ? -1 : 1) * Math.PI) / 180;
    x += k * Math.sin(a); y += k * Math.cos(a);
  }
  if (!x && !y) return null;
  const a = (Math.atan2(x, y) * 180) / Math.PI;
  return round(a < 0 ? a + 360 : a);
}

// How far pitchers differ in how a pitch moves: the middle 80% of them by their average rise and by their average arm-side
// movement, each counted by how many he threw, in inches ([10th, 90th percentile]). None when the average is one
// pitcher's. From the type's rows (`every`), so nothing more is fetched.
function fetchSpread(code, every) {
  const rows = regulars(every, code);
  if (rows.length < 2) return null;
  const middle = (key, k) => {
    const vs = rows.filter(r => num(r[key]) != null).map(r => [num(r[key]) * k, Number(r.pitches)]).sort((a, b) => a[0] - b[0]);
    const m = vs.reduce((s, [, n]) => s + n, 0);
    const pct = p => { let c = 0; for (const [v, n] of vs) { c += n; if (c >= p * m) return round(v); } return round(vs.at(-1)[0]); };
    return [pct(0.1), pct(0.9)];
  };
  return { rise: middle('api_break_z_induced', 12), arm: middle('api_break_x_arm', 12) };
}

// js/numbers.js, with the date its numbers were fetched, and the day any part was fetched later (`later`, by PARTS).
const today = new Date().toISOString().slice(0, 10);
async function write(numbers, total, made, later = {}) {
  const days = {};
  for (const [k, day] of Object.entries(later)) if (day !== made) (days[day] ||= []).push(PARTS[k]);
  const when = Object.entries(days).map(([day, parts]) => `, ${parts.join(' and ')} on ${day}`).join('');
  const js = `// Made by tools/statcast.mjs from Baseball Savant's Statcast search on ${made}${when}.
// Every pitch of the ${season} regular season, by pitch type. Averages weight each pitcher by how many they threw.
// The knuckleball's count only pitchers who threw at least ${REGULARS_ONLY.KN} of them, which leaves out position players' lobs.
// rise and arm are spin-induced movement in inches (arm < 0 means toward the glove side); drop includes gravity.
// low and high: the middle 80% of pitchers by their average speed, each counted by how many he threw, or null when the
// average comes from one pitcher.
// aim: where a right-hander's pitch crossed the plate on average to right-handed batters, [plate_x, plate_z] in feet from
// the catcher's view (x to his right, z up). The explorer throws each pitch there.
// spin: which way its spin itself would push it, as Hawk-Eye measured its spin axis, in degrees clockwise from 12 o'clock
// seen from behind a right-hander, or null where it wasn't measured (the eephus) or doesn't matter (the knuckleball).
// spread: the middle 80% of pitchers by rise and by arm-side movement, [low, high] in inches, or null for one pitcher.
export const SEASON = ${season};
export const TOTAL = ${total};
export const NUMBERS = ${JSON.stringify(numbers, null, 2).replace(/"(\w+)":/g, '$1:').replace(/\[\s+(-?[\d.]+),\s+(-?[\d.]+)\s+\]/g, '[$1, $2]')};
`;
  await writeFile(join(root, 'js/numbers.js'), js);
}

const FETCH = { aim: fetchAim, spin: fetchSpin, spread: fetchSpread };
if (only.length) {
  // The numbers as they stand, each with these parts added; the rest isn't fetched again.
  const file = join(root, 'js/numbers.js');
  const { NUMBERS, TOTAL, SEASON } = await import(`${pathToFileURL(file).href}?${Date.now()}`);
  if (SEASON !== season) throw new Error(`js/numbers.js is ${SEASON}'s; run node tools/statcast.mjs --${only[0]} ${SEASON}`);
  const head = (await readFile(file, 'utf8')).split('\n')[0];
  const made = head.match(/Statcast search on (\d{4}-\d\d-\d\d)/)[1];
  // Each part's day: the date after it, or after the parts listed with it ("the spin directions and the movement spreads
  // on 2026-11-02").
  const later = Object.fromEntries(Object.entries(PARTS).map(([k, words]) => [k, head.match(new RegExp(`${words}(?: and [a-z ]+?)* on (\\d{4}-\\d\\d-\\d\\d)`))?.[1]]).filter(([, day]) => day));
  const numbers = {};
  for (const [code, n] of Object.entries(NUMBERS)) {
    const every = await fetchType(code);
    numbers[code] = { ...n };
    for (const k of only) { numbers[code][k] = await FETCH[k](code, every); console.log(code, k, numbers[code][k]); }
  }
  for (const k of only) later[k] = today;
  await write(numbers, TOTAL, made, later);
  console.log(`added ${only.map(k => PARTS[k]).join(' and ')} to js/numbers.js`);
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
    spin: await fetchSpin(code, every),
    spread: fetchSpread(code, every),
  };
}

await write(out, total, today);
console.log(`wrote js/numbers.js: ${total} pitches`);
