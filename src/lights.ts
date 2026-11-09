// The light a spell's area gives off, or the magical darkness it spreads, as a real Atlas light: Atlas's own
// lighting and vision then handle it (players' sight, fog, the darkness preset that swallows light). A sphere or
// an aura is a light at its centre; a cone shines from its point in its direction; a cube or a line glows from
// its whole area (Atlas's area lights).
import type { Area, SpellEntry } from './areas';
import { placeOf, type Box, type Effect, type TokenAt } from './geometry';

/** What an effect gives off. Feet: `bright` and `dim` from its centre, or from its outline for a cube or line. */
export interface EffectLight {
  mode: 'light' | 'darkness'; bright: number; dim: number; colour?: string;
  /** What was set in Atlas's own light editor (intensity, flicker, softness, …): kept over the spell's own. */
  look?: Record<string, unknown>;
}

/** Atlas's emission, with what was set in its editor over it (a null there: a field taken away). */
export function withLook<T extends Record<string, unknown>>(emission: T, look: Record<string, unknown> | undefined): T {
  if (!look) return emission;
  const out: Record<string, unknown> = { ...emission };
  for (const [k, v] of Object.entries(look)) { if (v === null) delete out[k]; else out[k] = v; }
  return out as T;
}

/**
 * What changed in Atlas's light editor, from what was last written (`wrote`) to what Atlas has now: its range
 * and colour go to the spell's own settings, the rest to its look. A cone's angle and darkness's reach stay the
 * effect's (they follow its shape). False: nothing changed.
 */
export function adoptLook(light: EffectLight, wrote: Record<string, unknown>, now: Record<string, unknown>, cone: boolean): boolean {
  let changed = false;
  const look: Record<string, unknown> = { ...(light.look ?? {}) };
  for (const k of new Set([...Object.keys(wrote), ...Object.keys(now)])) {
    if (JSON.stringify(wrote[k]) === JSON.stringify(now[k])) continue;
    if (k === 'darkness' || (cone && k === 'angle')) continue;
    if (k === 'bright' || k === 'dim') { if (light.mode !== 'darkness' && typeof now[k] === 'number') { light[k] = now[k] as number; changed = true; } continue; }
    if (k === 'color' && typeof now[k] === 'string') { light.colour = now[k] as string; changed = true; continue; }
    look[k] = now[k] === undefined ? null : now[k];
    changed = true;
  }
  if (changed) { if (Object.keys(look).length) light.look = look; else delete light.look; }
  return changed;
}

/** Atlas's own colour for darkness, and a warm magical light. */
export const DARKNESS_COLOUR = '#8f7cf0';
export const LIGHT_COLOUR = '#ffd28a';

/** The light (or darkness) a spell's text says its area gives off, or null. */
export function lightOf(spell: SpellEntry | null | undefined, area: Area | null): EffectLight | null {
  const t = String(spell?.descFull ?? '');
  if (!t) return null;
  // the area is darkness (not a spell that only mentions it, as Hallow's choices or a light it can't put out)
  if (/magical darkness (spreads|pours|fills)|filled with magical darkness|is magical darkness|Sphere of Darkness appears/i.test(t)) return { mode: 'darkness', bright: 0, dim: area?.size ?? 15 };
  // things in the area glow (Faerie Fire), not the area: none
  if (/creatures shed Dim Light/i.test(t)) return null;
  let m = /Bright Light in an? (\d+)-foot radius and Dim Light for an additional (\d+) feet/i.exec(t);
  if (m) { const b = Number(m[1]), d = Number(m[2]); return { mode: 'light', bright: b, dim: b + d }; }
  m = /area is Bright Light and sheds Dim Light for an additional (\d+) feet/i.exec(t);
  if (m && area) return { mode: 'light', bright: area.size, dim: area.size + Number(m[1]) };
  m = /Dim Light in an? (\d+)-foot radius/i.exec(t);
  if (m) return { mode: 'light', bright: 0, dim: Number(m[1]) };
  if (/Dim Light fills/i.test(t) && area) return { mode: 'light', bright: 0, dim: area.size };
  return null;
}

/** Atlas's light for an effect: where, its shape, and what it gives off (Atlas's LightInput, without levels). */
export interface PlacedLight {
  x: number; y: number;
  rotation?: number;
  area?: { x: number; y: number }[];
  emission: { bright: number; dim: number; color: string; intensity: number; animation: 'none' | 'magic'; sourceRadius: number; darkness?: boolean; angle?: number; kind?: 'magical' | 'darkness' };
}

/**
 * The light to place for an effect now (its box gives the area's corners). Darkness covers the area itself, so
 * it grows and shrinks with it: `ppf` (world units per foot) turns the box back into feet.
 */
export function placedLight(e: Effect, light: EffectLight, box: Box, tokenAt?: TokenAt | null, ppf = 0): PlacedLight {
  const dark = light.mode === 'darkness';
  const darkFeet = ppf > 0 && (e.shape === 'radius' || e.shape === 'emanation') ? Math.round(box.w / 2 / ppf) : e.shape === 'cube' && ppf > 0 ? Math.round(box.w / 2 / ppf) : light.dim;
  const emission: PlacedLight['emission'] = dark
    ? { bright: 0, dim: Math.max(1, darkFeet), color: light.colour || DARKNESS_COLOUR, intensity: 1, animation: 'none', sourceRadius: 1, darkness: true, kind: 'darkness' }
    : { bright: Math.max(0, Math.min(light.bright, light.dim)), dim: Math.max(light.bright, light.dim, 1), color: light.colour || LIGHT_COLOUR, intensity: 1, animation: 'magic', sourceRadius: 1, kind: 'magical' };
  const place = placeOf(e, tokenAt);
  if (e.shape === 'cone') {
    // from its point, the way it faces (Atlas: degrees, 0 up, 90 right), as wide as a cone (about 53°)
    const deg = ((place.dir ?? 0) * 180) / Math.PI + 90;
    return { x: place.at.x, y: place.at.y, rotation: ((deg % 360) + 360) % 360, emission: { ...emission, angle: Math.round(e.angle ?? 53) } };
  }
  if (e.shape === 'line') {
    // a line's light shines from where it starts (Sunbeam's mote in your hand)
    return { x: place.at.x, y: place.at.y, emission };
  }
  if (e.shape === 'cube' && !dark) {
    // the whole area glows: its corners
    const c = Math.cos(box.rot), s = Math.sin(box.rot), hw = box.w / 2, hh = box.h / 2;
    const corner = (dx: number, dy: number) => ({ x: box.cx + dx * c - dy * s, y: box.cy + dx * s + dy * c });
    return { x: box.cx, y: box.cy, area: [corner(-hw, -hh), corner(hw, -hh), corner(hw, hh), corner(-hw, hh)], emission: { ...emission, bright: Math.max(0, light.bright), dim: Math.max(light.bright, light.dim, 0) } };
  }
  return { x: box.cx, y: box.cy, emission };
}

/**
 * Every light an effect gives: one for most; a wall glows along each of its stretches, and a line along its whole
 * length (an area light each). Darkness on a wall or line: one at the middle of each stretch, as long as it.
 */
export function placedLights(e: Effect, light: EffectLight, box: Box, tokenAt: TokenAt | null, ppf: number, pieces: Box[] = []): PlacedLight[] {
  const pls = placedLightsOf(e, light, box, tokenAt, ppf, pieces);
  return light.look ? pls.map((pl) => ({ ...pl, emission: withLook(pl.emission, light.look) })) : pls;
}

function placedLightsOf(e: Effect, light: EffectLight, box: Box, tokenAt: TokenAt | null, ppf: number, pieces: Box[] = []): PlacedLight[] {
  if (e.shape !== 'wall' && e.shape !== 'line') return [placedLight(e, light, box, tokenAt, ppf)];
  const one = placedLight({ ...e, shape: 'radius' }, light, box, tokenAt, ppf);
  const along = e.shape === 'wall' ? pieces : [box];
  // a wall of light: point lights along it, about every 10 ft. Atlas moves point lights cheaply (as it does its
  // own torches), where a light over an area is worked out again in full at every change.
  if (e.shape === 'wall' && light.mode !== 'darkness' && pieces.length) {
    const ft = ppf || 14;
    const pts = alongWall(pieces, 10 * ft);
    return pts.map((q) => ({ x: q.x, y: q.y, emission: { ...one.emission, bright: Math.max(0, light.bright), dim: Math.max(light.bright, light.dim, 1) } }));
  }
  return along.map((b) => {
    if (light.mode === 'darkness') return { x: b.cx, y: b.cy, emission: { ...one.emission, dim: Math.max(1, Math.round(b.w / 2 / (ppf || 14))) } };
    const c = Math.cos(b.rot), s = Math.sin(b.rot), hw = b.w / 2, hh = Math.max(b.h, ppf || 1) / 2;
    const corner = (dx: number, dy: number) => ({ x: b.cx + dx * c - dy * s, y: b.cy + dx * s + dy * c });
    return { x: b.cx, y: b.cy, area: [corner(-hw, -hh), corner(hw, -hh), corner(hw, hh), corner(-hw, hh)], emission: { ...one.emission, bright: Math.max(0, light.bright), dim: Math.max(light.bright, light.dim, 0) } };
  });
}

/** A light as a key: when it changes, Atlas's light is brought up to date. */
export const lightKey = (p: PlacedLight): string => JSON.stringify([Math.round(p.x), Math.round(p.y), p.rotation === undefined ? null : Math.round(p.rotation), p.area?.map((q) => [Math.round(q.x), Math.round(q.y)]) ?? null, p.emission]);

/**
 * The outline of a wall `hh` either side of its middle, from its pieces in order. A closed wall's outline goes
 * round its outside one way and its inside the other, joined by a seam of no width: Atlas fills an outline by
 * winding, so the middle stays unlit.
 */
export function wallBand(pieces: readonly Box[], hh: number): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (const b of pieces) {
    const dx = Math.cos(b.rot) * b.w / 2, dy = Math.sin(b.rot) * b.w / 2;
    const a = { x: b.cx - dx, y: b.cy - dy }, z = { x: b.cx + dx, y: b.cy + dy };
    const last = pts[pts.length - 1];
    if (!last || Math.hypot(last.x - a.x, last.y - a.y) > 1) pts.push(a);
    pts.push(z);
  }
  const closed = pts.length > 3 && Math.hypot(pts[0]!.x - pts[pts.length - 1]!.x, pts[0]!.y - pts[pts.length - 1]!.y) <= 1;
  if (closed) pts.pop();
  const n = pts.length; if (n < 2) return [];
  const dir = (i: number, j: number) => { const d = Math.hypot(pts[j]!.x - pts[i]!.x, pts[j]!.y - pts[i]!.y) || 1; return { x: (pts[j]!.x - pts[i]!.x) / d, y: (pts[j]!.y - pts[i]!.y) / d }; };
  const left: { x: number; y: number }[] = [], right: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const prev = closed || i > 0 ? dir((i - 1 + n) % n, i) : null;
    const next = closed || i < n - 1 ? dir(i, (i + 1) % n) : null;
    const t = prev && next ? { x: prev.x + next.x, y: prev.y + next.y } : (prev ?? next)!;
    const tl = Math.hypot(t.x, t.y) || 1;
    const nx = -t.y / tl, ny = t.x / tl;
    // the corner's mitre: further out the sharper the turn, never more than three times as far
    const ref = next ?? prev!;
    const k = Math.min(3, 1 / Math.max(1 / 3, Math.abs(nx * -ref.y + ny * ref.x)));
    const p = pts[i]!;
    left.push({ x: p.x + nx * hh * k, y: p.y + ny * hh * k });
    right.push({ x: p.x - nx * hh * k, y: p.y - ny * hh * k });
  }
  if (!closed) return [...left, ...right.reverse()];
  return [...left, left[0]!, right[0]!, ...right.slice(1).reverse(), right[0]!];
}

/** A ring wall's outline in two halves, each a plain band (no seam): for a ring's light, as two Atlas lights. */
export function ringHalves(pieces: readonly Box[], hh: number): { x: number; y: number }[][] {
  const n = pieces.length; if (n < 4) return [wallBand(pieces, hh)];
  const h = Math.ceil(n / 2);
  return [wallBand(pieces.slice(0, h), hh), wallBand(pieces.slice(h), hh)];
}

/**
 * Points along a wall (its pieces in order) about `step` apart: both ends of an open wall, evenly round a closed
 * one. At most 24.
 */
export function alongWall(pieces: readonly Box[], step: number): { x: number; y: number }[] {
  const segs = pieces.map((b) => { const dx = Math.cos(b.rot) * b.w / 2, dy = Math.sin(b.rot) * b.w / 2; return { a: { x: b.cx - dx, y: b.cy - dy }, z: { x: b.cx + dx, y: b.cy + dy }, len: b.w }; });
  const total = segs.reduce((t, s) => t + s.len, 0);
  if (!segs.length || total <= 0) return segs.length ? [segs[0]!.a] : [];
  const first = segs[0]!, last = segs[segs.length - 1]!;
  const closed = segs.length > 2 && Math.hypot(first.a.x - last.z.x, first.a.y - last.z.y) <= 1;
  const n = Math.min(24, Math.max(closed ? 3 : 2, Math.round(total / Math.max(1, step)) + (closed ? 0 : 1)));
  const gap = closed ? total / n : total / (n - 1);
  const at = (d: number) => {
    let left = Math.min(d, total);
    for (const s of segs) { if (left <= s.len || s === last) { const k = s.len ? Math.min(1, left / s.len) : 0; return { x: s.a.x + (s.z.x - s.a.x) * k, y: s.a.y + (s.z.y - s.a.y) * k }; } left -= s.len; }
    return last.z;
  };
  return Array.from({ length: n }, (_, i) => at(i * gap));
}
