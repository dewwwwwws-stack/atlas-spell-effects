// A spell's area, read from its own text in your spell list (spells/spells.json: `range`, `duration`, `descFull`).
// Nothing is looked up elsewhere: where the text names no area, the DM picks one in the cast window.

export type Shape = 'radius' | 'emanation' | 'cone' | 'cube' | 'line' | 'wall';

/** What a wall's real Atlas walls stop: nothing (drawn only), sight, movement only, or everything. */
export type WallBlocks = 'none' | 'sight' | 'movement' | 'solid';

export interface Area {
  shape: Shape;
  /** Radius (radius, emanation), side (cube), length (cone, line, wall), in game units (feet in D&D). */
  size: number;
  /** Line width in game units; a wall's thickness. */
  width?: number;
  /** A cone's angle at its point, in degrees (missing: the default in the settings). */
  angle?: number;
  /** A wall that can also be a ring: its diameter in game units. */
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
  /** `on`: only on the caster (Shield, Mage Armor on yourself): no creatures to click. */
  self?: boolean;
  /** Where it starts: on the caster (cone, line, emanation, a cube "originating from you") or at a point. */
  from: 'caster' | 'point';
  /** Stays on the map until ended (a duration other than instantaneous). */
  lasting: boolean;
}

export interface SpellEntry { key: string; name: string; range?: string; duration?: string; descFull?: string; desc?: string; level?: number; school?: string }

const num = (s: string | undefined): number => { const n = Number(s); return Number.isFinite(n) && n > 0 ? n : 0; };

/**
 * The game system's measures, from Atlas (the map's collection's rules). Every size the add-on keeps is in the
 * collection's own game units, as Atlas's lights and rulers are: feet in D&D and Pathfinder, yards in Call of
 * Cthulhu, metres in Cyberpunk RED, squares in Draw Steel. Distances in spell text are read into them the way
 * Atlas reads a statblock's: "60 ft.", "18 m", "12 squares", "60'", and range bands (Daggerheart's Very Close,
 * Shadowdark's Near) at the squares Atlas gives them.
 */
export type GameUnitType = 'feet' | 'yards' | 'meters' | 'units' | 'custom';
export interface Rules {
  unit: GameUnitType;
  /** Game units in one rules square (the collection's distance per cell). */
  perSquare: number;
  bands: { name: string; squares: number }[];
}
let rules: Rules = { unit: 'feet', perSquare: 5, bands: [] };
/** Sets the measures spell text is read with (the add-on does, from the open Atlas map). */
export function setRules(r: Rules): void {
  rules = { unit: r.unit, perSquare: r.perSquare > 0 ? r.perSquare : 5, bands: r.bands.filter((b) => b.name && b.squares > 0).sort((a, b) => b.name.length - a.name.length) };
}
export function currentRules(): Rules { return rules; }

/** The game unit, as a label: "ft", "yd", "m", or "squares" (Draw Steel's units, one to a square). */
export function unitLabel(): string {
  return rules.unit === 'feet' ? 'ft' : rules.unit === 'yards' ? 'yd' : rules.unit === 'meters' ? 'm' : rules.perSquare === 1 ? 'squares' : 'units';
}
/** One square in game units: the step sizes go in, and the size of things that default to one square. */
export function square(): number { return rules.perSquare; }
/** `n` squares, in game units. */
export const squares = (n: number): number => Math.round(n * rules.perSquare * 100) / 100;

/** Feet in each real unit, as tabletop rules (and Atlas) convert them: a 5-foot square is 1.5 m. */
const FEET_IN: Record<string, number> = { feet: 1, yards: 3, meters: 5 / 1.5, miles: 5280, kilometers: 5000 / 1.5 };
/** A written unit's name: feet, yards, meters, miles, kilometers, squares; '' for none. */
function unitOf(word: string): string {
  const u = word.toLowerCase().replace(/\.$/, '');
  if (!u) return '';
  if (/^(feet|foot|ft|'|′|’)$/.test(u)) return 'feet';
  if (/^(kilometers?|kilometres?|km)$/.test(u)) return 'kilometers';
  if (/^(meters?|metres?|m)$/.test(u)) return 'meters';
  if (/^(miles?|mi)$/.test(u)) return 'miles';
  if (/^(yards?|yds?)$/.test(u)) return 'yards';
  if (/^(squares?|sq|cells?|hex(?:es)?)$/.test(u)) return 'squares';
  return '';
}
/**
 * A written distance in game units, as Atlas reads one: a bare number, or one in the collection's own unit, as it
 * is; squares count what a rules square spans; other real units are converted; where the collection has no real
 * unit (Draw Steel), a 5-foot square is one of its squares.
 */
export function toGame(value: number, word: string): number {
  const u = unitOf(word);
  const r = (n: number) => Math.round(n * 100) / 100;
  if (!u) return value;
  if (u === 'squares') return r(value * rules.perSquare);
  const own = rules.unit === 'feet' || rules.unit === 'yards' || rules.unit === 'meters' ? rules.unit : '';
  if (own === u) return value;
  const feet = value * FEET_IN[u];
  return r(own ? feet / FEET_IN[own] : (feet / 5) * rules.perSquare);
}
/** Feet (as 5e text writes them) in game units. */
export const fromFeet = (feet: number): number => toGame(feet, 'feet');

const UNIT = String.raw`(foot|feet|ft\.?|'|’|′|kilometers?|kilometres?|km|meters?|metres?|m|miles?|yards?|yds?|squares?)(?![a-z])`;
/** A range band's size in game units, by its name ("Very Close"), or 0. */
function bandSize(name: string): number { const k = name.trim().toLowerCase(); const b = rules.bands.find((x) => x.name.toLowerCase() === k); return b ? squares(b.squares) : 0; }
const bandsRe = (): string => rules.bands.map((b) => b.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');

/**
 * How far away the spell can be cast, in game units (from the edge of the caster's space), or null: on the
 * caster (Self), or not said, or no distance (Sight, Unlimited). Touch and melee: one square.
 */
export function rangeOf(spell: SpellEntry): number | null {
  const r = String(spell.range ?? '').trim();
  if (!r || /^(self|s:)/i.test(r)) return null;
  if (/^touch/i.test(r)) return square();
  if (/^melee/i.test(r) && !bandSize('melee')) return square();
  let m: RegExpExecArray | null;
  if ((m = new RegExp(String.raw`(\d+(?:\.\d+)?)\s*-?\s*` + UNIT, 'i').exec(r))) return toGame(num(m[1]), m[2]);
  if ((m = /\bwithin (\d+)\b/i.exec(r))) return toGame(num(m[1]), '');                  // Draw Steel: "3 cube within 10"
  if ((m = /^(\d+)$/.exec(r))) return toGame(num(m[1]), '');
  const bands = bandsRe();
  if (bands && (m = new RegExp(`\\b(${bands})\\b`, 'i').exec(r))) return bandSize(m[1]) || null;
  return null;
}

/**
 * How far a spell teleports its caster (game units), or null: "you teleport up to 30 feet" (Misty Step), "you
 * teleport to a location within range" / "teleport yourself … within range" (Dimension Door, Thunder Step: its
 * range). Not one that teleports others ("you teleport each affected target").
 */
export function teleportOf(spell: SpellEntry): number | null {
  const d = String(spell.descFull ?? '');
  const m = /\byou\s+teleport(?!\s+(?:each|any|a|an|one|the|that|those|them|it|up to (?:\w+ )?(?:willing|creatures?|targets?))\b)|\bteleport\s+yourself\b/i.exec(d);
  if (!m) return null;
  const after = d.slice(m.index, m.index + 160);
  const up = new RegExp(String.raw`up to (\d+(?:\.\d+)?)\s*-?\s*` + UNIT, 'i').exec(after);
  if (up) return toGame(num(up[1]), up[2] ?? '');
  return rangeOf(spell);
}

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
    const length = wall[1] ? num(wall[1]) : (words[wall[2].toLowerCase()] ?? num(wall[2])) * num(wall[3]);
    const thick = /(\d+) (?:feet|foot) thick/i.exec(text);
    const inches = /(\d+) inch(?:es)? thick/i.exec(text);
    const ring = /ring(?:ed wall)? up to (\d+) feet in diameter|circle that has an? (\d+)-foot diameter/i.exec(text);
    const blocks: WallBlocks = /blocks line of sight|is opaque|opaque wall/i.test(text) ? 'sight'
      : /Nothing can physically pass through/i.test(text) ? 'movement'
      : /Wall of (Stone|Ice|Iron)/i.test(String(spell.name)) ? 'solid' : 'none';
    found.push({ at: wall.index, area: { shape: 'wall', size: length, width: thick ? num(thick[1]) : inches ? Math.max(0.1, num(inches[1]) / 12) : 1, ...(ring ? { ring: num(ring[1] ?? ring[2]) } : {}), blocks, from: 'point', lasting: last } });
  }
  // the patterns above read feet (as 5e writes them): into game units
  for (const f of found) f.area = inGame(f.area);
  if (!found.length) generic(text, range, self, last, found);
  found.sort((x, y) => x.at - y.at);
  if (found.length && found[0].area.size > 0) return found[0].area;
  let m: RegExpExecArray | null;
  // the sheet's own short form when the text has none: "S:15-ft rad", "S:15ft cone", "S:15ft cube", "S:60-ft line"
  if ((m = /^S:(\d+)-?ft\s*(rad|cone|cube|line)/i.exec(range))) {
    const k = m[2].toLowerCase();
    const shape: Shape = k === 'rad' ? 'emanation' : (k as Shape);
    return inGame({ shape, size: num(m[1]), ...(shape === 'line' ? { width: 5 } : {}), from: 'caster', lasting: last });
  }
  return null;
}

/**
 * Areas as other games write them, for text the 5e patterns above don't match: Pathfinder's "20-foot burst",
 * "30-foot emanation"; metric ("a 6 m radius", "6-metre cone"); Old-School Essentials' "20' radius"; Draw Steel's
 * "3 burst", "3 cube within 10", "5 × 1 line"; and range bands (Daggerheart's "all targets within Close range",
 * Shadowdark's "a Near-sized cube").
 */
/** An area read in feet, in game units. */
function inGame(a: Area): Area {
  return { ...a, size: fromFeet(a.size), ...(a.width !== undefined ? { width: fromFeet(a.width) } : {}), ...(a.ring !== undefined ? { ring: fromFeet(a.ring) } : {}) };
}

function generic(text: string, range: string, self: boolean, last: boolean, found: Array<{ at: number; area: Area }>): void {
  const D = String.raw`(\d+(?:\.\d+)?)[\s-]*` + UNIT + String.raw`[\s-]*`;
  const look = (re: RegExp, make: (m: RegExpExecArray) => Area | null) => { const m = re.exec(text); if (m) { const a = make(m); if (a && a.size > 0) found.push({ at: m.index, area: a }); } };
  const ft = (n: string, u: string) => toGame(num(n), u);
  look(new RegExp(D + String.raw`(?:radius\s+)?(burst|sphere|radius|circle)\b`, 'i'), (m) => ({ shape: 'radius', size: ft(m[1], m[2]), from: self ? 'caster' : 'point', lasting: last }));
  look(new RegExp(D + String.raw`(emanation|aura)\b`, 'i'), (m) => ({ shape: 'emanation', size: ft(m[1], m[2]), from: 'caster', lasting: last }));
  look(new RegExp(D + String.raw`cone\b`, 'i'), (m) => ({ shape: 'cone', size: ft(m[1], m[2]), from: 'caster', lasting: last }));
  look(new RegExp(D + String.raw`(cube|square)\b(?![\s-]*portion)`, 'i'), (m) => ({ shape: 'cube', size: ft(m[1], m[2]), from: self ? 'caster' : 'point', lasting: last }));
  look(new RegExp(D + String.raw`line\b`, 'i'), (m) => ({ shape: 'line', size: ft(m[1], m[2]), width: square(), from: 'caster', lasting: last }));
  // squares, with no unit (Draw Steel): "3 burst" round the caster, "3 cube within 10", "5 × 1 line within 1"
  look(/\b(\d+) (burst|aura)\b/i, (m) => ({ shape: 'emanation', size: ft(m[1], ''), from: 'caster', lasting: last }));
  look(/\b(\d+) cube within \d+/i, (m) => ({ shape: 'cube', size: ft(m[1], ''), from: 'point', lasting: last }));
  look(/\b(\d+) ?[×x] ?(\d+) line\b/i, (m) => ({ shape: 'line', size: ft(m[1], ''), width: ft(m[2], ''), from: 'caster', lasting: last }));
  // range bands
  const bands = bandsRe();
  if (bands) {
    look(new RegExp(`\\b(${bands})[\\s-]*sized? (cube|square|area)\\b`, 'i'), (m) => ({ shape: 'cube', size: bandSize(m[1]), from: 'point', lasting: last }));
    look(new RegExp(`\\b(?:all|each|every|any)\\b[^.]*?\\bwithin (${bands})(?: range)?\\b`, 'i'), (m) => ({ shape: 'emanation', size: bandSize(m[1]), from: 'caster', lasting: last }));
  }
  void range;
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
    return { shape: 'line', size: squares(6), width: square(), from: 'caster', lasting: false, target: 'bolt' };
  if (/\b(creatures?|targets?|humanoids?|beasts?|allies|ally|willing)\b/i.test(text) && !/^self$/i.test(range))
    return { shape: 'emanation', size: 0, from: 'caster', lasting: last, target: 'on' };
  return null;
}

/**
 * A spell whose text names no area and no creatures: on its caster when its range is Self (Shield, Mage Armor on
 * yourself), else a square's worth at a point in range (Mage Hand, Minor Illusion). Every spell can be cast.
 */
export function fallbackArea(spell: SpellEntry): Area {
  const self = /^self/i.test(String(spell.range ?? '').trim());
  return self ? { shape: 'emanation', size: 0, from: 'caster', target: 'on', self: true, lasting: lasting(spell) } : { shape: 'radius', size: square() / 2, from: 'point', lasting: lasting(spell) };
}

/** How an area reads: "20 ft radius", "15 ft cone", "100 × 5 ft line" (in the game's unit). */
export function describe(a: Area): string {
  const u = unitLabel(), n = (x: number) => String(Math.round(x * 10) / 10);
  if (a.target === 'bolt') return 'a bolt at each creature you click';
  if (a.target === 'on') return a.self ? (a.size ? `${n(a.size)} ${u} around the caster` : 'on the caster') : a.size ? `${n(a.size)} ${u} around each creature you click` : 'on each creature you click';
  switch (a.shape) {
    case 'radius': return `${n(a.size)} ${u} radius${a.from === 'caster' ? ' around the caster' : ''}`;
    case 'emanation': return `${n(a.size)} ${u} around the caster`;
    case 'cone': return `${n(a.size)} ${u} cone`;
    case 'cube': return `${n(a.size)} ${u} cube${a.from === 'caster' ? ' from the caster' : ''}`;
    case 'line': return `${n(a.size)} × ${n(a.width ?? square())} ${u} line`;
    case 'wall': return a.round && a.ring ? `${n(a.ring)} ${u} ring wall` : `${n(a.size)} ${u} wall`;
  }
}
