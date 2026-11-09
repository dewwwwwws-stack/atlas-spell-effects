// A spell's area, read from its own text in your spell list (spells/spells.json: `range`, `duration`, `descFull`).
// Nothing is looked up elsewhere: where the text names no area, the DM picks one in the cast window.

export type Shape = 'radius' | 'emanation' | 'cone' | 'cube' | 'line' | 'wall';

/** What a wall's real Atlas walls stop: nothing (drawn only), sight, movement only, or everything. */
export type WallBlocks = 'none' | 'sight' | 'movement' | 'solid';

export interface Area {
  shape: Shape;
  /** Radius (radius, emanation), side (cube), length (cone, line, wall), in feet. */
  size: number;
  /** Line width in feet; a wall's thickness. */
  width?: number;
  /** A cone's angle at its point, in degrees (missing: the default in the settings). */
  angle?: number;
  /** A wall that can also be a ring: its diameter in feet. */
  ring?: number;
  /** The wall is made as that ring. */
  round?: boolean;
  /** What the wall's real Atlas walls stop. */
  blocks?: WallBlocks;
  /**
   * Cast at creatures: each token clicked is a target. `on`: the effect plays on it (an aura the size of its
   * space, plus `size` feet); `bolt`: a line from the caster to it.
   */
  target?: 'on' | 'bolt';
  /** Where it starts: on the caster (cone, line, emanation, a cube "originating from you") or at a point. */
  from: 'caster' | 'point';
  /** Stays on the map until ended (a duration other than instantaneous). */
  lasting: boolean;
}

export interface SpellEntry { key: string; name: string; range?: string; duration?: string; descFull?: string; desc?: string; level?: number; school?: string }

const num = (s: string | undefined): number => { const n = Number(s); return Number.isFinite(n) && n > 0 ? n : 0; };

/** Whether a spell's effect lasts (anything but Instantaneous). */
export function lasting(spell: SpellEntry): boolean {
  const d = String(spell.duration ?? '').trim().toLowerCase();
  return d !== '' && !/^instant/.test(d);
}

/** The spell's area, or null when its text names none. */
export function areaOf(spell: SpellEntry): Area | null {
  const text = String(spell.descFull ?? spell.desc ?? '');
  const range = String(spell.range ?? '').trim();
  const self = /^(self|s:)/i.test(range);
  const last = lasting(spell);
  // every area the text names; the first one named is the spell's own (Faerie Fire's Cube, not the light's radius after it)
  const found: Array<{ at: number; area: Area }> = [];
  const look = (re: RegExp, make: (m: RegExpExecArray) => Area) => { const m = re.exec(text); if (m) found.push({ at: m.index, area: make(m) }); };
  // Lines: "a 100-foot-long, 5-foot-wide Line", "a 5-foot-wide, 60-foot-long Line", "a Line ... 60 feet long and 10 feet wide"
  look(/(\d+)-foot-long,?\s+(\d+)-foot-wide\s+Line/i, (m) => ({ shape: 'line', size: num(m[1]), width: num(m[2]), from: 'caster', lasting: last }));
  look(/(\d+)-foot-wide,?\s+(\d+)-foot-long\s+Line/i, (m) => ({ shape: 'line', size: num(m[2]), width: num(m[1]), from: 'caster', lasting: last }));
  look(/\bLine\b[^.]*?(\d+) feet long and (\d+) feet wide/i, (m) => ({ shape: 'line', size: num(m[1]), width: num(m[2]), from: 'caster', lasting: last }));
  look(/(\d+)-foot Cone/i, (m) => ({ shape: 'cone', size: num(m[1]), from: 'caster', lasting: last }));
  look(/(\d+)-foot Emanation/i, (m) => ({ shape: 'emanation', size: num(m[1]), from: 'caster', lasting: last }));
  look(/(\d+)-foot[- ]radius/i, (m) => ({ shape: 'radius', size: num(m[1]), from: self ? 'caster' : 'point', lasting: last }));
  look(/(\d+)-foot Cube/i, (m) => ({ shape: 'cube', size: num(m[1]), from: self || /Cube originating from you/i.test(text) ? 'caster' : 'point', lasting: last }));
  // Walls: "a wall up to 60 feet long, 20 feet high, and 1 foot thick, or a ringed wall up to 20 feet in diameter",
  // "ten 10-foot-by-10-foot panels", "a circle that has a 20-foot diameter"
  const wall = /\bwall\b[^.]*?up to (\d+) feet long|\b(ten|six|five|four|three|two|\d+) (\d+)-foot(?:-by-\d+-foot|-square) panels/i.exec(text);
  if (wall) {
    const words: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, ten: 10 };
    const length = wall[1] ? num(wall[1]) : (words[wall[2]!.toLowerCase()] ?? num(wall[2])) * num(wall[3]);
    const thick = /(\d+) (?:feet|foot) thick/i.exec(text);
    const inches = /(\d+) inch(?:es)? thick/i.exec(text);
    const ring = /ring(?:ed wall)? up to (\d+) feet in diameter|circle that has an? (\d+)-foot diameter/i.exec(text);
    const blocks: WallBlocks = /blocks line of sight|is opaque|opaque wall/i.test(text) ? 'sight'
      : /Nothing can physically pass through/i.test(text) ? 'movement'
      : /Wall of (Stone|Ice|Iron)/i.test(String(spell.name)) ? 'solid' : 'none';
    found.push({ at: wall.index, area: { shape: 'wall', size: length, width: thick ? num(thick[1]) : inches ? Math.max(0.1, num(inches[1]) / 12) : 1, ...(ring ? { ring: num(ring[1] ?? ring[2]) } : {}), blocks, from: 'point', lasting: last } });
  }
  found.sort((x, y) => x.at - y.at);
  if (found.length && found[0]!.area.size > 0) return found[0]!.area;
  let m: RegExpExecArray | null;
  // the sheet's own short form when the text has none: "S:15-ft rad", "S:15ft cone", "S:15ft cube", "S:60-ft line"
  if ((m = /^S:(\d+)-?ft\s*(rad|cone|cube|line)/i.exec(range))) {
    const k = m[2]!.toLowerCase();
    const shape: Shape = k === 'rad' ? 'emanation' : (k as Shape);
    return { shape, size: num(m[1]), ...(shape === 'line' ? { width: 5 } : {}), from: 'caster', lasting: last };
  }
  return null;
}

/**
 * A spell with no area that is cast at creatures: a bolt from the caster for ranged attacks and rays, darts and
 * beams; otherwise on each creature it names. Null for one that names no creature (Self only, or no text).
 */
export function targetOf(spell: SpellEntry): Area | null {
  const text = String(spell.descFull ?? spell.desc ?? '');
  const range = String(spell.range ?? '').trim();
  if (!text) return null;
  const last = lasting(spell);
  const touchOrSelf = /^(touch|self)/i.test(range);
  if (!touchOrSelf && /ranged spell attack|\b(darts?|bolts?|beams?|rays?|missiles?|motes?)\b[^.]*\b(hits?|strikes?|streaks?|flies|fly|leaps?)|\b(launch|hurl|fire|shoot)(es|s)?\b[^.]*\b(ray|beam|bolt|dart|mote|orb)s?\b/i.test(text))
    return { shape: 'line', size: 30, width: 5, from: 'caster', lasting: false, target: 'bolt' };
  if (/\b(creatures?|targets?|humanoids?|beasts?|allies|ally|willing)\b/i.test(text) && !/^self$/i.test(range))
    return { shape: 'emanation', size: 0, from: 'caster', lasting: last, target: 'on' };
  return null;
}

/** How an area reads: "20 ft radius", "15 ft cone", "100 × 5 ft line". */
export function describe(a: Area): string {
  if (a.target === 'bolt') return 'a bolt at each creature you click';
  if (a.target === 'on') return a.size ? `${a.size} ft around each creature you click` : 'on each creature you click';
  switch (a.shape) {
    case 'radius': return `${a.size} ft radius${a.from === 'caster' ? ' around the caster' : ''}`;
    case 'emanation': return `${a.size} ft around the caster`;
    case 'cone': return `${a.size} ft cone`;
    case 'cube': return `${a.size} ft cube${a.from === 'caster' ? ' from the caster' : ''}`;
    case 'line': return `${a.size} × ${a.width ?? 5} ft line`;
    case 'wall': return a.round && a.ring ? `${a.ring} ft ring wall` : `${a.size} ft wall`;
  }
}
