// A seeded random source, so an at-bat replays exactly from its seed (mulberry32).
export function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // A normal draw (Box-Muller), mean 0 and spread 1.
  next.normal = () => {
    let u = 0;
    while (u === 0) u = next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
  };
  next.chance = p => next() < p;
  next.pick = (items, weights) => {
    let total = 0;
    for (const w of weights) total += w;
    let r = next() * total;
    for (let i = 0; i < items.length; i++) { r -= weights[i]; if (r <= 0) return items[i]; }
    return items[items.length - 1];
  };
  return next;
}

export const newSeed = () => (Math.random() * 2 ** 32) >>> 0;
