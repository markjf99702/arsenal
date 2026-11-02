// "Be the hitter": a big-league pitch from behind the plate at real speed, with nothing to say what it is, to name.
import { Stage } from './stage.js';
import { PITCHERS, pitcherByKey, startAtBat, throwCall, autoCall, spotXZ, spotById } from './atbat.js';
import { NAME } from './atbat-words.js';
import { readoutRoom, boardRoom } from './tracker.js';
import { BY_CODE } from './pitches.js';
import { newSeed } from './rng.js';

const $ = id => document.getElementById(id);
const SHORT = code => BY_CODE[code]?.short || NAME[code];
const an = word => (/^[aeiou]/.test(word) ? 'an' : 'a');

export function setupHit({ dark = false } = {}) {
  // Skenes to start with: six pitches, the most there are to tell apart.
  const H = { pitcher: pitcherByKey('skenes'), batter: 'R', speed: 1, rec: null, phase: 'ready', right: 0, tries: 0, streak: 0 };
  const stage = new Stage($('hit-flight'), { onArrive: () => arrived() });
  stage.set({ view: 'catcher', ghost: false, color: '#ffd23f', dark, atBat: true, hand: H.pitcher.hand, batter: H.batter, bare: true, speed: H.speed });
  // The words over the picture's corners stop short of the high spots off the plate, as the at-bat's do.
  const frame = $('hit-flight').parentElement, corner = spotXZ(spotById('2m2'), 'R');
  new ResizeObserver(() => {
    // On a phone the picture stays at the top of the screen, and what's brought into view stops below it (css/app.css).
    $('hit').style.setProperty('--ab-frame', `${Math.ceil(frame.getBoundingClientRect().height)}px`);
    const { W, H: h, dpr } = stage.size();
    frame.style.setProperty('--ro-max', `${Math.floor(readoutRoom(W, h, dpr, corner) * 10) / 10}px`);
    frame.style.setProperty('--rb-max', `${Math.floor(boardRoom(W, h, dpr, corner) * 10) / 10}px`);
  }).observe(frame);

  // ---------------------------------------------------------------- controls
  // Every pitcher in Pitch to a hitter, each with what he is.
  $('hit-pitcher').innerHTML = PITCHERS.map(p => `<option value="${p.key}">${p.name}${p.tag ? ` – ${p.tag}` : ''}</option>`).join('');
  $('hit-pitcher').value = H.pitcher.key;
  $('hit-pitcher').addEventListener('change', e => { H.pitcher = pitcherByKey(e.target.value); reset(); });
  seg('hit-batter', v => { H.batter = v; reset(); });
  seg('hit-speed', v => { H.speed = Number(v); stage.set({ speed: H.speed }); });
  $('hit-throw').addEventListener('click', () => throwOne());
  $('hit-answers').addEventListener('click', e => { const b = e.target.closest('button'); if (b) answer(b.dataset.code); });
  function seg(id, on) {
    $(id).addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      for (const x of $(id).querySelectorAll('button')) x.setAttribute('aria-pressed', String(x === b));
      on(b.dataset.v);
    });
  }

  // ---------------------------------------------------------------- name that pitch
  // Another pitcher or side of the plate: his pitches to choose from, and nothing in the air. The streak is the visit's
  // and goes on: nothing is saved.
  function reset() {
    H.rec = null;
    H.phase = 'ready';
    stage.set({ hand: H.pitcher.hand, batter: H.batter, bare: true, marks: [], target: null, swing: null, prev: null });
    stage.clear();
    $('hit-line').textContent = `${H.pitcher.name}. ${H.pitcher.line}`;
    $('hit-answers').innerHTML = H.pitcher.pitches.map(p => `<button type="button" class="ab-chip fam-${BY_CODE[p.code]?.fam || 'odd'}" data-code="${p.code}"><span class="key" aria-hidden="true"></span>${SHORT(p.code)}</button>`).join('');
    $('hit-ask').hidden = true;
    $('hit-said').textContent = '';
    $('hit-throw').lastChild.textContent = 'Throw me one';
    board(null);
    waiting();
  }

  // One of his pitches, as he'd throw it to this batter: his mix to that side of the plate, to a spot where that kind
  // of pitch goes in some count (autoCall), at its own speed. Only the ball is drawn, with no speed on the board, from
  // the moment it leaves his hand to the plate.
  function throwOne() {
    if (H.phase === 'flying') return;
    const ab = startAtBat({ pitcher: H.pitcher, batter: H.batter, seed: newSeed() });
    ab.balls = Math.floor(Math.random() * 4);
    ab.strikes = Math.floor(Math.random() * 3);
    H.rec = throwCall(ab, autoCall(ab));
    H.phase = 'flying';
    $('hit-ask').hidden = true;
    $('hit-said').textContent = '';
    board(null);
    stage.set({ bare: true });
    stage.show([H.rec.path]);
    waiting();
    $('hit-live').textContent = `${H.pitcher.name} throws.`;
  }

  // It's in: name it, from his pitches. Focus goes to the first of them, if it was on Throw.
  function arrived() {
    if (H.phase !== 'flying') return;
    H.phase = 'asking';
    const calling = document.activeElement === $('hit-throw');
    $('hit-ask').hidden = false;
    waiting();
    $('hit-live').textContent = 'What was it?';
    if (calling) $('hit-answers').firstElementChild.focus({ preventScroll: true });
  }

  // Named: right or not, what it was and how fast, the streak, and then the whole flight again, its path drawn, with
  // its speed on the board.
  function answer(code) {
    if (H.phase !== 'asking') return;
    const rec = H.rec, right = code === rec.code, it = `his ${rec.mph.toFixed(1)} mph ${NAME[rec.code]}`;
    H.tries++;
    if (right) { H.right++; H.streak++; } else H.streak = 0;
    H.phase = 'shown';
    $('hit-ask').hidden = true;
    const said = right ? `Right: it was ${it}.` : `Not ${an(NAME[code])} ${NAME[code]}: it was ${it}.`;
    $('hit-said').textContent = `${said} ${H.streak} in a row · ${H.right} of ${H.tries} this visit.`;
    $('hit-live').textContent = $('hit-said').textContent;
    $('hit-throw').lastChild.textContent = 'Throw me another';
    board(rec);
    stage.set({ bare: false });
    stage.show([rec.path]);
    waiting();
    $('hit-throw').focus({ preventScroll: true });
  }

  // The radar board: the pitch's speed and name, once it's been named.
  function board(rec) {
    $('hit-board').innerHTML = rec ? `<div class="speed"><b>${rec.mph.toFixed(1)}</b> <span>mph</span></div><div class="nm">${NAME[rec.code].split(' ').map(w => `<span class="nw">${w}</span>`).join(' ')}</div>` : '';
  }
  // While it's in the air, Throw waits; it's marked rather than disabled, so it keeps focus.
  function waiting() {
    $('hit-throw').setAttribute('aria-disabled', String(H.phase === 'flying' || H.phase === 'asking'));
  }

  reset();
  return { stage, state: H, setDark(d) { stage.set({ dark: d }); } };
}
