// Fetching from Baseball Savant's Statcast search, shared by the data tools.

export function parseCSV(text) {
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

export async function fetchCSV(url) {
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

// A Statcast search for one regular season. `filters` is a list of [param, values] pairs, e.g. [['hfPT', ['FF', 'SI']]];
// `group` is 'league' (one row of totals) or 'name' (a row per pitcher).
export function search(season, filters = [], group = 'league') {
  const extra = filters.map(([k, vs]) => `&${k}=${vs.map(v => `${encodeURIComponent(v)}%7C`).join('')}`).join('');
  return fetchCSV('https://baseballsavant.mlb.com/statcast_search/csv?all=true&hfGT=R%7C&player_type=pitcher'
    + `&hfSea=${season}%7C&min_pitches=0&min_results=0&min_pas=0&group_by=${group}&sort_col=pitches&sort_order=desc${extra}`);
}

export const num = s => (s === '' || s == null || Number.isNaN(Number(s)) ? null : Number(s));
export const round = (v, d = 1) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);
