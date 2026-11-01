// Refreshes js/league.js, the numbers the at-bat model is calibrated to, from Baseball Savant:  node tools/league.mjs [season]
// League totals, the same split by count and by pitch type, and the arsenals of the pitchers you can pitch as.
import { writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { search, num, round } from './savant.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const season = Number(process.argv[2]) || 2026;
const IN_ZONE = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
const COUNTS = ['00', '01', '02', '10', '11', '12', '20', '21', '22', '30', '31', '32'];
const TYPES = ['FF', 'SI', 'FC', 'SL', 'ST', 'CU', 'KC', 'SV', 'CH', 'FS', 'FO', 'KN'];
const FASTBALLS = ['FF', 'SI', 'FC'];
// The pitchers you can pitch as, by Statcast id: picked for arsenals that play differently.
const PITCHERS = [
  [694973, 'skenes', 'Six pitches, most of them hard.'],
  [694819, 'misiorowski', 'A four-seamer at 100 mph, and a curve at 88.'],
  [592332, 'gausman', 'Four-seamer and splitter that look alike until late.'],
  [650911, 'sanchez', 'A lefty’s sinker and changeup.'],
  [519242, 'sale', 'A lefty’s slider that sweeps a foot.'],
  [605400, 'nola', 'Lives on the knuckle curve.'],
  [695243, 'miller', 'A closer: 101 mph and a slider.'],
  [643511, 'rogers', 'A submariner: an 83 mph sinker from below the knees.'],
  [663362, 'waldron', 'A knuckleballer, with fastballs to keep hitters honest.'],
];

const one = async (filters = []) => (await search(season, filters, 'league'))[0] || {};
const n = r => num(r.pitches) || 0;
const pick = (r, keys) => Object.fromEntries(keys.map(k => [k, num(r[k]) || 0]));

console.log('league totals');
const all = await one();
const zone = await one([['hfZ', IN_ZONE]]);
const called = await one([['hfPR', ['called_strike']]]);
const calledZone = await one([['hfPR', ['called_strike']], ['hfZ', IN_ZONE]]);
const balls = await one([['hfPR', ['ball', 'blocked_ball']]]);
const hbp = await one([['hfPR', ['hit_by_pitch']]]);
const league = {
  ...pick(all, ['pitches', 'pa', 'so', 'bb', 'hits', 'singles', 'doubles', 'triples', 'hrs', 'swings', 'whiffs', 'takes', 'bip']),
  hbp: n(hbp), called: n(called), balls: n(balls),
  zone: { pitches: n(zone), swings: num(zone.swings) || 0, whiffs: num(zone.whiffs) || 0, called: n(calledZone) },
};

console.log('by count');
const counts = {};
for (const c of COUNTS) {
  const r = await one([['hfC', [c]]]);
  const z = await one([['hfC', [c]], ['hfZ', IN_ZONE]]);
  const fb = await one([['hfC', [c]], ['hfPT', FASTBALLS]]);
  counts[`${c[0]}-${c[1]}`] = { pitches: n(r), zone: round(n(z) / n(r), 3), fastball: round(n(fb) / n(r), 3), swing: round(num(r.swings) / n(r), 3), whiff: round(num(r.whiffs) / num(r.swings), 3) };
}

console.log('by pitch type');
const types = {};
for (const t of TYPES) {
  const r = await one([['hfPT', [t]]]);
  if (!n(r)) continue;
  const z = await one([['hfPT', [t]], ['hfZ', IN_ZONE]]);
  types[t] = {
    pitches: n(r), zone: round(n(z) / n(r), 3),
    swing: round(num(r.swings) / n(r), 3), whiff: round(num(r.whiffs) / num(r.swings), 3),
    zoneSwing: round(num(z.swings) / n(z), 3), zoneWhiff: round(num(z.whiffs) / num(z.swings), 3),
    chaseSwing: round((num(r.swings) - num(z.swings)) / (n(r) - n(z)), 3),
    chaseWhiff: round((num(r.whiffs) - num(z.whiffs)) / (num(r.swings) - num(z.swings)), 3),
  };
}

console.log('pitchers');
const rows = {};
for (const t of TYPES) {
  for (const r of await search(season, [['hfPT', [t]]], 'name')) (rows[r.player_id] ||= []).push({ t, r });
}
const pitchers = PITCHERS.map(([id, key, line]) => {
  const mine = rows[id] || [];
  const total = mine.reduce((s, x) => s + n(x.r), 0);
  if (!total) throw new Error(`no ${season} pitches for ${key} (${id})`);
  const sideOf = mine.reduce((s, x) => s + (num(x.r.release_pos_x) || 0) * n(x.r), 0) / total;
  return {
    key, line,
    name: mine[0].r.player_name.split(', ').reverse().join(' '),
    hand: sideOf < 0 ? 'R' : 'L',
    pitches: mine
      // A pitch he throws at least one time in twenty-five, or a hundred times.
      .filter(x => n(x.r) / total >= 0.04 || n(x.r) >= 100)
      .sort((a, b) => n(b.r) - n(a.r))
      .map(({ t, r }) => ({
        code: t,
        share: round(n(r) / total, 3),
        mph: round(num(r.velocity)),
        rpm: Math.round(num(r.spin_rate) || 0),
        rise: round(num(r.api_break_z_induced) * 12),
        arm: round(num(r.api_break_x_arm) * 12),
        height: round(num(r.release_pos_z), 2),
        side: round(Math.abs(num(r.release_pos_x)), 2),
        extension: round(num(r.release_extension), 2),
        whiff: round(num(r.whiffs) / num(r.swings), 3),
      })),
  };
});

const stamp = new Date().toISOString().slice(0, 10);
const js = `// Made by tools/league.mjs from Baseball Savant's Statcast search on ${stamp}: the ${season} regular season.
// LEAGUE is every pitch; zone is the nine boxes of Statcast's strike zone. COUNTS and TYPES give shares of pitches:
// how many were in the zone, fastballs (four-seam, sinker, cutter), swung at, and missed per swing.
// PITCHERS: the arsenals you can pitch as. side is feet from the middle of the rubber at release, toward the arm side.
export const LEAGUE = ${JSON.stringify(league)};
export const COUNTS = ${JSON.stringify(counts, null, 1)};
export const TYPES = ${JSON.stringify(types, null, 1)};
export const PITCHERS = ${JSON.stringify(pitchers, null, 1)};
`;
await writeFile(join(root, 'js/league.js'), js);
console.log(`wrote js/league.js: ${league.pitches} pitches, ${league.pa} plate appearances`);
