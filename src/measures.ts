// Atlas's own spell areas (its "kept measurements", Atlas 0.15 on): each spell the add-on casts is one of them too,
// so Atlas draws its area (with its Fire, Frost… look), lights it, counts the creatures in it (as far as walls let
// it), saves it with the scene and shows it to online players; the add-on plays its animation over it. Atlas keeps
// an area as a shape and two points (world pixels): a circle round its first point as far as its second; a cone
// from its first point towards its second; a square whose near side has its first point in the middle; a line from
// its first point to its second, as wide as its width. An aura is a circle that follows a token, reaching `aura`
// game units past its space.

import type { Box, Effect, Point } from './geometry';

/** Atlas's looks for an area (drawn in its own colour). */
export type AreaLook = 'fire' | 'frost' | 'lightning' | 'mist' | 'radiance' | 'shadow';
export const AREA_LOOKS: readonly AreaLook[] = ['fire', 'frost', 'lightning', 'mist', 'radiance', 'shadow'];
/** The colour Atlas draws each look in (its own swatches): a Frost area is pale blue, whatever the spell's animation's colour. */
export const LOOK_COLOURS: Readonly<Record<AreaLook, string>> = { fire: '#ec7500', frost: '#8ad1f8', lightning: '#086ddd', mist: '#ffffff', radiance: '#e0ac00', shadow: '#7852ee' };
export const LOOK_NAMES: Readonly<Record<AreaLook, string>> = { fire: 'Fire', frost: 'Frost', lightning: 'Lightning', mist: 'Mist', radiance: 'Radiance', shadow: 'Shadow' };

/** A kept measurement as the add-on writes and reads it (Atlas's `KeptMeasure`, what of it matters here). */
export interface AreaShape {
  shape: 'circle' | 'cone' | 'square' | 'line';
  points: Point[];
  /** A line's width, world pixels. */
  width?: number;
  color?: string;
  follows?: string;
  aura?: number;
}

const r1 = (v: number): number => Math.round(v * 10) / 10;

/**
 * An effect's area as Atlas keeps it, from where it lies (its box, as the add-on draws it), or null for what has
 * no area of Atlas's (a wall, an effect on a creature, a bolt). `ppf`: world pixels a game unit.
 */
export function areaOf(e: Effect, b: Box): AreaShape | null {
  if (e.on || e.bolt || e.shape === 'wall' || e.outline) return null;
  // the colour you gave the area in Atlas; else its look's own (as Atlas colours a look); else the spell's
  const color = e.areaColour ?? (e.look && e.look in LOOK_COLOURS ? LOOK_COLOURS[e.look as AreaLook] : e.colour);
  const dir = { x: Math.cos(b.rot), y: Math.sin(b.rot) };
  const from = (len: number): Point => ({ x: b.cx - dir.x * len / 2, y: b.cy - dir.y * len / 2 });
  switch (e.shape) {
    case 'radius':
    case 'emanation': {
      const r = b.w / 2;
      if (!(r > 0)) return null;
      const pts = [{ x: r1(b.cx), y: r1(b.cy) }, { x: r1(b.cx + r), y: r1(b.cy) }];
      // round a creature it follows: an aura (it follows them in Atlas too)
      if (e.shape === 'emanation' && e.token) return { shape: 'circle', points: pts, color, follows: e.token, aura: Math.max(0, e.size) };
      return { shape: 'circle', points: pts, color };
    }
    case 'cube': {
      const o = from(b.w);
      return { shape: 'square', points: [{ x: r1(o.x), y: r1(o.y) }, { x: r1(o.x + dir.x * b.w), y: r1(o.y + dir.y * b.w) }], color };
    }
    case 'cone': {
      const o = from(b.w);
      return { shape: 'cone', points: [{ x: r1(o.x), y: r1(o.y) }, { x: r1(o.x + dir.x * b.w), y: r1(o.y + dir.y * b.w) }], color };
    }
    case 'line': {
      const o = from(b.w);
      return { shape: 'line', points: [{ x: r1(o.x), y: r1(o.y) }, { x: r1(o.x + dir.x * b.w), y: r1(o.y + dir.y * b.w) }], width: r1(b.h), color };
    }
    default: return null;
  }
}

/** What of an area is compared: its shape, where it lies, its size and colour, whom it follows. */
export function areaKey(a: AreaShape | Record<string, unknown> | null | undefined): string {
  if (!a) return '';
  const pts = Array.isArray(a.points) ? (a.points as Point[]).map((p) => [Math.round(p.x), Math.round(p.y)]) : [];
  return JSON.stringify([a.shape, a.follows ? null : pts, a.follows ? null : Math.round(Number(a.width) || 0), String(a.color ?? '').toLowerCase(), a.follows ?? null, a.follows ? Number(a.aura) || 0 : null]);
}

/**
 * An effect brought to an area changed in Atlas (dragged by its handles, resized, recoloured): its shape, place,
 * size and colour as the area now is (game units; `ppf` world pixels a unit, `cell` a square's). What doesn't
 * change: its animation, its light, its conditions. Null where Atlas's area is of no shape the effect can take.
 */
export function effectFromArea(e: Effect, a: AreaShape, ppf: number, cell: number): Effect | null {
  const [o, end] = a.points;
  if (!o || !end || !(ppf > 0)) return null;
  const dx = end.x - o.x, dy = end.y - o.y, len = Math.hypot(dx, dy);
  // a colour other than its look's own: given in Atlas, kept for its area (the animation keeps its own)
  const given = typeof a.color === 'string' && /^#[0-9a-f]{6}$/i.test(a.color) ? a.color : undefined;
  const own = e.look && e.look in LOOK_COLOURS ? LOOK_COLOURS[e.look as AreaLook] : e.colour;
  const areaColour = given && given.toLowerCase() !== own.toLowerCase() ? given : undefined;
  const { token: _t, offset: _o, turn: _u, dir: _d, areaColour: _c, ...rest } = e; void _t; void _o; void _u; void _d; void _c;
  const base: Effect = { ...rest, ...(areaColour ? { areaColour } : {}) };
  if (a.follows) { const { areaColour: _c2, ...keep } = e; void _c2; return { ...keep, ...(areaColour ? { areaColour } : {}), shape: 'emanation', token: a.follows, size: Math.max(0, Number(a.aura) || 0) }; }
  if (!(len > 0)) return null;
  const dir = Math.atan2(dy, dx);
  switch (a.shape) {
    case 'circle':
      // an emanation not round a creature reaches half a square past its middle (as the add-on draws one)
      return e.shape === 'emanation' ? { ...base, shape: 'emanation', at: { x: o.x, y: o.y }, size: Math.max(0, (len - cell / 2) / ppf) } : { ...base, shape: 'radius', at: { x: o.x, y: o.y }, size: len / ppf };
    case 'square':
      return { ...base, shape: 'cube', at: { x: o.x + dx / 2, y: o.y + dy / 2 }, size: len / ppf, spin: dir };
    case 'cone':
      return { ...base, shape: 'cone', at: { x: o.x, y: o.y }, dir, size: len / ppf };
    case 'line':
      return { ...base, shape: 'line', at: { x: o.x, y: o.y }, dir, size: len / ppf, ...(Number(a.width) > 0 ? { width: Number(a.width) / ppf } : {}) };
    default: return null;
  }
}

/**
 * The look a spell's area takes in Atlas, from its name, its damage and its text: fire, cold (frost), lightning,
 * radiant (radiance), necrotic and magical darkness (shadow), fog, mist and clouds (mist). Null: none (the plain
 * wash).
 */
export function lookOf(spell: { name?: string; descFull?: string; damageInflict?: unknown } | null | undefined): AreaLook | null {
  if (!spell) return null;
  const name = String(spell.name ?? '');
  const text = String(spell.descFull ?? '');
  const dmg = (Array.isArray(spell.damageInflict) ? spell.damageInflict.join(' ') : String(spell.damageInflict ?? '')) + ' ' + (/(\w+) damage/i.exec(text)?.[1] ?? '');
  if (/darkness/i.test(name) || /magical darkness/i.test(text)) return 'shadow';
  if (/\b(fog|mist|cloud|smoke|steam)\b/i.test(name)) return 'mist';
  if (/\bfire\b/i.test(dmg)) return 'fire';
  if (/\bcold\b/i.test(dmg)) return 'frost';
  if (/\blightning\b/i.test(dmg)) return 'lightning';
  if (/\bradiant\b/i.test(dmg)) return 'radiance';
  if (/\bnecrotic\b/i.test(dmg)) return 'shadow';
  return null;
}

/** Whether an area of Atlas's can give this light: any light; a darkness only round a point (a circle, an aura). */
export const areaCarries = (a: AreaShape | null, darkness: boolean): boolean => !!a && (!darkness || a.shape === 'circle');

/**
 * The light Atlas gives an area of this look (as its Measure tool does on a lit scene): Fire and Lightning flicker,
 * Radiance shines steady, Shadow round a point is a magical darkness; Frost, Mist and none give none. Sized by the
 * area as Atlas sizes it (game units: `ppf` world pixels a unit, `cell` a square's pixels).
 */
export function atlasLightOf(a: AreaShape, look: string | undefined, ppf: number, cell: number, color: string): Record<string, unknown> | null {
  const [o, e] = a.points;
  if (!o || !e || !(ppf > 0) || !look) return null;
  const len = Math.hypot(e.x - o.x, e.y - o.y);
  const units = (w: number): number => Math.round((w / ppf) * 10) / 10;
  let bright: number, dim: number;
  if (a.shape === 'circle' || a.shape === 'cone') { bright = units(len); dim = units(2 * len); } else {
    const across = a.shape === 'line' ? Math.min(a.width ?? cell, len) : len;
    const d = Math.max(cell, across / 2);
    bright = units(d / 2); dim = units(d);
  }
  if (look === 'shadow') return a.shape === 'circle' ? { bright: 0, dim: bright, color, intensity: 1, animation: 'none', darkness: true } : null;
  if (look === 'fire' || look === 'lightning') return { bright, dim, color, intensity: 1, animation: 'torch' };
  if (look === 'radiance') return { bright, dim, color, intensity: 1, animation: 'none' };
  return null;
}

/** Atlas's Measure tool's shape for a spell's area (null: one it hasn't: a wall, an effect on a creature, a bolt). */
export function toolShapeOf(area: { shape: string; target?: string }): 'circle' | 'cone' | 'square' | 'line' | null {
  if (area.target) return null;
  return area.shape === 'radius' || area.shape === 'emanation' ? 'circle' : area.shape === 'cone' ? 'cone' : area.shape === 'cube' ? 'square' : area.shape === 'line' ? 'line' : null;
}
