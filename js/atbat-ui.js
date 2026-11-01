// "Pitch to a hitter": call each pitch and a spot, watch it from behind the plate, and read why it went how it did.
import { Stage } from './stage.js';
import { PITCHERS, pitcherByKey, startAtBat, throwCall, autoCall, whatIf, SPOTS, spotById, spotName } from './atbat.js';
import { resultWord, why, note, ENDING, hitterWon, NAME } from './atbat-words.js';
import { markKind } from './tracker.js';
import { BY_CODE } from './pitches.js';
import { newSeed } from './rng.js';

const $ = id => document.getElementById(id);
const pct = v => `${Math.round(v * 100)}%`;
const SHORT = code => BY_CODE[code]?.short || NAME[code];
// How each ending goes in a scorebook. A strikeout looking is the same K, drawn backwards.
const SCOREBOOK = { K: 'K', KL: 'K', BB: 'BB', HBP: 'HBP', out: 'Out', '1B': '1B', '2B': '2B', '3B': '3B', HR: 'HR' };

export function setupAtBat({ dark = false } = {}) {
  const S = { pitcher: PITCHERS[0], batter: 'R', seed: newSeed(), ab: null, calls: [], code: null, spot: spotById('1m1'), busy: false, speed: 1 };
  const stage = new Stage($('ab-flight'), { onArrive: () => land() });
  // On a phone the picture stays at the top of the screen (css/app.css), and what's scrolled into view stops below it.
  const frame = $('ab-flight').parentElement;
  new ResizeObserver(() => $('at-bat').style.setProperty('--ab-frame', `${Math.ceil(frame.getBoundingClientRect().height)}px`)).observe(frame);
  // Into view, and out from behind the picture: the browser counts what's behind it as in view.
  const behind = el => getComputedStyle(frame).position === 'sticky' && el.getBoundingClientRect().top < frame.getBoundingClientRect().bottom;
  const reveal = el => el.scrollIntoView({ block: behind(el) ? 'start' : 'nearest' });
  document.querySelector('.bat-call').addEventListener('focusin', e => { if (e.target.matches(':focus-visible')) reveal(e.target); });
  // Framed for the at-bat (atBatCamera): from the pitcher's hand down to a pitch in the dirt.
  stage.set({ view: 'catcher', ghost: false, color: '#ffd23f', dark, atBat: true });

  // ---------------------------------------------------------------- controls
  $('ab-pitcher').innerHTML = PITCHERS.map(p => `<option value="${p.key}">${p.name}</option>`).join('');
  $('ab-pitcher').addEventListener('change', e => { S.pitcher = pitcherByKey(e.target.value); fresh(); });
  seg('ab-batter', v => { S.batter = v; fresh(); });
  seg('ab-speed', v => { S.speed = Number(v); stage.set({ speed: S.speed }); });
  $('ab-throw').addEventListener('click', () => pitch());
  // While a pitch is in the air, the catcher's call and the hundred throws wait for it to land: the model has already
  // thrown it, so either would give away how it went.
  $('ab-suggest').addEventListener('click', () => {
    if (S.busy || S.ab.result) return;
    // A copy of the at-bat, so asking doesn't change what happens next.
    const look = startAtBat({ pitcher: S.pitcher, batter: S.batter, seed: (S.seed + S.calls.length * 7919 + 1) >>> 0 });
    look.balls = S.ab.balls; look.strikes = S.ab.strikes;
    const c = autoCall(look);
    S.code = c.code; S.spot = c.spot;
    drawCall();
    $('ab-hint').textContent = `A typical call in a ${S.ab.balls}-${S.ab.strikes} count: ${NAME[c.code]}, ${spotName(c.spot)}.`;
  });
  // The next hitter: the pitch controls come back where the result was, and into view (under the picture, on a phone).
  $('ab-next').addEventListener('click', () => { S.seed = newSeed(); fresh(); reveal($('ab-callbox')); });
  $('ab-copy').addEventListener('click', copyLink);
  // Where the clipboard is refused, the link is in a field to copy by hand: all of it is selected whenever it's touched.
  for (const ev of ['focus', 'click']) $('ab-link').addEventListener(ev, () => $('ab-link').select());
  $('ab-run').addEventListener('click', () => { if (!S.busy) hundred(); });

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
  function fresh({ keepCalls = false } = {}) {
    S.ab = startAtBat({ pitcher: S.pitcher, batter: S.batter, seed: S.seed });
    if (!keepCalls) S.calls = [];
    S.code = S.pitcher.pitches[0].code;
    S.spot = spotById(S.pitcher.pitches[0].code === 'SI' ? 'm1m1' : '1m1');
    S.busy = false;
    S.pending = null;
    $('ab-line').textContent = `${S.pitcher.name}: ${S.pitcher.line}`;
    $('ab-pitcher').value = S.pitcher.key;
    for (const b of $('ab-batter').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.v === S.batter));
    stage.set({ hand: S.pitcher.hand, batter: S.batter, marks: [] });
    stage.clear();
    $('ab-chart').replaceChildren();
    $('ab-hint').textContent = '';
    drawCall();
    drawState();
  }

  function pitch() {
    if (S.busy || S.ab.result || !S.code) return;
    const call = { code: S.code, spot: S.spot };
    const rec = throwCall(S.ab, call);
    S.calls.push(call);
    S.busy = true;
    S.pending = rec;
    $('ab-throw').disabled = true;
    waiting();
    $('ab-hint').textContent = '';
    fly(rec);
  }

  // Throw a pitch that has already happened in the model: the marks so far, and in the readout what's coming.
  function fly(rec) {
    readout(`Pitch ${rec.n}`, pitchLine(rec));
    stage.set({ marks: marks(S.ab.pitches.slice(0, -1)) });
    stage.show([rec.path]);
  }

  // The ball has reached the plate: show what happened.
  function land() {
    if (!S.pending) return;
    S.pending = null;
    S.busy = false;
    stage.set({ marks: marks(S.ab.pitches) });
    drawState();
    $('ab-chart').replaceChildren();
    // The result card takes the pitch controls' place; if that's behind the picture, bring it out.
    if (S.ab.result && behind($('ab-end'))) $('ab-end').scrollIntoView({ block: 'start' });
  }

  const pitchLine = p => `${p.mph.toFixed(1)} mph ${SHORT(p.code).toLowerCase()}`;
  // The line under the count: what's coming or what happened, then the pitch. On a phone they're two short lines.
  const readout = (what = '', pitch = '') => { $('ab-ro').innerHTML = what && `${what}<span class="sep"> · </span><span>${pitch}</span>`; };

  function marks(ps) {
    return ps.map(p => ({ x: p.plate[0], z: p.plate[1], n: p.n, kind: markKind(p.result) }));
  }

  // ---------------------------------------------------------------- drawing
  function drawCall() {
    const box = $('ab-pitches');
    box.innerHTML = S.pitcher.pitches.map(p => `<button type="button" class="ab-chip fam-${BY_CODE[p.code]?.fam || 'odd'}" data-code="${p.code}" aria-pressed="${p.code === S.code}"><span class="key" aria-hidden="true"></span>${SHORT(p.code)} <small>${p.mph.toFixed(0)} · ${pct(p.share)}</small></button>`).join('');
    for (const b of box.querySelectorAll('button')) b.addEventListener('click', () => { S.code = b.dataset.code; drawCall(); });
    // The grid as the catcher sees it: a right-handed hitter on the left, so his inside is on the left.
    const cols = S.batter === 'R' ? [-2, -1, 0, 1, 2] : [2, 1, 0, -1, -2];
    const grid = $('ab-spots');
    grid.innerHTML = '';
    for (const r of [2, 1, 0, -1, -2]) for (const c of cols) {
      const spot = SPOTS.find(s => s.c === c && s.r === r);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `spot${spot.zone ? ' in' : ''}`;
      b.setAttribute('aria-label', spotName(spot));
      b.setAttribute('aria-pressed', String(spot === S.spot));
      b.title = spotName(spot);
      b.addEventListener('click', () => { S.spot = spot; drawCall(); });
      grid.appendChild(b);
    }
    $('ab-side').textContent = S.batter === 'R' ? '← Right-handed batter' : 'Left-handed batter →';
    $('ab-side').className = `side ${S.batter === 'R' ? 'left' : 'right'}`;
    $('ab-choice').textContent = S.code ? `${SHORT(S.code)}, ${spotName(S.spot)}` : '';
    $('ab-throw').disabled = S.busy || !!S.ab.result;
  }

  function drawState() {
    const ab = S.ab;
    const shown = S.pending ? ab.pitches.slice(0, -1) : ab.pitches;
    const last = shown.at(-1);
    const over = ab.result && !S.pending;
    const balls = last ? last.after.balls : 0, strikes = last ? last.after.strikes : 0;
    const dots = (n, of, cls) => Array.from({ length: of }, (_, i) => `<i class="${i < n ? cls : ''}"></i>`).join('');
    // Once it's over, the count gives way to the scorebook's mark for how it ended, and the count it ended on.
    const ended = over && `${last.before.balls}-${last.before.strikes}`, on = over && `on a ${ended} pitch`;
    $('ab-count').innerHTML = over
      ? `<span class="ct${ab.result === 'KL' ? ' kl' : ''}" role="img" aria-label="${ENDING[ab.result]}">${SCOREBOOK[ab.result]}</span><span class="on">${on}</span>`
      : `<span class="ct">${balls}-${strikes}</span><span class="dots"><b>B</b>${dots(balls, 3, 'b')}</span><span class="dots"><b>S</b>${dots(strikes, 2, 's')}</span>`;
    if (last) {
      $('ab-last').innerHTML = `<p class="res res-${markKind(last.result)}">${resultWord(last)}</p><p>${why(last, shown.at(-2), ab.batter)}</p>`;
      $('ab-live').textContent = over ? `${ENDING[ab.result]} ${on}.` : `${resultWord(last)}. The count is ${balls} and ${strikes}.`;
    } else {
      $('ab-last').innerHTML = `<p class="res">Your call</p><p>Pick a pitch and a spot, then throw it. Strikes and swings are red, balls green, balls in play blue.</p>`;
    }
    $('ab-log').innerHTML = shown.map(p => `<li class="k-${markKind(p.result)}"><span class="n">${p.n}</span><span><b>${resultWord(p)}</b> · ${SHORT(p.code)}, ${spotName(p.spot)} · ${p.mph.toFixed(1)} mph</span></li>`).join('');
    $('ab-end').hidden = !over;
    $('ab-callbox').hidden = !!over;
    // Once it's over, the hundred throws look back at the last pitch.
    $('ab-run').textContent = over ? `What else could he have thrown on that ${ended} pitch?` : 'Throw each of his pitches 100 times from here';
    waiting();
    if (over) {
      $('ab-result').textContent = ENDING[ab.result];
      $('ab-result').className = `end-result ${hitterWon(ab.result) ? 'lost' : 'won'}`;
      $('ab-note').textContent = note(ab);
      $('ab-copied').textContent = '';
      $('ab-link').hidden = true;
    }
    // While a pitch flies the readout says what's coming (fly); once it's in, what happened.
    if (!S.pending) {
      if (over) readout(ENDING[ab.result], `${ab.pitches.length} pitch${ab.pitches.length === 1 ? '' : 'es'}`);
      else if (last) readout(resultWord(last), pitchLine(last));
      else readout();
    }
    drawCall();
  }

  // While a pitch is in the air, the buttons that would give it away wait (see the listeners above). They keep focus.
  function waiting() {
    for (const id of ['ab-suggest', 'ab-run']) $(id).setAttribute('aria-disabled', String(S.busy));
  }

  // ---------------------------------------------------------------- a hundred of each
  // From the count and spot as they stand, before the next pitch. Once the at-bat is over there's no next pitch, so it
  // looks back at the last one instead: the same count, the same spot and the pitch before it, with every pitch he
  // could have thrown there. (whatIf reads only the pitcher, the batter, the knobs, the count and the pitch before.)
  function hundred() {
    const ab = S.ab, last = ab.pitches.at(-1);
    const view = ab.result ? { ...ab, balls: last.before.balls, strikes: last.before.strikes, pitches: ab.pitches.slice(0, -1) } : ab;
    const spot = ab.result ? last.spot : S.spot;
    const t = whatIf(view, spot, 100, (S.seed ^ (view.pitches.length * 2654435761)) >>> 0);
    const ORDER = [['whiff', 'Swinging strike'], ['called', 'Called strike'], ['foul', 'Foul'], ['out', 'Out in play'], ['ball', 'Ball'], ['hit', 'Hit']];
    const rows = S.pitcher.pitches.map(p => {
      const v = t[p.code];
      v.ball += v.hbp;
      // Only the outcomes that happened, so every bar starts at the same place and ends on a real piece.
      const segs = ORDER.filter(([k]) => v[k] > 0).map(([k, l]) => `<span class="sg sg-${k}" style="flex-grow:${v[k]}" title="${v[k]} ${l.toLowerCase()}"></span>`).join('');
      return `<li><span class="nm">${SHORT(p.code)}</span><span class="bar" role="img" aria-label="${ORDER.map(([k, l]) => `${v[k]} ${l.toLowerCase()}`).join(', ')}">${segs}</span><span class="sum">${v.whiff} miss${v.whiff === 1 ? '' : 'es'} · ${v.hit} hit${v.hit === 1 ? '' : 's'}</span></li>`;
    }).join('');
    const before = view.pitches.at(-1);
    const caption = ab.result
      ? `On that ${view.balls}-${view.strikes} pitch, called ${spotName(spot)}, instead of the ${NAME[last.code]}`
      : `${S.pitcher.name}, ${spotName(spot)}, in a ${view.balls}-${view.strikes} count${before ? `, right after the ${NAME[before.code]}` : ''}`;
    $('ab-chart').innerHTML = `<p class="small">${caption}: what happens out of 100 throws of each pitch.</p>
      <ul class="legend-row">${ORDER.map(([k, l]) => `<li><i class="sg-${k}"></i>${l}</li>`).join('')}</ul>
      <p class="small">Blues went the pitcher's way, oranges the hitter's.</p>
      <ol class="hundred-bars">${rows}</ol>`;
    // Into view, below the picture on a phone (its scroll margin), so the tap visibly did something.
    $('ab-chart').scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  // ---------------------------------------------------------------- links
  // #ab.<pitcher>.<batter>.<seed>.<pitch><spot>.<pitch><spot>... replays this exact at-bat.
  function code() {
    return ['ab', S.pitcher.key, S.batter, S.seed.toString(36), ...S.calls.map(c => `${c.code}${SPOTS.indexOf(c.spot)}`)].join('.');
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
      $('ab-copied').textContent = "Couldn't copy here. Select the link and copy it:";
      field.value = url;
      field.hidden = false;
      field.focus();
      field.select();
    }
  }
  function load(hash) {
    const m = /^ab\.(\w+)\.([RL])\.([0-9a-z]+)((?:\.[A-Z]{2}\d{1,2})*)$/.exec(hash);
    if (!m) return false;
    S.pitcher = pitcherByKey(m[1]);
    S.batter = m[2];
    S.seed = parseInt(m[3], 36) >>> 0;
    fresh();
    const calls = m[4].split('.').filter(Boolean).map(t => ({ code: t.slice(0, 2), spot: SPOTS[Number(t.slice(2))] }));
    for (const c of calls) {
      if (S.ab.result || !c.spot || !S.pitcher.pitches.some(p => p.code === c.code)) break;
      throwCall(S.ab, c);
      S.calls.push(c);
    }
    // The last pitch is thrown again, so the count and the log show where things stood before it.
    const last = S.ab.pitches.at(-1);
    if (last) { S.pending = last; S.busy = true; }
    drawState();
    if (last) fly(last);
    return true;
  }

  fresh();
  return {
    stage, state: S, load, link: () => code(),
    setDark(d) { stage.set({ dark: d }); },
    throw: (code, spotId) => { S.code = code; S.spot = spotById(spotId); pitch(); },
  };
}
