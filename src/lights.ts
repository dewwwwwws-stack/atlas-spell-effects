// The light a spell's area gives off, or the magical darkness it spreads, as a real Atlas light: Atlas's own
// lighting and vision then handle it (players' sight, fog, the darkness preset that swallows light). A sphere or
// an aura is a light at its centre; a cone shines from its point in its direction; a cube or a line glows from
// its whole area (Atlas's area lights).
import type { Area, SpellEntry } from './areas';
import { placeOf, type Box, type Effect, type TokenAt } from './geometry';

/** What an effect gives off. Feet: `bright` and `dim` from its centre, or from its outline for a cube or line. */
export interface EffectLight { mode: 'light' | 'darkness'; bright: number; dim: number; colour?: string }

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
    return { x: place.at.x, y: place.at.y, rotation: ((deg % 360) + 360) % 360, emission: { ...emission, angle: 53 } };
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
  if (e.shape !== 'wall' && e.shape !== 'line') return [placedLight(e, light, box, tokenAt, ppf)];
  const one = placedLight({ ...e, shape: 'radius' }, light, box, tokenAt, ppf);
  const along = e.shape === 'wall' ? pieces : [box];
  return along.map((b) => {
    if (light.mode === 'darkness') return { x: b.cx, y: b.cy, emission: { ...one.emission, dim: Math.max(1, Math.round(b.w / 2 / (ppf || 14))) } };
    const c = Math.cos(b.rot), s = Math.sin(b.rot), hw = b.w / 2, hh = Math.max(b.h, ppf || 1) / 2;
    const corner = (dx: number, dy: number) => ({ x: b.cx + dx * c - dy * s, y: b.cy + dx * s + dy * c });
    return { x: b.cx, y: b.cy, area: [corner(-hw, -hh), corner(hw, -hh), corner(hw, hh), corner(-hw, hh)], emission: { ...one.emission, bright: Math.max(0, light.bright), dim: Math.max(light.bright, light.dim, 0) } };
  });
}

/** A light as a key: when it changes, Atlas's light is brought up to date. */
export const lightKey = (p: PlacedLight): string => JSON.stringify([Math.round(p.x), Math.round(p.y), p.rotation === undefined ? null : Math.round(p.rotation), p.area?.map((q) => [Math.round(q.x), Math.round(q.y)]) ?? null, p.emission]);
