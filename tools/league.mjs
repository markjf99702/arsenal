// Refreshes js/league.js, the numbers the at-bat model is calibrated to, from Baseball Savant:
//   node tools/league.mjs [season] [--cache=DIR]
// League totals, the same split by count, by pitch type, by where pitches crossed the plate and by the hands of pitcher
// and batter, and the arsenals of the pitchers you can pitch as. Then, from Statcast's pitch-by-pitch rows: each of
// those pitchers' speeds pitch to pitch, from all of his; and from every sixth day of the season (about a sixth of its
// pitches, every day of the week in turn), the strike zone's average top and bottom, how much a pitcher's speed varies
// pitch to pitch, how often hitters missed a pitch right after one of another speed or the same kind, and what
// Statcast's wOBA counts each hit as.
// --cache=DIR keeps every download in DIR and reads it back on the next run.
import { writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { search, details, useCache, num, round } from './savant.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const season = Number(args.find(a => /^\d{4}$/.test(a))) || 2026;
const cacheDir = args.find(a => a.startsWith('--cache='))?.slice(8);
if (cacheDir) useCache(cacheDir);
const IN_ZONE = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
const COUNTS = ['00', '01', '02', '10', '11', '12', '20', '21', '22', '30', '31', '32'];
const TYPES = ['FF', 'SI', 'FC', 'SL', 'ST', 'CU', 'KC', 'SV', 'CH', 'FS', 'FO', 'KN'];
const FASTBALLS = ['FF', 'SI', 'FC'];
// The pitchers you can pitch as, by Statcast id: picked for arsenals that play differently. Each has a line shown once
// he's picked, and a tag that follows his name in the list ("Chris Sale – lefty, big slider"): short, so the list
// fits a 320px phone.
const PITCHERS = [
  [694973, 'skenes', 'Six pitches, most of them hard.', 'six pitches'],
  [694819, 'misiorowski', 'A four-seamer at 101 mph, and a curve at 88.', 'power arm'],
  [592332, 'gausman', 'Four-seamer and splitter that look alike until late.', 'splitter'],
  [650911, 'sanchez', 'A lefty’s sinker and changeup.', 'lefty'],
  [519242, 'sale', 'A lefty’s slider that sweeps a foot.', 'lefty, big slider'],
  [605400, 'nola', 'Lives on the knuckle curve.', 'knuckle curve'],
  [695243, 'miller', 'A closer: 101 mph and a slider.', 'closer, slider'],
  [643511, 'rogers', 'A submariner: an 83 mph sinker from below the knees.', 'submariner'],
  [663362, 'waldron', 'A knuckleballer, with fastballs to keep hitters honest.', 'knuckleball'],
];

// Statcast's zones: 1 to 9 are the strike zone in thirds, from the top row down and from the catcher's left; 11 to 14
// are the four quarters around it (high and to his left, high and right, low and left, low and right).
const ZONES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '11', '12', '13', '14'];

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
// A foul tip is a swing that nicks the ball into the catcher's glove: a strike, and one of Statcast's whiffs.
const tips = await one([['hfPR', ['foul_tip']]]);
const league = {
  ...pick(all, ['pitches', 'pa', 'so', 'bb', 'hits', 'singles', 'doubles', 'triples', 'hrs', 'swings', 'whiffs', 'takes', 'bip']),
  hbp: n(hbp), called: n(called), balls: n(balls), tips: n(tips),
  zone: { pitches: n(zone), swings: num(zone.swings) || 0, whiffs: num(zone.whiffs) || 0, called: n(calledZone) },
};

console.log('by count');
const counts = {};
for (const c of COUNTS) {
  const r = await one([['hfC', [c]]]);
  const z = await one([['hfC', [c]], ['hfZ', IN_ZONE]]);
  const fb = await one([['hfC', [c]], ['hfPT', FASTBALLS]]);
  const cs = await one([['hfC', [c]], ['hfPR', ['called_strike']]]);
  const csZone = await one([['hfC', [c]], ['hfPR', ['called_strike']], ['hfZ', IN_ZONE]]);
  // Contact is a swing that isn't one of Statcast's whiffs (which take in foul tips); what of it wasn't put in play
  // was fouled off. Called strikes are per pitch taken, in the zone and out of it.
  const contact = num(r.swings) - num(r.whiffs), takesZone = num(z.takes), takesOut = num(r.takes) - takesZone;
  counts[`${c[0]}-${c[1]}`] = {
    pitches: n(r), zone: round(n(z) / n(r), 3), fastball: round(n(fb) / n(r), 3), swing: round(num(r.swings) / n(r), 3), whiff: round(num(r.whiffs) / num(r.swings), 3),
    foul: round((contact - num(r.bip)) / contact, 3), calledZone: round(n(csZone) / takesZone, 3), calledOut: round((n(cs) - n(csZone)) / takesOut, 3),
  };
}

console.log('by zone');
const zones = {};
for (const zn of ZONES) zones[zn] = pick(await one([['hfZ', [zn]]]), ['pitches', 'swings', 'whiffs', 'bip', 'singles', 'doubles', 'triples', 'hrs']);

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

// The platoon split: each hand of pitcher to each side of the plate (RL is a right-hander to left-handed batters), with
// the strikeouts, walks, batters hit and hits, and the swings and misses in the zone and out of it; and, for each kind of
// pitch, the share of right-handers' pitches it was to right-handed batters and to left-handed ones (mix), so the
// league-average righty's mix can follow the batter.
console.log('platoon');
const SIDES = ['R', 'L'];
league.platoon = {};
for (const h of SIDES) for (const b of SIDES) {
  const hand = [['pitcher_throws', h], ['batter_stands', b]], z = await one([...hand, ['hfZ', IN_ZONE]]);
  league.platoon[h + b] = {
    ...pick(await one(hand), ['pitches', 'pa', 'so', 'bb', 'bip', 'singles', 'doubles', 'triples', 'hrs', 'swings', 'whiffs']),
    hbp: n(await one([['hfPR', ['hit_by_pitch']], ...hand])), zone: { pitches: n(z), swings: num(z.swings) || 0, whiffs: num(z.whiffs) || 0 },
  };
}
for (const [t, v] of Object.entries(types)) {
  v.mix = {};
  for (const b of SIDES) v.mix[b] = round(n(await one([['hfPT', [t]], ['pitcher_throws', 'R'], ['batter_stands', b]])) / league.platoon[`R${b}`].pitches, 4);
}

// How much a pitcher's speed varies from pitch to pitch, for each kind of pitch: the spread about his average in each
// game, so a slow April or a tired September doesn't count as spread. `spreads` gathers pitch-by-pitch rows, by pitcher,
// game and kind of pitch, and `sd` gives the spread for each kind, pooled over every pitcher and game.
const spreads = () => ({});
function addSpread(S, r) {
  const v = num(r.release_speed);
  if (v == null || !r.pitch_type) return;
  const k = `${r.pitcher}|${r.game_pk}|${r.pitch_type}`, g = S[k] ||= { t: r.pitch_type, n: 0, s: 0, ss: 0 };
  g.n++; g.s += v; g.ss += v * v;
}
function sd(S) {
  const by = {};
  for (const g of Object.values(S)) {
    if (g.n < 2) continue;
    const t = by[g.t] ||= { dev: 0, df: 0 };
    t.dev += g.ss - (g.s * g.s) / g.n; t.df += g.n - 1;
  }
  return Object.fromEntries(Object.entries(by).map(([t, v]) => [t, round(Math.sqrt(v.dev / v.df), 2)]));
}

// How much likelier a miss is right after a pitch 6 mph apart than right after the same pitch, as the log of the
// Mantel-Haenszel odds ratio over `strata` ({ same: [swings, whiffs], apart: [swings, whiffs] } each): 0 for no
// difference, above it for more misses after a change of speed. With the swings in each, `apart` and `same`.
function oddsAfter(strata) {
  let num = 0, den = 0, apart = 0, same = 0;
  for (const { same: [n0, w0], apart: [n1, w1] } of Object.values(strata)) {
    if (!n0 || !n1) continue;
    num += (w1 * (n0 - w0)) / (n0 + n1); den += (w0 * (n1 - w1)) / (n0 + n1);
    apart += n1; same += n0;
  }
  return { lor: round(Math.log(num / den), 3), apart, same };
}

console.log('pitchers');
const totals = Object.fromEntries((await search(season, [], 'name')).map(r => [r.player_id, r]));
const own = {};
for (const [id] of PITCHERS) {
  const S = spreads();
  for (const r of await details(season, { pitcher: id })) addSpread(S, r);
  own[id] = sd(S);
}
const rows = {};
for (const t of TYPES) {
  for (const r of await search(season, [['hfPT', [t]]], 'name')) (rows[r.player_id] ||= []).push({ t, r });
}
// Each pitcher's batters hit by a pitch, and how many of each of his pitches crossed in the zone.
const hbpOf = Object.fromEntries((await search(season, [['hfPR', ['hit_by_pitch']]], 'name')).map(r => [r.player_id, n(r)]));
const inZone = {};
for (const t of TYPES) {
  for (const r of await search(season, [['hfPT', [t]], ['hfZ', IN_ZONE]], 'name')) (inZone[r.player_id] ||= {})[t] = n(r);
}
// And each pitcher's batters and pitches on each side of the plate: all his pitches, and of each kind.
const toSide = { R: {}, L: {} };
for (const b of SIDES) {
  for (const r of await search(season, [['batter_stands', b]], 'name')) Object.assign(toSide[b][r.player_id] ||= {}, { pa: num(r.pa), all: n(r) });
  for (const t of TYPES) for (const r of await search(season, [['hfPT', [t]], ['batter_stands', b]], 'name')) (toSide[b][r.player_id] ||= {})[t] = n(r);
}
const pitchers = PITCHERS.map(([id, key, line, tag]) => {
  const mine = rows[id] || [];
  const total = mine.reduce((s, x) => s + n(x.r), 0);
  if (!total) throw new Error(`no ${season} pitches for ${key} (${id})`);
  const sideOf = mine.reduce((s, x) => s + (num(x.r.release_pos_x) || 0) * n(x.r), 0) / total;
  const t = totals[id] || {};
  return {
    key, line, tag,
    name: mine[0].r.player_name.split(', ').reverse().join(' '),
    hand: sideOf < 0 ? 'R' : 'L',
    pa: num(t.pa), paBy: Object.fromEntries(SIDES.map(b => [b, toSide[b][id]?.pa || 0])), so: num(t.so), bb: num(t.bb), hbp: hbpOf[id] || 0,
    bip: num(t.bip), singles: num(t.singles), doubles: num(t.doubles), triples: num(t.triples), hrs: num(t.hrs),
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
        zone: round((inZone[id]?.[t] || 0) / n(r), 3),
        mix: Object.fromEntries(SIDES.map(b => [b, round((toSide[b][id]?.[t] || 0) / (toSide[b][id]?.all || 1), 3)])),
        bip: num(r.bip), hits: num(r.hits), hrs: num(r.hrs),
        sd: own[id][t] ?? null,
      })),
  };
});

// Every sixth day of the season, pitch by pitch.
console.log('pitch by pitch, every sixth day');
const SWINGS = new Set(['swinging_strike', 'swinging_strike_blocked', 'foul_tip', 'foul', 'hit_into_play']);
const WHIFFS = new Set(['swinging_strike', 'swinging_strike_blocked', 'foul_tip']);
const league6 = spreads(), sz = { n: 0, top: 0, bottom: 0 }, after = {}, woba = {};
let days = 0, sampled = 0;
for (let d = new Date(Date.UTC(season, 2, 1)); d < new Date(Date.UTC(season, 9, 15)); d.setUTCDate(d.getUTCDate() + 6)) {
  const day = d.toISOString().slice(0, 10), rows = await details(season, { day });
  if (!rows.length) continue;
  days++; sampled += rows.length;
  for (const r of rows) {
    addSpread(league6, r);
    if (num(r.sz_top) != null && num(r.sz_bot) != null) { sz.n++; sz.top += num(r.sz_top); sz.bottom += num(r.sz_bot); }
    if (r.events && r.woba_denom === '1') (woba[r.events] ||= {})[r.woba_value] = (woba[r.events][r.woba_value] || 0) + 1;
  }
  // Each swing beside the pitch before it in the same plate appearance: the same kind of pitch, or one at least 6 mph
  // faster or slower. Compared within the same pitcher, kind of pitch, count and where it crossed (in the zone, above
  // it or below it), so a pitcher who repeats his best pitch, or a slider in the dirt with two strikes, isn't counted
  // as the speed change.
  const seq = rows.filter(r => r.pitch_type && num(r.release_speed) != null)
    .sort((a, b) => a.game_pk - b.game_pk || a.at_bat_number - b.at_bat_number || a.pitch_number - b.pitch_number);
  seq.forEach((r, i) => {
    const p = seq[i - 1];
    if (!SWINGS.has(r.description) || !p || p.game_pk !== r.game_pk || p.at_bat_number !== r.at_bat_number) return;
    const rel = p.pitch_type === r.pitch_type ? 'same' : Math.abs(num(p.release_speed) - num(r.release_speed)) >= 6 ? 'apart' : null;
    if (!rel) return;
    const zone = Number(r.zone), where = zone <= 9 ? 'in' : zone <= 12 ? 'high' : 'low';
    for (const t of [r.pitch_type, 'all']) {
      const g = ((after[t] ||= {})[`${r.pitcher}|${r.pitch_type}|${r.balls}-${r.strikes}|${where}`] ||= { same: [0, 0], apart: [0, 0] })[rel];
      g[0]++; if (WHIFFS.has(r.description)) g[1]++;
    }
  });
}
const spread = sd(league6);
for (const [t, v] of Object.entries(types)) {
  v.sd = spread[t] ?? null;
  if (after[t]) v.after = oddsAfter(after[t]);
}
league.after = oddsAfter(after.all);
// What Statcast's wOBA counts each way of reaching base as (its woba_value, the same for every one of them in a season).
const weight = e => Number(Object.entries(woba[e] || { 0: 1 }).sort((a, b) => b[1] - a[1])[0][0]);
league.woba = { BB: weight('walk'), HBP: weight('hit_by_pitch'), '1B': weight('single'), '2B': weight('double'), '3B': weight('triple'), HR: weight('home_run') };
// The zone for each batter is set from his height; this is the average, in feet above the ground at the front of the
// plate, of the top and bottom Statcast gives with every pitch. A strike is any part of the ball over the plate between
// them, so Statcast's zones 1 to 9 take the ball's middle up to a ball's width past each edge.
league.sz = { top: round(sz.top / sz.n, 3), bottom: round(sz.bottom / sz.n, 3), days, pitches: sampled };

const stamp = new Date().toISOString().slice(0, 10);
const js = `// Made by tools/league.mjs from Baseball Savant's Statcast search on ${stamp}: the ${season} regular season.
// LEAGUE is every pitch; zone is the nine boxes of Statcast's strike zone, and tips the foul tips among its whiffs.
// sz is the zone's average top and bottom (feet), and woba what Statcast's wOBA counts each way of reaching base as,
// both from every sixth day's pitches. COUNTS and TYPES give shares of pitches: how many were in the zone, fastballs
// (four-seam, sinker, cutter), swung at, and missed per swing; COUNTS also the share of contact fouled off, and of
// pitches taken that were called strikes, in the zone and out of it. TYPES also: sd, how far a pitcher's speed strays
// from his average pitch to pitch (mph). after, in LEAGUE and each of TYPES, from every sixth day: lor, how much likelier
// a swing missed right after a pitch at least 6 mph faster or slower than right after the same kind of pitch (the log
// of the odds ratio, within the same pitcher, kind of pitch, count and height; 0 is no different), and the swings
// compared. ZONES: each Statcast zone. platoon, in LEAGUE: each hand of pitcher to each side of the plate (RL, a
// right-hander to left-handed batters); mix, in each of TYPES: the share of right-handers' pitches to right-handed (R)
// and left-handed (L) batters that were that kind.
// PITCHERS: the arsenals you can pitch as, with their season's plate appearances (paBy: to right- and left-handed
// batters), strikeouts, walks, batters hit by a pitch, balls in play, and singles, doubles, triples and home runs
// against them. side is feet from the middle of the rubber at release, toward the arm side; sd as TYPES's, from all of
// his pitches; zone, the share of the pitch that crossed in the zone; bip, hits and hrs, its balls in play, and the hits
// and home runs among them; mix, its share of his pitches to right-handed (R) and left-handed (L) batters.
export const LEAGUE = ${JSON.stringify(league)};
export const COUNTS = ${JSON.stringify(counts, null, 1)};
export const TYPES = ${JSON.stringify(types, null, 1)};
export const ZONES = ${JSON.stringify(zones, null, 1)};
export const PITCHERS = ${JSON.stringify(pitchers, null, 1)};
`;
await writeFile(join(root, 'js/league.js'), js);
console.log(`wrote js/league.js: ${league.pitches} pitches, ${league.pa} plate appearances`);
