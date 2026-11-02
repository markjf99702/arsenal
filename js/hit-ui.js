// "Be the hitter": a big-league pitch from behind the plate at real speed, with nothing to say what it is, to name; or
// a whole at-bat against a pitcher who calls his own pitches, swinging with a tap.
import { Stage } from './stage.js';
import { PITCHERS, pitcherByKey, startAtBat, throwCall, autoCall, spotXZ, spotById, pitchTo, swingAt } from './atbat.js';
import { NAME, ENDING, resultWord, crossedAt, timing, yourWhy, yourNote } from './atbat-words.js';
import { readoutRoom, boardRoom, markKind, plateAt } from './tracker.js';
import { BY_CODE } from './pitches.js';
import { newSeed } from './rng.js';

const $ = id => document.getElementById(id);
const SHORT = code => BY_CODE[code]?.short || NAME[code];
const an = word => (/^[aeiou]/.test(word) ? 'an' : 'a');
const plural = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;
// How long after the ball gets to the plate a tap is still a swing, a late one (game time, seconds); after it, the pitch
// was taken.
const GRACE = 0.12;

export function setupHit({ dark = false } = {}) {
  // Skenes to start with: six pitches, the most there are to tell apart.
  const H = { game: 'name', pitcher: pitcherByKey('skenes'), batter: 'R', speed: 1, rec: null, phase: 'ready', right: 0, tries: 0, streak: 0, ab: null, pitch: null, swing: null, visit: [] };
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
  seg('hit-game', v => { H.game = v; reset(); });
  seg('hit-speed', v => { H.speed = Number(v); stage.set({ speed: H.speed }); });
  $('hit-throw').addEventListener('click', () => throwOne());
  $('hit-answers').addEventListener('click', e => { const b = e.target.closest('button'); if (b) answer(b.dataset.code); });
  $('hit-pitch').addEventListener('click', () => nextPitch());
  $('hit-again').addEventListener('click', () => { reset(); $('hit-pitch').focus({ preventScroll: true }); });
  // A swing: a tap on the picture is where and when; the Swing button, or Space or Enter while the ball is in the air,
  // swings down the middle. Each the moment it comes down, not when it comes back up as a click would.
  $('hit-flight').addEventListener('pointerdown', e => {
    if (e.button !== 0 || H.game !== 'step') return;
    const r = $('hit-flight').getBoundingClientRect(), k = $('hit-flight').width / r.width;
    if (swing(plateAt(stage.camera(), (e.clientX - r.left) * k, (e.clientY - r.top) * k), e.timeStamp)) e.preventDefault();
  });
  $('hit-swing').addEventListener('pointerdown', e => { if (e.button === 0) swing(null, e.timeStamp); });
  $('hit-step').addEventListener('keydown', e => {
    if ((e.key === ' ' || e.key === 'Enter') && (H.phase === 'flying' || H.phase === 'late') && swing(null, e.timeStamp)) e.preventDefault();
  });
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
    clearTimeout(lateTimer);
    H.rec = null;
    H.phase = 'ready';
    H.ab = startAtBat({ pitcher: H.pitcher, batter: H.batter, seed: newSeed() });
    H.pitch = null;
    H.swing = null;
    stage.set({ hand: H.pitcher.hand, batter: H.batter, bare: true, marks: [], target: null, swing: null, prev: null });
    stage.clear();
    $('hit-line').textContent = `${H.pitcher.name}. ${H.pitcher.line}`;
    for (const b of $('hit-game').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.v === H.game));
    $('hit-name').hidden = H.game !== 'name';
    $('hit-step').hidden = H.game !== 'step';
    $('hit-readout').hidden = H.game !== 'step';
    drawStep();
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
    if (H.game === 'step') { landed(); return; }
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
    $('hit-pitch').setAttribute('aria-disabled', String(H.phase === 'flying' || H.phase === 'late' || !!H.ab?.result));
    $('hit-swing').setAttribute('aria-disabled', String(H.phase !== 'flying' && H.phase !== 'late'));
  }

  // ---------------------------------------------------------------- step in
  // He calls each pitch, the way pitchers do in the count to a batter on your side (autoCall), and throws it: only the
  // ball, as in Name that pitch. Tap where it will cross, as it gets there; no tap by just after it's in, and you took
  // it. What you did is the model's (js/atbat.js, swingAt), and the picture shows it as Pitch to a hitter's does: where
  // it crossed, where you swung, early or late, its path and its speed.
  let lateTimer = 0;
  function nextPitch() {
    if (H.game !== 'step' || H.phase === 'flying' || H.phase === 'late' || H.ab.result) return;
    H.pitch = pitchTo(H.ab, autoCall(H.ab));
    H.swing = null;
    H.phase = 'flying';
    $('hit-what').textContent = '';
    board(null);
    readout(`Pitch ${H.pitch.n}`);
    stage.set({ bare: true, swing: null, marks: marks() });
    stage.show([H.pitch.flight]);
    waiting();
    $('hit-live').textContent = `Pitch ${H.pitch.n}.`;
  }
  // A swing at `at` (on the plate, feet; down the middle for null) at `stamp` (an event's time): how early it was, by the
  // stage's clock. Gives whether it counted.
  function swing(at, stamp) {
    if (H.game !== 'step' || (H.phase !== 'flying' && H.phase !== 'late') || H.swing) return false;
    H.swing = { at: at || spotXZ(spotById('00'), H.batter), early: H.pitch.flight.T - stage.timeAt(stamp) };
    if (H.phase === 'late') settle();
    return true;
  }
  // The ball is in: settled now if he swung, or once the moment for a late swing has passed.
  function landed() {
    if (H.phase !== 'flying') return;
    H.phase = 'late';
    if (H.swing) settle();
    else lateTimer = setTimeout(settle, (GRACE * 1000) / H.speed);
  }
  function settle() {
    clearTimeout(lateTimer);
    if (H.phase !== 'late') return;
    const p = swingAt(H.ab, H.pitch, H.swing), calling = $('hit-step').contains(document.activeElement);
    H.phase = H.ab.result ? 'over' : 'ready';
    stage.set({ bare: false, marks: marks(), grow: true, swing: p.swing ? { at: p.swungAt, to: p.plate, tag: p.result === 'whiff' || p.result === 'tip' ? timing(p) : '' } : null });
    board(p);
    drawStep();
    $('hit-live').textContent = H.ab.result ? `${ENDING[H.ab.result]}. ${yourNote(H.ab)}` : `${resultWord(p)}. ${p.after.balls} and ${p.after.strikes}. ${yourWhy(p, H.batter)}`;
    // At the end Next pitch and Swing go with the end card's coming, so focus goes to how it ended.
    if (H.ab.result && calling) $('hit-result').focus({ preventScroll: true });
  }
  const marks = () => H.ab.pitches.map(p => ({ x: p.plate[0], z: p.plate[1], n: p.n, kind: markKind(p.result) }));
  // The words over the picture: the count, and what's coming or what happened, in a tag of its mark's colour.
  function readout(what = '', kind = '') {
    $('hit-ro').innerHTML = what && (kind ? `<b class="tag k-${kind}">${what}</b>` : what);
  }
  function drawStep() {
    const ab = H.ab, last = ab.pitches.at(-1), b = last ? last.after.balls : 0, s = last ? last.after.strikes : 0;
    const dots = (n, of, cls) => Array.from({ length: of }, (_, i) => `<i class="${i < n ? cls : ''}"></i>`).join('');
    $('hit-count').innerHTML = ab.result
      ? `<span class="ct" role="img" aria-label="${ENDING[ab.result]}">${{ K: 'K', KL: 'K', BB: 'BB', HBP: 'HBP', out: 'Out', '1B': '1B', '2B': '2B', '3B': '3B', HR: 'HR' }[ab.result]}</span><span class="on">on a ${last.before.balls}-${last.before.strikes} pitch</span>`
      : `<span class="sr">${plural(b, 'ball')}, ${plural(s, 'strike')}</span><span class="ct" aria-hidden="true">${b}-${s}</span><span class="dots" aria-hidden="true"><b>B</b>${dots(b, 3, 'b')}</span><span class="dots" aria-hidden="true"><b>S</b>${dots(s, 2, 's')}</span>`;
    $('hit-count').querySelector('.ct').classList.toggle('kl', ab.result === 'KL');
    readout(last ? (ab.result ? ENDING[ab.result] : resultWord(last)) : '', last ? markKind(last.result) : '');
    $('hit-what').textContent = last ? yourWhy(last, H.batter) : '';
    $('hit-log').innerHTML = ab.pitches.map(p => `<li class="k-${markKind(p.result)}"><span class="n">${p.n}</span><span><span class="at"><span class="sr">on </span>${p.before.balls}-${p.before.strikes}</span>\u00a0· <b>${resultWord(p)}</b>\u00a0· ${SHORT(p.code)}, ${crossedAt(p, H.batter)}\u00a0· ${p.mph.toFixed(1)}\u00a0mph</span></li>`).join('');
    $('hit-end').hidden = !ab.result;
    $('hit-pitch').hidden = !!ab.result;
    $('hit-swing').hidden = !!ab.result;
    if (ab.result) {
      $('hit-result').textContent = ENDING[ab.result];
      $('hit-result').className = `end-result res-${markKind(last.result)}`;
      $('hit-note').textContent = yourNote(ab);
      if (!H.visit.includes(ab)) H.visit.push(ab);
      const of = (...k) => H.visit.filter(a => k.includes(a.result)).length;
      const hbp = of('HBP');
      $('hit-tally').textContent = `This visit: ${plural(H.visit.length, 'time')} up\u00a0· ${of('1B', '2B', '3B', 'HR')}\u00a0H\u00a0· ${of('BB')}\u00a0BB${hbp ? `\u00a0· ${hbp}\u00a0HBP` : ''}\u00a0· ${of('K', 'KL')}\u00a0K.`;
    }
    waiting();
  }

  reset();
  return { stage, state: H, setDark(d) { stage.set({ dark: d }); } };
}
