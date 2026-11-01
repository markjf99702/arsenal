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

export function setupAtBat({ dark = false } = {}) {
  const S = { pitcher: PITCHERS[0], batter: 'R', seed: newSeed(), ab: null, calls: [], code: null, spot: spotById('1m1'), busy: false, speed: 1 };
  const stage = new Stage($('ab-flight'), { onArrive: () => land() });
  // Tilted down a little from the explorer's view, so pitches in the dirt stay in the picture.
  stage.set({ view: 'catcher', ghost: false, color: '#ffd23f', dark, tilt: -3.2 });

  // ---------------------------------------------------------------- controls
  $('ab-pitcher').innerHTML = PITCHERS.map(p => `<option value="${p.key}">${p.name}</option>`).join('');
  $('ab-pitcher').addEventListener('change', e => { S.pitcher = pitcherByKey(e.target.value); fresh(); });
  seg('ab-batter', v => { S.batter = v; fresh(); });
  seg('ab-speed', v => { S.speed = Number(v); stage.set({ speed: S.speed }); });
  $('ab-throw').addEventListener('click', () => pitch());
  $('ab-suggest').addEventListener('click', () => {
    if (S.ab.result) return;
    // A copy of the at-bat, so asking doesn't change what happens next.
    const look = startAtBat({ pitcher: S.pitcher, batter: S.batter, seed: (S.seed + S.calls.length * 7919 + 1) >>> 0 });
    look.balls = S.ab.balls; look.strikes = S.ab.strikes;
    const c = autoCall(look);
    S.code = c.code; S.spot = c.spot;
    drawCall();
    $('ab-hint').textContent = `A typical call in a ${S.ab.balls}-${S.ab.strikes} count: ${NAME[c.code]}, ${spotName(c.spot)}.`;
  });
  $('ab-next').addEventListener('click', () => { S.seed = newSeed(); fresh(); $('ab-flight').scrollIntoView({ block: 'nearest' }); });
  $('ab-copy').addEventListener('click', copyLink);
  $('ab-run').addEventListener('click', hundred);

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
    $('ab-line').textContent = `${S.pitcher.name}: ${S.pitcher.line}`;
    $('ab-pitcher').value = S.pitcher.key;
    for (const b of $('ab-batter').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.v === S.batter));
    stage.set({ hand: S.pitcher.hand, batter: S.batter, marks: [] });
    stage.flights = [];
    stage.draw();
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
    $('ab-hint').textContent = '';
    $('ab-ro').textContent = `Pitch ${rec.n} · ${rec.mph.toFixed(1)} mph ${SHORT(rec.code).toLowerCase()}`;
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
  }

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
    const balls = shown.length ? shown.at(-1).after.balls : 0, strikes = shown.length ? shown.at(-1).after.strikes : 0;
    const dots = (n, of, cls) => Array.from({ length: of }, (_, i) => `<i class="${i < n ? cls : ''}"></i>`).join('');
    $('ab-count').innerHTML = `<span class="ct">${Math.min(balls, 3)}-${Math.min(strikes, 2)}</span><span class="dots"><b>B</b>${dots(balls, 3, 'b')}</span><span class="dots"><b>S</b>${dots(strikes, 2, 's')}</span>`;
    const last = shown.at(-1);
    if (last) {
      $('ab-last').innerHTML = `<p class="res res-${markKind(last.result)}">${resultWord(last)}</p><p>${why(last, shown.at(-2), ab.batter)}</p>`;
      $('ab-live').textContent = `${resultWord(last)}. The count is ${Math.min(balls, 3)} and ${Math.min(strikes, 2)}.`;
    } else {
      $('ab-last').innerHTML = `<p class="res">Your call</p><p>Pick a pitch and a spot, then throw it. Strikes and swings are red, balls green, balls in play blue.</p>`;
    }
    $('ab-log').innerHTML = shown.map(p => `<li class="k-${markKind(p.result)}"><span class="n">${p.n}</span><span><b>${resultWord(p)}</b> · ${SHORT(p.code)}, ${spotName(p.spot)} · ${p.mph.toFixed(1)} mph</span></li>`).join('');
    const over = ab.result && !S.pending;
    $('ab-end').hidden = !over;
    $('ab-callbox').hidden = !!over;
    if (over) {
      $('ab-result').textContent = ENDING[ab.result];
      $('ab-result').className = `end-result ${hitterWon(ab.result) ? 'lost' : 'won'}`;
      $('ab-note').textContent = note(ab);
      $('ab-copied').textContent = '';
      if (!S.pending) $('ab-ro').textContent = `${ENDING[ab.result]} · ${ab.pitches.length} pitch${ab.pitches.length === 1 ? '' : 'es'}`;
    }
    drawCall();
  }

  // ---------------------------------------------------------------- a hundred of each
  function hundred() {
    const ab = S.ab;
    const t = whatIf(ab, S.spot, 100, (S.seed ^ (ab.pitches.length * 2654435761)) >>> 0);
    const ORDER = [['whiff', 'Swinging strike'], ['called', 'Called strike'], ['foul', 'Foul'], ['out', 'Out in play'], ['ball', 'Ball'], ['hit', 'Hit']];
    const rows = S.pitcher.pitches.map(p => {
      const v = t[p.code];
      v.ball += v.hbp;
      const segs = ORDER.map(([k]) => `<span class="sg sg-${k}" style="flex-grow:${v[k]}" title="${v[k]} ${ORDER.find(o => o[0] === k)[1].toLowerCase()}"></span>`).join('');
      return `<li><span class="nm">${SHORT(p.code)}</span><span class="bar" role="img" aria-label="${ORDER.map(([k, l]) => `${v[k]} ${l.toLowerCase()}`).join(', ')}">${segs}</span><span class="sum">${v.whiff} miss${v.whiff === 1 ? '' : 'es'} · ${v.hit} hit${v.hit === 1 ? '' : 's'}</span></li>`;
    }).join('');
    $('ab-chart').innerHTML = `<p class="small">${S.pitcher.name}, ${spotName(S.spot)}, in a ${ab.balls}-${ab.strikes} count${ab.pitches.length ? `, right after the ${NAME[ab.pitches.at(-1).code]}` : ''}: what happens out of 100 throws of each pitch.</p>
      <ul class="legend-row">${ORDER.map(([k, l]) => `<li><i class="sg-${k}"></i>${l}</li>`).join('')}</ul>
      <ol class="hundred-bars">${rows}</ol>`;
  }

  // ---------------------------------------------------------------- links
  // #ab.<pitcher>.<batter>.<seed>.<pitch><spot>.<pitch><spot>... replays this exact at-bat.
  function code() {
    return ['ab', S.pitcher.key, S.batter, S.seed.toString(36), ...S.calls.map(c => `${c.code}${SPOTS.indexOf(c.spot)}`)].join('.');
  }
  async function copyLink() {
    const url = `https://junkdrawer.works/arsenal/#${code()}`;
    try { await navigator.clipboard.writeText(url); $('ab-copied').textContent = 'Link copied. Whoever opens it sees this exact at-bat.'; }
    catch { $('ab-copied').textContent = url; }
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
    const last = S.ab.pitches.at(-1);
    stage.set({ marks: marks(S.ab.pitches.slice(0, -1)) });
    if (last) { S.pending = last; S.busy = true; stage.show([last.path]); } else drawState();
    return true;
  }

  fresh();
  return {
    stage, state: S, load, link: () => code(),
    setDark(d) { stage.set({ dark: d }); },
    throw: (code, spotId) => { S.code = code; S.spot = spotById(spotId); pitch(); },
  };
}
