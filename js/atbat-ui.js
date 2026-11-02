// "Pitch to a hitter": call each pitch and a spot, watch it from behind the plate, and read why it went how it did.
import { Stage } from './stage.js';
import { PITCHERS, pitcherByKey, startAtBat, throwCall, autoCall, whatIf, mixFor, HITTER_TYPES, hitterByKey, SPOTS, spotById, spotXZ, spotName, linkFor, parseLink, VERSION } from './atbat.js';
import { resultWord, why, note, calledLine, ENDING, NAME, timing, thoughtMiss } from './atbat-words.js';
import { markKind, readoutRoom, boardRoom, MISSED } from './tracker.js';
import { BY_CODE } from './pitches.js';
import { newSeed } from './rng.js';
import { COUNTS, HITTERS, LEAGUE } from './league.js';
import { DECIDE } from './flight.js';

const $ = id => document.getElementById(id);
const pct = v => `${Math.round(v * 100)}%`;
const SHORT = code => BY_CODE[code]?.short || NAME[code];
const lower = s => s[0].toLowerCase() + s.slice(1);
const plural = (n, one) => `${n} ${one}${n === 1 ? '' : one.endsWith('h') ? 'es' : 's'}`;
// Each kind of hitter as the caption puts him, from the quarter of 2026's qualified hitters he's tuned to (js/league.js).
// It follows the pitcher's line, so it starts with the batter, or its "he" would read as the pitcher. Only what he's tuned
// to is said of him: the power hitter does as much damage on contact as his quarter, but isn't tuned to their home runs.
const QUARTER = key => {
  const h = HITTERS[key], chase = (h.swings - h.zoneSwings) / (h.pitches - h.zone);
  return {
    free: `The batter is a free swinger: he chases ${pct(chase)} of pitches out of the zone, as the quarter of 2026’s qualified hitters who chased most did.`,
    patient: `The batter is patient: he chases ${pct(chase)} of pitches out of the zone, as the quarter of 2026’s qualified hitters who chased least did.`,
    contact: `The batter is a contact hitter: he misses ${pct(h.whiffs / h.swings)} of his swings, as the quarter of 2026’s qualified hitters who missed least did.`,
    power: `The batter is a power hitter: he hits the ball as hard as the quarter of 2026’s qualified hitters with the most power, who hit a home run on ${pct(h.hrs / h.bip)} of the balls they put in play.`,
  }[key];
};
// The batter, for what a screen reader hears and the notice says: "a right-handed batter", "a patient left-handed hitter".
const batterWords = (side, hitter) => {
  const hand = `${side === 'R' ? 'right' : 'left'}-handed`;
  return { average: `a ${hand} batter`, free: `a ${hand} free swinger`, patient: `a patient ${hand} hitter`, contact: `a ${hand} contact hitter`, power: `a ${hand} power hitter` }[hitter] || `a ${hand} batter`;
};
// How each ending goes in a scorebook. A strikeout looking is the same K, drawn backwards.
const SCOREBOOK = { K: 'K', KL: 'K', BB: 'BB', HBP: 'HBP', out: 'Out', '1B': '1B', '2B': '2B', '3B': '3B', HR: 'HR' };

export function setupAtBat({ dark = false } = {}) {
  const S = { pitcher: PITCHERS[0], batter: 'R', hitter: 'average', seed: newSeed(), ab: null, calls: [], code: null, spot: spotById('1m1'), busy: false, speed: 1, asked: 0, open: null, watching: null, visit: [] };
  const stage = new Stage($('ab-flight'), { onArrive: () => (S.watching ? watched() : land()) });
  // On a phone the picture stays at the top of the screen (css/app.css), and what's scrolled into view stops below it.
  // The words over its top-left corner stop short of the high spot off the plate on that side, inside to a righty and
  // away to a lefty, which are in the same place, and wrap to fit (--ro-max, css/app.css); the radar board in its
  // top-right corner stops short of the one on the other side (--rb-max).
  const frame = $('ab-flight').parentElement, corner = spotXZ(spotById('2m2'), 'R');
  new ResizeObserver(() => {
    $('at-bat').style.setProperty('--ab-frame', `${Math.ceil(frame.getBoundingClientRect().height)}px`);
    const { W, H, dpr } = stage.size();
    frame.style.setProperty('--ro-max', `${Math.floor(readoutRoom(W, H, dpr, corner) * 10) / 10}px`);
    frame.style.setProperty('--rb-max', `${Math.floor(boardRoom(W, H, dpr, corner) * 10) / 10}px`);
  }).observe(frame);
  // Into view, and out from behind the picture: the browser counts what's behind it as in view. Beside the picture (on a
  // computer, or a phone held sideways) something whose top is off the top of the screen is brought down whole too.
  const behind = el => {
    const top = el.getBoundingClientRect().top;
    return top < 0 || (getComputedStyle(frame).position === 'sticky' && top < frame.getBoundingClientRect().bottom);
  };
  const reveal = el => el.scrollIntoView({ block: behind(el) ? 'start' : 'nearest' });
  // Anything reached with the keyboard: the pitch controls, and the pitcher, batter and speed above them, which scroll
  // away under the picture. A button in a .seg is brought out by its row: the row clips its buttons, so the browser would
  // scroll it alone and leave the button behind the picture. (Not the section itself, which the lede's link focuses as
  // it goes down to it.)
  $('at-bat').addEventListener('focusin', e => { if (e.target !== e.currentTarget && !frame.contains(e.target) && e.target.matches(':focus-visible')) reveal(e.target.closest('.seg') || e.target); });
  // Framed for the at-bat (atBatCamera): from the pitcher's hand down to a pitch in the dirt.
  stage.set({ view: 'catcher', ghost: false, color: '#ffd23f', dark, atBat: true });

  // ---------------------------------------------------------------- controls
  // Each with what he is, so the list itself tells Tyler Rogers from Aaron Nola, and the lefties apart.
  $('ab-pitcher').innerHTML = PITCHERS.map(p => `<option value="${p.key}">${p.name}${p.tag ? ` – ${p.tag}` : ''}</option>`).join('');
  // Another pitcher or batter faces a new hitter. The same seed would bring back the same one, guessing the same pitches,
  // so switching away and back would be a do-over against a hitter you already know.
  $('ab-pitcher').addEventListener('change', e => { S.pitcher = pitcherByKey(e.target.value); S.seed = newSeed(); fresh({ picked: true, changed: true }); });
  seg('ab-batter', v => { S.batter = v; S.seed = newSeed(); fresh({ picked: true, changed: true }); });
  // And another kind of hitter, beside the batter's side: the average one, or a free swinger, a patient, contact or power
  // hitter, each like a quarter of 2026's qualified hitters.
  $('ab-hitter').innerHTML = HITTER_TYPES.map(h => `<option value="${h.key}">${h.name}</option>`).join('');
  $('ab-hitter').addEventListener('change', e => { S.hitter = hitterByKey(e.target.value).key; S.seed = newSeed(); fresh({ picked: true, changed: true }); });
  seg('ab-speed', v => { S.speed = Number(v); stage.set({ speed: S.speed }); });
  $('ab-throw').addEventListener('click', () => pitch());
  // The pitches and the spots are each a group of radio buttons: one stop for Tab, at the one picked, and the arrow keys
  // pick another. Picked, one is checked where it is (drawCall), so focus stays on it.
  $('ab-pitches').addEventListener('click', e => { const b = e.target.closest('button'); if (b) choose(b); });
  $('ab-spots').addEventListener('click', e => { const b = e.target.closest('button'); if (b) choose(b); });
  // Along the pitches, Right and Down go to the next one and Left and Up the one before, round from the end to the
  // start, and Home and End go to the first and the last.
  $('ab-pitches').addEventListener('keydown', e => {
    const all = [...$('ab-pitches').children], i = all.indexOf(e.target), n = all.length;
    const to = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: n - 1 }[e.key];
    if (i < 0 || to === undefined || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    choose(all[(to + n) % n], true);
  });
  // On the grid they go the way they point, as it's drawn: Left and Right a column, Up and Down a row, stopping at its
  // edge, and Home and End to the ends of the row (with Ctrl, the first and last spots).
  $('ab-spots').addEventListener('keydown', e => {
    const all = [...$('ab-spots').children], i = all.indexOf(e.target), r = Math.floor(i / 5), c = i % 5;
    const to = { ArrowLeft: [r, c - 1], ArrowRight: [r, c + 1], ArrowUp: [r - 1, c], ArrowDown: [r + 1, c], Home: [e.ctrlKey ? 0 : r, 0], End: [e.ctrlKey ? 4 : r, 4] }[e.key];
    if (i < 0 || !to || e.altKey || e.metaKey) return;
    e.preventDefault();
    const [row, col] = to.map(v => Math.max(0, Math.min(4, v)));
    choose(all[row * 5 + col], true);
  });
  // While a pitch is in the air, the catcher's call and the hundred throws wait for it to land: the model has already
  // thrown it, so either would give away how it went.
  // The catcher's call is one the way pitchers call them in this count to this batter (autoCall), and then what big
  // leaguers did in it, from the numbers the hitter is tuned to. Asked again in the same count, he calls another, so a
  // few taps show the range. It's worked out on a copy of the at-bat, so asking doesn't change what happens next.
  $('ab-suggest').addEventListener('click', () => {
    if (S.busy || S.ab.result) return;
    const count = `${S.ab.balls}-${S.ab.strikes}`, k = COUNTS[count];
    let c;
    // Another call than the one picked now, if one comes up in a few tries.
    for (let tries = 0; tries < 8; tries++) {
      const look = startAtBat({ pitcher: S.pitcher, batter: S.batter, seed: (S.seed + S.calls.length * 7919 + 1 + S.asked++ * 104729) >>> 0 });
      look.balls = S.ab.balls; look.strikes = S.ab.strikes;
      c = autoCall(look);
      if (c.code !== S.code || c.spot !== S.spot) break;
    }
    S.code = c.code; S.spot = c.spot;
    drawCall();
    const said = `A typical call to a ${S.batter === 'R' ? 'right' : 'left'}-handed batter in a ${count} count: ${NAME[c.code]}, ${spotName(c.spot)}. In ${count} counts in 2026, ${pct(k.fastball)} of pitches were fastballs and ${pct(k.zone)} were in the zone; hitters swung at ${pct(k.swing)}.`;
    $('ab-hint').textContent = said;
    $('ab-live').textContent = said;
  });
  // The next hitter: the pitch controls come back where the result was, and into view (under the picture, on a phone),
  // with focus on Throw, the button that was gone with the end card.
  $('ab-next').addEventListener('click', () => {
    S.seed = newSeed();
    fresh({ picked: true });
    reveal($('ab-callbox'));
    $('ab-throw').focus({ preventScroll: true });
  });
  $('ab-copy').addEventListener('click', copyLink);
  for (const id of ['ab-watch', 'ab-watch-link']) $(id).addEventListener('click', () => watch());
  // Where the clipboard is refused, the link is in a field to copy by hand: all of it is selected whenever it's touched.
  for (const ev of ['focus', 'click']) $('ab-link').addEventListener(ev, () => $('ab-link').select());
  $('ab-run').addEventListener('click', () => { if (!S.busy && !S.charting) hundred(); });
  // Each pitch in the log is a button: tapped, it opens why that pitch went the way it did, under it, and brings its mark
  // to the front of the picture (openRow). Tapped again, it closes. Not while a pitch flies: the log is a pitch behind.
  $('ab-log').addEventListener('click', e => {
    const b = e.target.closest('button[data-i]');
    if (b && !S.busy) openRow(S.open === Number(b.dataset.i) ? null : Number(b.dataset.i));
  });

  function seg(id, on) {
    const box = $(id);
    box.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      for (const x of box.querySelectorAll('button')) x.setAttribute('aria-pressed', String(x === b));
      on(b.dataset.v);
    });
  }

  // ---------------------------------------------------------------- an at-bat
  const who = () => (S.pitcher.key === 'average' ? 'the league-average righty' : S.pitcher.name);
  // A new at-bat. `picked` is one started here, with another pitcher or batter or Next hitter, rather than by the page
  // opening or a link: a screen reader hears who's up now, and an at-bat link in the address gives way to this one, so a
  // reload doesn't bring the old at-bat back. (A link opening calls this before it replays its pitches, so writing the
  // address then would cut the link short. On a plain page the address waits for the first pitch.) `changed` is another
  // pitcher or batter: if that cut short an at-bat with pitches in it, wiping its count, marks and log, it says so
  // under Throw too, for everyone to see.
  function fresh({ keepCalls = false, picked = false, changed = false } = {}) {
    const cut = changed && S.ab?.pitches.length > 0;
    // An at-bat that ended on a pitch thrown here goes into this visit's tally (drawTally) as the next one starts.
    if (S.ab?.result && S.ab.here) S.visit.push(S.ab.result);
    S.ab = startAtBat({ pitcher: S.pitcher, batter: S.batter, hitter: S.hitter, seed: S.seed });
    S.asked = 0;
    if (!keepCalls) S.calls = [];
    S.code = S.pitcher.pitches[0].code;
    S.spot = spotById(S.pitcher.pitches[0].code === 'SI' ? 'm1m1' : '1m1');
    stopWatch();
    S.busy = false;
    S.pending = null;
    S.open = null;
    stopChart();
    // The pitcher's name, set apart from his line (which can have a colon of its own: "A submariner: an 83 mph sinker"),
    // and the kind of hitter, when he isn't the average one.
    const name = document.createElement('b');
    name.textContent = `${S.pitcher.name}.`;
    $('ab-line').replaceChildren(name, ` ${S.pitcher.line}${S.hitter === 'average' ? '' : ` ${QUARTER(S.hitter)}`}`);
    $('ab-pitcher').value = S.pitcher.key;
    $('ab-hitter').value = S.hitter;
    for (const b of $('ab-batter').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.v === S.batter));
    stage.set({ hand: S.pitcher.hand, batter: S.batter, marks: [] });
    stage.clear();
    $('ab-chart').replaceChildren();
    $('ab-hint').textContent = '';
    buildCall();
    drawState();
    $('ab-notice').textContent = '';
    $('ab-watch-link').hidden = true;
    $('ab-version').textContent = '';
    if (picked) {
      const said = `New at-bat: ${who()} to ${batterWords(S.batter, S.hitter)}.`;
      $('ab-live').textContent = said;
      if (cut) $('ab-hint').textContent = said;
      if (location.hash.startsWith('#ab.')) stamp();
    }
  }

  function pitch() {
    if (S.busy || S.ab.result || !S.code) return;
    if (S.open != null) openRow(null);
    const call = { code: S.code, spot: S.spot };
    const rec = throwCall(S.ab, call);
    S.ab.here = true;
    S.calls.push(call);
    stamp();
    stopChart();
    S.busy = true;
    S.pending = rec;
    S.asked = 0;
    waiting();
    $('ab-hint').textContent = '';
    // A link's notice was about what it replayed; from here on the at-bat is this one.
    $('ab-notice').textContent = '';
    $('ab-watch-link').hidden = true;
    $('ab-version').textContent = '';
    fly(rec);
  }

  // Throw a pitch that has already happened in the model: the marks so far, in the readout what's coming, and its
  // speed on the radar board, as a stadium's shows it out of the pitcher's hand.
  function fly(rec) {
    readout(`Pitch ${rec.n}`);
    board(rec);
    drawPicture();
    cue(rec);
    stage.set({ marks: markList(S.ab.pitches.slice(0, -1)) });
    stage.show([rec.path]);
  }

  // The ball has reached the plate: show what happened.
  function land() {
    if (!S.pending) return;
    const calling = $('ab-callbox').contains(document.activeElement);
    S.pending = null;
    S.busy = false;
    // The hitter's read goes as the ball gets to the plate (cue).
    cueFrame.classList.remove('deciding');
    // Its mark grows in as it lands, as what happened comes up in the readout.
    stage.set({ marks: marks(S.ab.pitches), grow: true });
    drawState();
    say();
    $('ab-chart').replaceChildren();
    if (!S.ab.result) return;
    // The result card takes the pitch controls' place; if that's behind the picture, bring it out. Focus was in the
    // controls, now hidden, so it goes to the result rather than back to the top of the page.
    if (behind($('ab-end'))) $('ab-end').scrollIntoView({ block: 'start' });
    if (calling) $('ab-result').focus({ preventScroll: true });
  }

  // A no-break space keeps "mph" with its number wherever a line wraps, as on the card, and one before each separating
  // dot keeps it at the end of a line rather than the start of the next.
  const speed = p => `${p.mph.toFixed(1)}\u00a0mph`;
  // The line under the count: what's coming or what happened, and at the end how many pitches it took, wrapping to fit
  // (css/app.css). What happened is in a tag coloured like its mark (`kind`: strike, ball or play), so it reads at a
  // glance as the mark lands.
  const readout = (what = '', more = '', kind = '') => {
    $('ab-ro').innerHTML = what && `${kind ? `<b class="tag k-${kind}">${what}</b>` : what}${more ? `<span class="sep">\u00a0· </span><span>${more}</span>` : ''}`;
  };
  // The pitch's speed, big in the top-right corner as on a stadium's radar board, with its name under it. A name that
  // has to wrap goes over two lines at its space ("knuckle" over "curve"), never at its hyphen ("four-" over "seamer").
  const board = p => {
    $('ab-board').innerHTML = p ? `<div class="speed"><b>${p.mph.toFixed(1)}</b>\u00a0<span>mph</span></div><div class="nm">${NAME[p.code].split(' ').map(w => `<span class="nw">${w}</span>`).join(' ')}</div>` : '';
  };

  function marks(ps) {
    return ps.map(p => ({ x: p.plate[0], z: p.plate[1], n: p.n, kind: markKind(p.result) }));
  }
  // The same, with the pitch whose row is open in the log last, so it's drawn on top as the newest is: whole, with its
  // thicker white edge, over any that crossed where it did.
  function markList(ps) {
    const ms = marks(ps), i = S.open;
    return i == null || i >= ms.length ? ms : [...ms.slice(0, i), ...ms.slice(i + 1), ms[i]];
  }

  // What a screen reader hears as a pitch lands: which pitch, where it was called (and crossed, if somewhere else), what
  // happened and the count, then why, so even three fouls in a row are three new lines. At the end, how it ended and
  // the scout's note.
  function say(i = S.ab.pitches.length - 1) {
    const ab = S.ab, p = ab.pitches[i];
    $('ab-live').textContent = ab.result && i === ab.pitches.length - 1
      ? `${ENDING[ab.result]} on a ${p.before.balls}-${p.before.strikes} pitch. ${note(ab)}`
      : `Pitch ${p.n}, ${NAME[p.code]}, ${calledLine(p, ab.batter)}: ${lower(resultWord(p))}. ${p.after.balls} and ${p.after.strikes}. ${why(p, ab.pitches[i - 1], ab.batter)}`;
  }

  // ---------------------------------------------------------------- drawing
  // The pitches and spots, for this pitcher and batter. They're made again only when one of those changes (fresh), so
  // a button with focus is never swapped for a new one. A pitch's share is of what he threw to this batter's side of the
  // plate, and it's read out in full: "Four-seam, 97 mph, 35% of his pitches to right-handed batters".
  function buildCall() {
    const mix = mixFor(S.pitcher, S.batter), to = S.batter === 'R' ? 'right' : 'left';
    $('ab-pitches').innerHTML = S.pitcher.pitches.map((p, i) => {
      const mph = p.mph.toFixed(0), share = pct(mix[i]);
      return `<button type="button" role="radio" class="ab-chip fam-${BY_CODE[p.code]?.fam || 'odd'}" data-code="${p.code}" aria-checked="false" tabindex="-1" aria-label="${SHORT(p.code)}, ${mph} mph, ${share} of his pitches to ${to}-handed batters"><span class="key" aria-hidden="true"></span>${SHORT(p.code)} <small>${mph}\u00a0mph\u00a0· ${share}</small></button>`;
    }).join('');
    // The grid as the catcher sees it: a right-handed hitter on the left, so his inside is on the left.
    const cols = S.batter === 'R' ? [-2, -1, 0, 1, 2] : [2, 1, 0, -1, -2];
    $('ab-spots').innerHTML = [2, 1, 0, -1, -2].flatMap(r => cols.map(c => {
      const spot = SPOTS.find(s => s.c === c && s.r === r), name = spotName(spot);
      return `<button type="button" role="radio" class="spot${spot.zone ? ' in' : ''}" data-spot="${spot.id}" aria-label="${name}" title="${name}" aria-checked="false" tabindex="-1"></button>`;
    })).join('');
    $('ab-side').innerHTML = S.batter === 'R' ? '<span aria-hidden="true">←</span> Right-handed batter' : 'Left-handed batter <span aria-hidden="true">→</span>';
    $('ab-side').className = `side ${S.batter === 'R' ? 'left' : 'right'}`;
    drawCall();
  }

  // A pitch or a spot picked, by a tap or with the arrow keys (`keys`, which take focus along with them). Picked by hand,
  // the catcher's call under Throw no longer stands.
  function choose(b, keys = false) {
    if (b.dataset.code) S.code = b.dataset.code;
    else S.spot = spotById(b.dataset.spot);
    if (S.open != null) openRow(null);
    drawCall();
    $('ab-hint').textContent = '';
    if (keys) b.focus();
  }

  // The call as it stands: the pitch and spot checked, each the one stop for Tab in its group, and in words.
  function drawCall() {
    const mark = (b, on) => { b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; };
    for (const b of $('ab-pitches').children) mark(b, b.dataset.code === S.code);
    for (const b of $('ab-spots').children) mark(b, b.dataset.spot === S.spot.id);
    $('ab-choice').textContent = S.code ? `${SHORT(S.code)}, ${spotName(S.spot)}` : '';
    drawPicture();
  }

  // On the picture, the catcher's target where the pitch is called (while one flies, where it was called), so picking
  // another spot moves it there at once; and once a pitch is in, a line from the target to where it crossed, if it missed
  // by more than 6 inches. The line is the last pitch's: it goes with the target when another spot is picked. And once
  // it's in, where the hitter swung at it, "early" or "late" if he missed out in front or behind, or for a strike he
  // took thinking it would miss, where he thought it would cross. Only the last pitch's, so the picture doesn't clutter,
  // or with a row of the log open, that pitch's: where it was called, its line and where he swung.
  function drawPicture() {
    const w = S.watching, ps = S.ab.pitches;
    // Watching it again, the pitch being thrown again stands for the last: in the air (`p`), or once it's in.
    const p = w ? (w.landed ? null : ps[w.i]) : S.pending;
    const open = !w && !p && S.open != null ? ps[S.open] : null, last = p ? null : w ? ps[w.i] : open || ps.at(-1);
    const spot = p ? p.spot : w ? last.spot : open ? open.spot : S.spot;
    const missed = last && last.spot.id === spot.id && Math.hypot(last.plate[0] - last.aim[0], last.plate[1] - last.aim[1]) > MISSED;
    let swing = null;
    if (last?.swing) swing = { at: [last.plate[0] - last.miss[0], last.plate[1] - last.miss[1]], to: last.plate, tag: last.result === 'whiff' ? timing(last) : '' };
    else if (last?.result === 'called' && last.inZone && thoughtMiss(last)) swing = { at: last.judged, to: last.plate, tag: 'his read' };
    // And the pitch before, faint under it, so two out of the same tunnel are seen to split only after the decision point.
    const prev = (w ? ps[w.i - 1] : ps.at(-2)) || null;
    stage.set({ target: spotXZ(spot, S.batter), miss: missed ? last.plate : null, swing, prev: prev?.path || null });
    // The key to what's drawn faint and dashed, once there's a pitch: the last pitch's path, and the decision ring.
    const key = (prev ? '<span><i class="ln prev"></i>Last pitch</span>' : '') + (ps.length ? '<span><i class="ring"></i><span class="wide">Decision point</span><span class="narrow">Decide</span></span>' : '');
    if ($('ab-legend').innerHTML !== key) $('ab-legend').innerHTML = key;
  }

  // At Slow, as the ball reaches the decision point, the hitter's read comes up over the bottom of the picture, as the
  // explorer's "Decide now" does there: the pitch he's sitting on, and whether he swings. It goes as the ball gets to
  // the plate. (At real speed it would be up for less than a fifth of a second.) It's for the eye: a screen reader hears
  // what he was looking for in the line that says why, once the pitch is in.
  let cueRaf = 0;
  const cueFrame = $('ab-flight').parentElement;
  function cue(rec) {
    cancelAnimationFrame(cueRaf);
    $('ab-cue').textContent = `Sitting on the ${NAME[rec.sat.code]}\u00a0· ${rec.swing ? 'swings' : 'takes'}`;
    const tick = () => {
      const flying = S.pending === rec || (!!S.watching && !S.watching.landed && S.ab.pitches[S.watching.i] === rec);
      const t = stage.gameTime(), on = flying && S.speed < 1 && t >= rec.path.T - DECIDE && t < rec.path.T;
      if (cueFrame.classList.contains('deciding') !== on) cueFrame.classList.toggle('deciding', on);
      if (flying) cueRaf = requestAnimationFrame(tick);
    };
    cueRaf = requestAnimationFrame(tick);
  }

  // The count after `last` (a pitch, or nothing before the first), or once it's `over`, the scorebook's mark for how it
  // ended and the count it ended on. The count is read as "1 ball, 2 strikes", not "1-2, B, S".
  function drawCount(last, over) {
    const balls = last ? last.after.balls : 0, strikes = last ? last.after.strikes : 0, r = S.ab.result;
    const dots = (n, of, cls) => Array.from({ length: of }, (_, i) => `<i class="${i < n ? cls : ''}"></i>`).join('');
    $('ab-count').innerHTML = over
      ? `<span class="ct${r === 'KL' ? ' kl' : ''}" role="img" aria-label="${ENDING[r]}">${SCOREBOOK[r]}</span><span class="on">on a ${last.before.balls}-${last.before.strikes} pitch</span>`
      : `<span class="sr">${plural(balls, 'ball')}, ${plural(strikes, 'strike')}</span><span class="ct" aria-hidden="true">${balls}-${strikes}</span><span class="dots" aria-hidden="true"><b>B</b>${dots(balls, 3, 'b')}</span><span class="dots" aria-hidden="true"><b>S</b>${dots(strikes, 2, 's')}</span>`;
  }

  function drawState() {
    const ab = S.ab;
    const shown = S.pending ? ab.pitches.slice(0, -1) : ab.pitches;
    const last = shown.at(-1);
    const over = ab.result && !S.pending;
    const ended = over && `${last.before.balls}-${last.before.strikes}`;
    drawCount(last, over);
    if (last) {
      // Once it's over the end card has the headline, so this only says why the last pitch went how it did.
      const head = over ? '<p class="lbl">Last pitch</p>' : `<p class="res res-${markKind(last.result)}">${resultWord(last)}</p>`;
      $('ab-last').innerHTML = `${head}<p>${why(last, shown.at(-2), ab.batter)}</p>`;
    } else {
      // Before the first pitch there's nothing to say: how to play is at the top of the call box.
      $('ab-last').replaceChildren();
    }
    drawLog(shown);
    $('ab-end').hidden = !over;
    $('ab-callbox').hidden = !!over;
    // Once it's over, the hundred throws look back at the last pitch.
    $('ab-run').textContent = over ? `What else could he have thrown on that ${ended} pitch?` : 'Throw each of his pitches 400 times from here';
    waiting();
    drawPicture();
    if (over) {
      $('ab-result').textContent = ENDING[ab.result];
      // Coloured like the last pitch's mark and its number in the log: a strikeout red, a walk green, a ball in play blue.
      $('ab-result').className = `end-result res-${markKind(last.result)}`;
      $('ab-note').textContent = note(ab);
      drawTally();
      $('ab-copied').textContent = '';
      $('ab-link').hidden = true;
    }
    // While a pitch flies the readout says what's coming (fly); once it's in, what happened, and the radar board keeps
    // its speed.
    if (!S.pending) {
      if (over) readout(ENDING[ab.result], `${ab.pitches.length} pitch${ab.pitches.length === 1 ? '' : 'es'}`, markKind(last.result));
      else if (last) readout(resultWord(last), '', markKind(last.result));
      else readout();
      board(last);
    }
  }

  // Each pitch: the count it was thrown in, as on a broadcast's pitch list ("on 0-1" to a screen reader), what happened,
  // the spot called and, if it went to another box, where it crossed. Each part keeps the dot after it (a no-break
  // space before it), so a line that wraps doesn't start with one. Each is a button that opens why it went that way
  // (openRow). The rows are made again only when what they say changes, so the one with focus keeps it.
  let logHtml = '';
  function drawLog(shown) {
    const html = shown.map((p, i) => `<li class="k-${markKind(p.result)}"><button type="button" class="row" data-i="${i}" aria-expanded="false"><span class="n">${p.n}</span><span><span class="at"><span class="sr">on </span>${p.before.balls}-${p.before.strikes}</span>\u00a0· <b>${resultWord(p)}</b>\u00a0· ${SHORT(p.code)}, ${calledLine(p, S.ab.batter)}\u00a0· ${speed(p)}</span><span class="more" aria-hidden="true"></span></button></li>`).join('');
    if (html !== logHtml) { $('ab-log').innerHTML = html; logHtml = html; }
    if (S.open != null && S.open >= shown.length) S.open = null;
    // The open row's why, under it: there only while it's open, so the log's words are only what's showing.
    [...$('ab-log').children].forEach((li, i) => {
      const on = i === S.open, b = li.firstElementChild, why$ = li.querySelector('.why');
      b.setAttribute('aria-expanded', String(on));
      if (on && !why$) li.insertAdjacentHTML('beforeend', `<p class="why">${why(shown[i], shown[i - 1], S.ab.batter)}</p>`);
      else if (!on && why$) why$.remove();
    });
  }
  // A row of the log opened (`i`, the pitch's place in the at-bat) or, with null, closed. One is open at a time. Its
  // mark comes to the front of the picture, drawn as the last pitch's is, and the picture shows where the catcher set
  // up for it, the line to where it crossed and where the hitter swung (drawPicture).
  function openRow(i) {
    S.open = i;
    drawLog(S.pending ? S.ab.pitches.slice(0, -1) : S.ab.pitches);
    stage.set({ marks: markList(S.pending ? S.ab.pitches.slice(0, -1) : S.ab.pitches) });
    drawPicture();
  }

  // Under Next hitter, how this visit has gone: every at-bat that ended on a pitch thrown here, this one too, with the
  // pitcher you were, against whoever was up. Kept only while the page is open: Arsenal saves nothing. Beside it, how
  // often big-league batters struck out in 2026 (js/league.js), to measure it by.
  const LEAGUE_K = (100 * LEAGUE.so) / LEAGUE.pa;
  function drawTally() {
    const all = [...S.visit, ...(S.ab.result && S.ab.here ? [S.ab.result] : [])], n = all.length;
    const of = (...keys) => all.filter(r => keys.includes(r)).length;
    const k = of('K', 'KL'), hbp = of('HBP');
    const parts = [plural(n, 'batter'), `${k}\u00a0K`, `${of('BB')}\u00a0BB`, `${of('1B', '2B', '3B', 'HR')}\u00a0H`, ...(hbp ? [`${hbp}\u00a0HBP`] : [])];
    const league = `big-league pitchers struck out ${LEAGUE_K.toFixed(1)}% of batters in 2026`;
    $('ab-tally').textContent = !n ? '' : `This visit: ${parts.join('\u00a0· ')}. ${n === 1 ? `${league[0].toUpperCase()}${league.slice(1)}` : `You struck out ${Math.round((100 * k) / n)}% of them; ${league}`}.`;
  }

  // While a pitch is in the air, Throw and the buttons that would give it away wait (see the listeners above), and while
  // the hundred throws are being thrown, so does their button. They're marked rather than disabled, so the one with focus
  // keeps it.
  function waiting() {
    $('ab-throw').setAttribute('aria-disabled', String(S.busy || !!S.ab.result));
    $('ab-suggest').setAttribute('aria-disabled', String(S.busy));
    $('ab-run').setAttribute('aria-disabled', String(S.busy || !!S.charting));
    for (const id of ['ab-watch', 'ab-watch-link']) $(id).setAttribute('aria-disabled', String(S.busy));
  }

  // ---------------------------------------------------------------- the hundred throws
  // From the count and spot as they stand, before the next pitch. Once the at-bat is over there's no next pitch, so it
  // looks back at the last one instead: the same count, the same spot and the pitch before it, with every pitch he
  // could have thrown there. (whatIf reads the pitcher, the batter, the knobs, the count and the pitches before.)
  // Each pitch is thrown 400 times and shown per 100: at 100 throws a pitch's misses wander by about 8 either way from
  // one chart to the next, enough to put the wrong pitch on top. They're thrown a slice of 100 at a time, one slice a
  // frame, so the page keeps moving and the bars fill as they go; with reduced motion they're drawn once, full.
  const SLICES = 4, PER = 100;
  // The outcomes as the bars draw them, the pitcher's first: the key, the legend's word, and what one and many are called.
  const OUTCOMES = [
    ['whiff', 'Swinging strike', 'swinging strike', 'swinging strikes'], ['called', 'Called strike', 'called strike', 'called strikes'],
    ['foul', 'Foul', 'foul', 'fouls'], ['out', 'Out in play', 'out in play', 'outs in play'], ['ball', 'Ball', 'ball', 'balls'], ['hit', 'Hit', 'hit', 'hits'],
  ];
  const KEYS = ['whiff', 'called', 'foul', 'out', 'ball', 'hbp', 'hit'];
  const counted = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  // Out of 400 into per 100, rounded so each pitch's parts still add up to 100: each part rounded down, and what's left
  // given to the parts that lost the most to rounding.
  function per100(v) {
    const exact = KEYS.map(k => (v[k] * PER) / (SLICES * PER)), out = exact.map(Math.floor);
    const order = exact.map((x, i) => [x - out[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    for (let left = PER - out.reduce((s, x) => s + x, 0), j = 0; left > 0; left--, j++) out[order[j][1]]++;
    return Object.fromEntries(KEYS.map((k, i) => [k, out[i]]));
  }
  // What matters from this count: strikeouts with two strikes, walks with three balls, otherwise strikes and balls.
  // A pitch that hits him isn't a ball or a walk: it's said apart, beside them, when there are any. (On the bar it's in
  // the ball's piece.)
  function summary(v, balls, strikes) {
    const hbp = v.hbp ? [counted(v.hbp, 'hit batter', 'hit batters')] : [];
    const parts = strikes === 2 && balls === 3 ? [counted(v.whiff + v.called, 'strikeout', 'strikeouts'), counted(v.ball, 'walk', 'walks'), ...hbp]
      : strikes === 2 ? [counted(v.whiff + v.called, 'strikeout', 'strikeouts')]
      : balls === 3 ? [counted(v.ball, 'walk', 'walks'), ...hbp]
      : [counted(v.whiff + v.called + v.foul, 'strike', 'strikes'), counted(v.ball, 'ball', 'balls'), ...hbp];
    return [...parts, counted(v.hit, 'hit', 'hits')].join('\u00a0· ');
  }
  let charts = 0, charting = 0;
  // A chart still being thrown stops when the at-bat moves on, and goes rather than stay half full.
  const stopChart = () => { if (S.charting) $('ab-chart').replaceChildren(); charting = 0; S.charting = false; };
  function hundred() {
    const ab = S.ab, last = ab.pitches.at(-1);
    // A copy of where things stand, so a slice thrown a frame later is thrown from the same place.
    const view = ab.result ? { ...ab, balls: last.before.balls, strikes: last.before.strikes, pitches: ab.pitches.slice(0, -1) } : { ...ab, pitches: ab.pitches.slice() };
    const spot = ab.result ? last.spot : S.spot;
    const seed = (S.seed ^ (view.pitches.length * 2654435761)) >>> 0;
    const before = view.pitches.at(-1);
    const caption = `${ab.result
      ? `On that ${view.balls}-${view.strikes} pitch, called ${spotName(spot)}, instead of the ${NAME[last.code]}`
      : `${S.pitcher.name}, ${spotName(spot)}, in a ${view.balls}-${view.strikes} count${before ? `, right after the ${NAME[before.code]}` : ''}`}: what happens per 100 throws of each pitch (${SLICES * PER} thrown).`;
    const pitches = S.pitcher.pitches;
    const sum = Object.fromEntries(pitches.map(p => [p.code, Object.fromEntries(KEYS.map(k => [k, 0]))]));
    $('ab-chart').innerHTML = `<h3 class="cap" id="ab-chart-title">${caption}</h3>
      <ul class="legend-row">${OUTCOMES.map(([k, l]) => `<li><i class="sg-${k}"></i>${l}</li>`).join('')}</ul>
      <p class="small">Blues went the pitcher’s way, oranges the hitter’s.</p>
      <ol class="hundred-bars" aria-busy="true">${pitches.map(p => `<li><span class="nm">${SHORT(p.code)}</span><span class="bar"></span><span class="sum"></span></li>`).join('')}</ol>`;
    const rows = [...$('ab-chart').querySelectorAll('.hundred-bars li')];
    // Into view, below the picture on a phone (its scroll margin), so the tap visibly did something.
    $('ab-chart').scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const id = charting = ++charts;
    S.charting = true;
    waiting();
    let thrown = 0;
    const slice = () => {
      if (charting !== id) return;
      const t = whatIf(view, spot, PER, seed, thrown * PER);
      for (const p of pitches) for (const k of KEYS) sum[p.code][k] += t[p.code][k];
      thrown++;
      if (!still || thrown === SLICES) draw(rows, pitches, sum, thrown, view);
      if (thrown < SLICES) { requestAnimationFrame(slice); return; }
      charting = 0;
      S.charting = false;
      waiting();
      $('ab-chart').querySelector('.hundred-bars').removeAttribute('aria-busy');
      // A screen reader hears what the chart is, once it's all there.
      $('ab-live').textContent = caption;
    };
    slice();
  }
  // The bars after `thrown` slices: while they fill, each piece is its share of the 400 and the rest of the bar waits
  // empty; once all are in, the pieces are per 100, with their numbers in them where there's room, and the line under
  // each bar says what matters from this count.
  function draw(rows, pitches, sum, thrown, view) {
    const done = thrown === SLICES;
    pitches.forEach((p, i) => {
      const raw = sum[p.code], v = done ? per100(raw) : raw;
      const piece = { ...v, ball: v.ball + v.hbp };
      // Only the outcomes that happened, so every bar starts at the same place and ends on a real piece.
      const segs = OUTCOMES.filter(([k]) => piece[k] > 0).map(([k, , one, many]) => `<span class="sg sg-${k}" style="flex-grow:${piece[k]}" title="${counted(piece[k], one, many)}">${done && piece[k] >= 8 ? piece[k] : ''}</span>`).join('');
      const bar = rows[i].querySelector('.bar');
      bar.innerHTML = segs + (done ? '' : `<i class="rest" style="flex-grow:${(SLICES - thrown) * PER}"></i>`);
      if (!done) return;
      // To a screen reader, what's drawn, in the order it's drawn, leaving out what didn't happen; a pitch that hit him
      // is said apart from the balls it's drawn with.
      const said = OUTCOMES.flatMap(([k, , one, many]) => (k === 'ball' ? [[v.ball, one, many], [v.hbp, 'hit batter', 'hit batters']] : [[v[k], one, many]]))
        .filter(([n]) => n > 0).map(x => counted(...x));
      bar.setAttribute('role', 'img');
      bar.setAttribute('aria-label', said.join(', '));
      rows[i].querySelector('.sum').textContent = summary(v, view.balls, view.strikes);
    });
  }

  // ---------------------------------------------------------------- watching it again
  // The at-bat's pitches thrown again from the first, one after another, at the speed picked. They're the ones in the
  // record, not thrown anew, so it's the same at-bat, and the link doesn't change. Each pitch's row in the log is lit
  // while it flies and once it's in, its mark goes on as it lands, and the count, what happened and the radar board over
  // the picture follow it, as does a screen reader. Once the last is in, the page is as it was. Next hitter, or another
  // pitcher, batter or kind of hitter, stops it.
  const GAP = 1100; // ms from one pitch landing to the next leaving his hand
  let watchTimer = 0;
  function watch() {
    if (S.busy || !S.ab.pitches.length) return;
    if (S.open != null) openRow(null);
    stopChart();
    $('ab-chart').replaceChildren();
    S.watching = { i: 0, landed: false };
    S.busy = true;
    waiting();
    throwAgain();
  }
  function throwAgain() {
    const w = S.watching, ps = S.ab.pitches, rec = ps[w.i];
    w.landed = false;
    drawCount(ps[w.i - 1], false);
    readout(`Pitch ${rec.n}`);
    board(rec);
    lightRow(w.i);
    drawPicture();
    cue(rec);
    stage.set({ marks: marks(ps.slice(0, w.i)) });
    stage.show([rec.path]);
  }
  function watched() {
    const w = S.watching, ps = S.ab.pitches, rec = ps[w.i], end = w.i === ps.length - 1 && !!S.ab.result;
    w.landed = true;
    cueFrame.classList.remove('deciding');
    stage.set({ marks: marks(ps.slice(0, w.i + 1)), grow: true });
    drawCount(rec, end);
    if (end) readout(ENDING[S.ab.result], `${ps.length} pitch${ps.length === 1 ? '' : 'es'}`, markKind(rec.result));
    else readout(resultWord(rec), '', markKind(rec.result));
    drawPicture();
    say(w.i);
    watchTimer = setTimeout(() => {
      if (w.i + 1 < ps.length) { w.i++; throwAgain(); return; }
      stopWatch();
      drawState();
      stage.set({ marks: markList(ps) });
    }, GAP);
  }
  // Stops a watch partway, or ends one that's done; the caller draws the page as it is.
  function stopWatch() {
    clearTimeout(watchTimer);
    if (!S.watching) return;
    S.watching = null;
    S.busy = false;
    lightRow(null);
    waiting();
  }
  // The row of the pitch being watched again, lit; with null, none.
  function lightRow(i) {
    [...$('ab-log').children].forEach((li, k) => { if (k === i) li.firstElementChild.setAttribute('aria-current', 'step'); else li.firstElementChild.removeAttribute('aria-current'); });
  }

  // ---------------------------------------------------------------- links
  // #ab.v<version>.<pitcher>.<batter>.<seed>.<pitch><spot>.<pitch><spot>... replays this exact at-bat on the same version of
  // the hitter (linkFor, js/atbat.js).
  const code = () => linkFor(S);
  // The address follows the at-bat, so a reload replays the one being played and a phone's Share sends it. It's replaced
  // rather than added to, so Back still leaves the page. (A framed one-file copy may not be allowed to change its
  // address; that's fine.) Picking a pitch above takes the address and the tab's title back.
  function stamp() {
    try { history.replaceState(null, '', `#${code()}`); } catch {}
    document.title = 'Pitch to a hitter · Arsenal';
  }
  // Some browsers refuse the clipboard (an in-app browser, the framed copy, a denied permission): then the link goes in
  // a field, selected, to copy by hand.
  async function copyLink() {
    const url = `https://junkdrawer.works/arsenal/#${code()}`, field = $('ab-link');
    try {
      await navigator.clipboard.writeText(url);
      field.hidden = true;
      $('ab-copied').textContent = 'Link copied. Whoever opens it sees this exact at-bat.';
    } catch {
      $('ab-copied').textContent = 'Couldn’t copy here. Select the link and copy it:';
      field.value = url;
      field.hidden = false;
      field.focus();
      field.select();
    }
  }
  // A link that asks for what can't be done still opens, and says so above the call box: a pitcher who isn't here
  // (the league-average righty pitches instead), or pitches left out after the at-bat ended, from one he can't throw,
  // or from where the rest of the link can't be read. One cut off before its seed, or garbled, can't be replayed at
  // all: a new at-bat opens in its place, and says why. Anything not starting "ab." isn't an at-bat link: false.
  function load(hash) {
    if (!/^ab\./i.test(hash)) return false;
    const link = parseLink(hash);
    if (!link) {
      S.seed = newSeed();
      fresh();
      $('ab-notice').textContent = 'This at-bat link is cut off or garbled, so here’s a new at-bat.';
      $('ab-live').textContent = '';
      stamp();
      return true;
    }
    S.pitcher = pitcherByKey(link.pitcherKey);
    S.batter = link.batter;
    S.hitter = hitterByKey(link.hitter).key;
    S.seed = link.seed;
    fresh();
    const said = [];
    if (S.pitcher.key !== link.pitcherKey) said.push(`There’s no pitcher called “${link.pitcherKey}” here, so this is the league-average righty.`);
    if (S.hitter !== link.hitter) said.push(`There’s no kind of hitter called “${link.hitter}” here, so this is the average one.`);
    const calls = link.calls;
    let i = 0;
    for (; i < calls.length; i++) {
      const c = calls[i];
      if (S.ab.result || !c.spot || !S.pitcher.pitches.some(p => p.code === c.code)) break;
      throwCall(S.ab, c);
      S.calls.push(c);
    }
    const left = calls.length - i, c = calls[i];
    if (left && S.ab.result) said.push(`The link had ${left === 1 ? 'one more pitch' : `${left} more pitches`} after the at-bat ended; ${left === 1 ? 'it was' : 'they were'} left out.`);
    else if (left) {
      const name = NAME[c.code];
      const reason = !name ? `The link’s pitch ${i + 1} isn’t a pitch Arsenal knows`
        : c.spot ? `${who()[0].toUpperCase()}${who().slice(1)} doesn’t throw ${/^[aeiou]/.test(name) ? 'an' : 'a'} ${name}`
        : `The link’s pitch ${i + 1} is called to a spot that isn’t on the grid`;
      said.push(`${reason}, so ${left === 1 ? 'that pitch was' : `the link’s last ${left} pitches were`} left out.`);
    }
    if (link.rest) said.push('The rest of the link couldn’t be read, so it was left out.');
    // First, what this is: a screen reader hears it rather than the result of the pitch before the one thrown again.
    const n = S.ab.pitches.length;
    if (n) said.unshift(`Replayed from the link: ${who()} to ${batterWords(S.batter, S.hitter)}, ${plural(n, 'pitch')}.`);
    $('ab-notice').textContent = said.join(' ');
    // Under it, a way to watch the link's at-bat from its first pitch, when there's more than the one it throws again.
    // Once it's over the end card has its own.
    $('ab-watch-link').hidden = n < 2 || !!S.ab.result;
    // Made against another version of the hitter, the calls are thrown to today's, who may not play them the same way.
    $('ab-version').textContent = n && link.version !== VERSION
      ? `Pitched against ${link.version < VERSION ? 'an earlier' : 'a newer'} version of the hitter, so the same calls may play out differently.` : '';
    $('ab-live').textContent = '';
    // The last pitch is thrown again, so the count and the log show where things stood before it. The call stands as it
    // was for that pitch, as it does after a pitch thrown here, so the target is where the catcher set up for it.
    const last = S.ab.pitches.at(-1);
    if (last) { S.pending = last; S.busy = true; S.code = last.code; S.spot = last.spot; drawCall(); }
    drawState();
    if (last) fly(last);
    // The address says what was replayed: without the pitches left out, and the league-average righty for a pitcher who
    // isn't here.
    stamp();
    return true;
  }

  fresh();
  return {
    stage, state: S, load, link: () => code(),
    setDark(d) { stage.set({ dark: d }); },
    throw: (code, spotId) => { S.code = code; S.spot = spotById(spotId); drawCall(); pitch(); },
  };
}
