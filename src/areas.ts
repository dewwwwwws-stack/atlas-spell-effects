import { rollSpecOf, untag } from './rolls';
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

export interface SpellEntry { key: string; name: string; range?: string; duration?: string; descFull?: string; desc?: string; level?: number; school?: string; /** A creature's ability read from its statblock (Fire Breath), not a spell. */ ability?: boolean; /** A plain attack (a sword, a bite) or a save at one creature (Stunning Strike): rolled at a creature, with no area and no animation. */ plain?: 'attack' | 'save' | 'damage' }

export const num = (s: string | undefined): number => { const n = Number(s); return Number.isFinite(n) && n > 0 ? n : 0; };

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

export const UNIT = String.raw`(foot|feet|ft\.?|'|’|′|kilometers?|kilometres?|km|meters?|metres?|m|miles?|yards?|yds?|squares?)(?![a-z])`;
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
  // (an ability's "Emanation originating from and including the target": round the creature it's used on)
  look(/(\d+)-foot Emanation(\s+originating from (?:and including )?(?:the|that|a) (?:target|creature)\b)?/i, (m) => ({ shape: 'emanation', size: num(m[1]), from: 'caster', lasting: last, ...(spell.ability && m[2] ? { target: 'on' as const } : {}) }));
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
  // an ability with no shape named: "each creature within 120 feet of the dragon"
  if (spell.ability && (m = new RegExp(String.raw`\b(?:each|every|all|any)\b[^.]*?\bwithin (\d+(?:\.\d+)?)\s*-?\s*` + UNIT + String.raw`\s+of\s+(?:the|it|its|him|her|them|that)\b`, 'i').exec(text)))
    return { shape: 'emanation', size: toGame(num(m[1]), m[2]), from: 'caster', lasting: last };
  // or no "of" at all (other games): "All within 30' must save", "everyone within 3 yards"
  if (spell.ability && (m = new RegExp(String.raw`\b(?:each|every|all|any|anyone|anybody|everyone|everything)\b(?:\s+(?:other\s+)?(?:creatures?|enemies|foes|targets?|living|beings?|others?))?(?:\s+(?:meeting|hearing|seeing|who|that|which)\b[^.,;]{0,24}?)?\s+within (\d+(?:\.\d+)?)\s*-?\s*` + UNIT + String.raw`(?!\s*of\b)`, 'i').exec(text)))
    return { shape: 'emanation', size: toGame(num(m[1]), m[2]), from: 'caster', lasting: last };
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
  // (an aura is always on)
  look(new RegExp(D + String.raw`(emanation|aura)\b`, 'i'), (m) => ({ shape: 'emanation', size: ft(m[1], m[2]), from: 'caster', lasting: last || /aura/i.test(m[3]) }));
  // Pathfinder's aura trait, its size after it: "Stench (aura, olfactory) 30 feet"
  look(new RegExp(String.raw`\(\s*aura\b[^)]*\)\s*` + D, 'i'), (m) => ({ shape: 'emanation', size: ft(m[1], m[2]), from: 'caster', lasting: true }));
  look(new RegExp(D + String.raw`cone\b`, 'i'), (m) => ({ shape: 'cone', size: ft(m[1], m[2]), from: 'caster', lasting: last }));
  // its length after it: "Cone 90' long and 30' wide" (Old-School Essentials), "a 3m wide cone, 8m long"
  look(new RegExp(String.raw`\bcone\b[^.]{0,24}?` + D + String.raw`(?:long|in length)\b`, 'i'), (m) => ({ shape: 'cone', size: ft(m[1], m[2]), from: 'caster', lasting: last }));
  look(new RegExp(String.raw`\bline\b[^.]{0,24}?` + D + String.raw`(?:long|in length)\b(?:,?\s*(?:and\s*)?` + D + String.raw`wide)?`, 'i'), (m) => ({ shape: 'line', size: ft(m[1], m[2]), width: m[3] ? ft(m[3], m[4]) : square(), from: 'caster', lasting: last }));
  // a cloud or an area by its sides: "Cloud 50' × 40' × 20'"
  look(new RegExp(String.raw`\b(?:cloud|area|box|zone)\b[^.]{0,12}?` + D + String.raw`[×x]\s*` + D, 'i'), (m) => ({ shape: 'cube', size: ft(m[1], m[2]), from: 'point', lasting: last }));
  look(new RegExp(D + String.raw`(cube|square)\b(?![\s-]*portion)`, 'i'), (m) => ({ shape: 'cube', size: ft(m[1], m[2]), from: self ? 'caster' : 'point', lasting: last }));
  look(new RegExp(D + String.raw`line\b`, 'i'), (m) => ({ shape: 'line', size: ft(m[1], m[2]), width: square(), from: 'caster', lasting: last }));
  // squares, with no unit (Draw Steel): "3 burst" round the caster, "3 cube within 10", "5 × 1 line within 1"
  look(/\b(\d+) (burst|aura)\b/i, (m) => ({ shape: 'emanation', size: ft(m[1], ''), from: 'caster', lasting: last || /aura/i.test(m[2]) }));
  look(/\b(\d+) cube within \d+/i, (m) => ({ shape: 'cube', size: ft(m[1], ''), from: 'point', lasting: last }));
  look(/\b(\d+) ?[×x] ?(\d+) line\b/i, (m) => ({ shape: 'line', size: ft(m[1], ''), width: ft(m[2], ''), from: 'caster', lasting: last }));
  look(/\b(\d+) wall within \d+/i, (m) => ({ shape: 'wall', size: ft(m[1], ''), width: square(), blocks: 'none', from: 'point', lasting: true }));
  // a radius after its shape: "a gas cloud with a radius of 5 yards"
  // (round a point it names, "centered on a point… to a radius of 300 feet"; else round itself, "pollen out to a
  // radius of 30 feet", "a cloak of silence to a radius of 2 feet")
  look(new RegExp(String.raw`\bradius of ` + D, 'i'), (m) => ({ shape: 'radius', size: ft(m[1], m[2]), from: !self && /\b(?:point|cent(?:er|re)d on|location|spot)\b/i.test(text.slice(0, m.index)) ? 'point' : 'caster', lasting: last }));
  // by its sides, each with its unit: "a 10m/yds x 10m/yds square area" (Cyberpunk RED)
  look(new RegExp(String.raw`(\d+(?:\.\d+)?)\s*` + UNIT + String.raw`(?:\/\w+)?\s*[×x]\s*\d+(?:\.\d+)?\s*` + UNIT + String.raw`(?:\/\w+)?\s*(?:square|area|cube)\b`, 'i'), (m) => ({ shape: 'cube', size: ft(m[1], m[2]), from: 'point', lasting: last }));
  // range bands
  const bands = bandsRe();
  if (bands) {
    const B = `(${bands})(?: range)?\\b`;
    const before = found.length;
    look(new RegExp(`\\b(${bands})[\\s-]*sized? (cube|square|area)\\b`, 'i'), (m) => ({ shape: 'cube', size: bandSize(m[1]), from: 'point', lasting: last }));
    // at a point, an area round it: "a point within Far range. All targets within Very Close range of that point"
    look(new RegExp(`\\b(?:point|spot|location|place)\\b[^.]*?\\bwithin ${B}[\\s\\S]*?\\bwithin ${B} of (?:that|the|this|its|their) (?:point|spot|location|place|impact)\\b`, 'i'), (m) => ({ shape: 'radius', size: bandSize(m[2]), from: 'point', lasting: last }));
    // in front of it: a cone ("…in front of the Dragon within Close range", "a Close-range cone")
    look(new RegExp(`\\bin front of\\b[^.]*?\\b(?:within|up to|out to) ${B}`, 'i'), (m) => ({ shape: 'cone', size: bandSize(m[1]), from: 'caster', lasting: last }));
    look(new RegExp(`\\b(${bands})[\\s-]*(?:range[\\s-]*)?cone\\b|\\bcone\\b[^.]*?\\b(?:within|up to|out to) ${B}`, 'i'), (m) => ({ shape: 'cone', size: bandSize(m[1] ?? m[2]), from: 'caster', lasting: last }));
    // a line: "in a line within Far range", "a line out to Close range", "a line of lightning, near length"
    look(new RegExp(`\\b(?:in )?an? (?:straight |narrow )?line\\b[^.]*?\\b(?:within|up to|out to|to) ${B}`, 'i'), (m) => ({ shape: 'line', size: bandSize(m[1]), width: square(), from: 'caster', lasting: last }));
    look(new RegExp(`\\bline\\b[^.]*?\\b(${bands})[\\s-]*(?:length|long)\\b`, 'i'), (m) => ({ shape: 'line', size: bandSize(m[1]), width: square(), from: 'caster', lasting: last }));
    // round it, when none of those: "all targets within Very Close range", "each PC within Far range", "creatures
    // within close range of the troglodyte"
    if (found.length === before) look(new RegExp(`\\b(?:all|each|every|any|everyone|everything|creatures|enemies|foes|targets|adversaries)\\b[^.]*?\\bwithin ${B}`, 'i'), (m) => ({ shape: 'emanation', size: bandSize(m[1]), from: 'caster', lasting: last }));
  }
  // a cone, or everyone next to it, with no size (Cairn), when nothing else is named: a cone of three squares, a
  // square round it
  if (!found.length) {
    look(/\bin a cone\b(?!\s*(?:of\s+)?\d)/i, () => ({ shape: 'cone', size: squares(3), from: 'caster', lasting: last }));
    look(/\b(?:all|each|every|any)\b[^.]{0,20}?\badjacent\b(?!\s+to\b)/i, () => ({ shape: 'emanation', size: square(), from: 'caster', lasting: last }));
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
  if (spell.plain) return { shape: 'emanation', size: 0, from: 'caster', lasting: false, target: 'on' };
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

/**
 * A creature's ability with an area, from its own text in its statblock (nothing is looked up): Fire Breath's
 * "60-foot Cone", "a 30-foot-radius Sphere centered on a point … within 120 feet". Null when its text names no
 * area. It lasts when its text says so ("lasts for 1 minute", "Until the start of its next turn, that area…").
 */
export function abilityEntry(name: string, text: string): SpellEntry | null {
  const t = untag(text).replace(/\s+/g, ' ').trim();
  const nm = name.replace(/\s+/g, ' ').trim();
  if (!t || !nm) return null;
  const within = new RegExp(String.raw`\b(?:point|space|location|ground|creature|target)\b[^.]*?\bwithin (\d+)\s*-?\s*` + UNIT, 'i').exec(t)
    ?? new RegExp(String.raw`\brange (\d+)(?:\/\d+)?\s*` + UNIT, 'i').exec(t)
    // (Pathfinder's "10-foot burst within 60 feet", Old-School Essentials' "sphere of fire within 240'")
    ?? new RegExp(String.raw`\b(?:burst|sphere|radius|cube|cloud|blast|explosion)\b[^.]*?\bwithin (\d+)\s*-?\s*` + UNIT, 'i').exec(t)
    // (Draw Steel, in squares: "3 cube within 10", "10 wall within 10")
    ?? (() => { const d = /\b(?:cube|wall|line) within (\d+)\b(?!\s*(?:feet|foot|ft|'|m\b|meters?|metres?|yards?))/i.exec(t); return d ? Object.assign([d[0], d[1], 'squares'], { index: d.index, input: t }) as unknown as RegExpExecArray : null; })();
  // (Daggerheart names each feature's kind after it: "Frost Aura - Passive" is always on, as an aura is)
  const passive = /\s[-–—]\s*Passive\s*$|\(Passive\)\s*$/i.test(nm);
  const last = passive || /\blasts? (?:for|until)\b|\b(?:until|during)\b[^.]*\b(?:that|the|this) (?:area|movement|emanation|cone|sphere|cube|cylinder|line|cloud|zone|aura)\b/i.test(t);
  const e: SpellEntry = { key: '', name: nm, range: '', duration: last ? 'Lasting' : 'Instantaneous', descFull: t, ability: true };
  // (an attack first of all: its reach, or what happens to a creature it swallows "within 10 feet", is no area: a
  // Purple Worm's Bite is an attack)
  const attackFirst = /^(?:melee|ranged)(?: or ranged)?(?: weapon| spell)? attack(?: roll)?\s*:|^(?:melee|ranged)(?:, [^:]{0,40})?:\s*[+-]\d+ to hit/i.test(t);
  const a = attackFirst ? null : areaOf(e);
  if (!a || !(a.size > 0)) {
    // a plain attack ("Melee Attack Roll: +7… Hit: 10 (2d6 + 3) Slashing damage", "Melee: +2 to hit. Hit: 1d6-1
    // Bludgeoning"): rolled at the creature clicked
    // or a save made by one creature ("Stunning Strike… the target must succeed on a Constitution saving throw",
    // "Dreadful Glare. Wisdom Saving Throw: DC 11, one creature the mummy can see")
    const r = rollSpecOf(t);
    // (its bonus not given: a summoned creature's, its summoner's spell attack modifier: asked on its card)
    const lead = /^\s*(?:Melee|Ranged)(?: or Ranged)? (?:Spell |Weapon )?Attack(?: Roll)?:/i.test(t);
    const attack = !!r && r.kind === 'attack' && (r.bonus !== undefined || lead) && (r.damage.length > 0 || !!r.after || /\bHit:/i.test(t));      // (a hit that only restrains or grapples counts too)
    const save = !!r && r.kind === 'save' && /Saving Throw:\s*DC|\bmust (?:make|succeed on)\b[^.]{0,40}\bsaving throw|\b(?:target|creature)\b[^.]{0,40}\b(?:makes?|succeeds?)\b[^.]{0,40}\bsaving throw/i.test(t)
      && !/\ballows? (?:it|you|them) to make\b|\bwhen (?:it|you) (?:make|succeed|fail)/i.test(t);
    // or damage dealt straight to a creature, no roll ("…deals 9 (2d8) force damage to that creature", "the target
    // takes 7 (2d6) fire damage"): not more damage on another attack ("…makes one Claw attack. If it hits, it deals an
    // extra 3 (1d6)"), nor damage it takes itself
    const dealt = !!r && r.kind === 'damage' && r.damage.length > 0
      && /\b(?:one|a|that|the|each|this) (?:creature|target|attacker|enemy|humanoid|foe)\b|\btargets? (?:one|a)\b|\bto (?:it|the creature|the target|the attacker|that creature)\b/i.test(t)
      && !/\b(?:extra|additional)\b[^.]{0,40}\bdamage\b|\bmakes? (?:one|a|an|two|three)\b[^.]{0,40}\battacks?\b|\buses? (?:its )?Multiattack\b|\bwhen (?:it|he|she|they|the \w+) (?:takes?|is hit)\b[^.]{0,30}$|\badds? \d+d\d+\b/i.test(t);
    // or one creature in a range band (Daggerheart: "Make an attack against a target within Close range"; "a PC
    // within Far range must…"): cast on the creature clicked, within that range
    const bands = bandsRe();
    // (Draw Steel's: "Distance Melee 1 Target One creature", "Distance Ranged 10 Target One creature or object")
    // ("Melee 1 or ranged 5": as far as it reaches)
    const ds = /\bDistance\s+(?:Melee|Ranged)\s+(\d+)\b(?:\s+or\s+(?:melee|ranged)\s+(\d+))?[\s\S]*?\bTarget\s+(?:One|Two|Three|\d+)\s+(?:creatures?|enemy|enemies|ally|allies|targets?|objects?)\b/i.exec(t);
    if (ds && !save) {
      e.key = `ability:${nm.toLowerCase()}:one`; e.range = `${Math.max(Number(ds[1]), Number(ds[2] ?? 0))} squares`;
      return e;
    }
    const one = bands ? new RegExp(`\\b(?:against|at|on|choose|target|targets) (?:a|one|the|another|any) (?:single )?(?:target|creature|PC|enemy|foe|adversary|ally)\\b[^.]*?\\bwithin (${bands})(?: range)?\\b|\\b(?:a|one) (?:target|creature|PC|enemy|foe)\\b (?:within (${bands})(?: range)?)\\b[^.]*?\\b(?:must|takes?|is|becomes?|loses?|marks?)\\b|^(?:one|a|1) (?:target|creature|enemy|foe)\\b (?:within (${bands})(?: range)?)\\b`, 'i').exec(t) : null;
    // (an attack with no bonus of its own in a band, or damage dealt there, Daggerheart's: nothing to roll it with,
    // it's aimed at the creature)
    if (one && !save && !(attack && (r?.bonus !== undefined || lead))) {
      e.key = `ability:${nm.toLowerCase()}:one`; e.range = one[1] ?? one[2] ?? one[3];
      return e;
    }
    if (!attack && !save && !dealt) return null;
    e.plain = attack ? 'attack' : save ? 'save' : 'damage'; e.key = `ability:${nm.toLowerCase()}:${e.plain}`;
    // how far it can go: the farthest of its reach and its ranges ("reach 5 ft. or range 150 ft.": 150;
    // "range 80/320 ft.": 320, with disadvantage past 80)
    const far = Math.max(r?.reach ?? 0, r?.short ?? 0, r?.long ?? 0);
    if (far > 0) e.range = `${far} ft.`;
    else if (within) e.range = `${within[1]} ${within[2]}`;                 // a save at one creature "within 60 feet"
    return e;
  }
  // how far away it can be put: a point's (not "each creature within 120 feet of it", which is its area)
  if (within && (a.from === 'point' || a.target) && toGame(num(within[1]), within[2]) !== a.size) e.range = `${within[1]} ${within[2]}`;
  // (in a range band: "a point within Far range")
  const bands = bandsRe();
  const bandAt = bands && a.from === 'point' && !e.range ? new RegExp(`\\b(?:point|spot|location|place|creature|target)\\b[^.]*?\\bwithin (${bands})(?: range)?\\b`, 'i').exec(t) : null;
  if (bandAt && bandSize(bandAt[1]) !== a.size) e.range = bandAt[1];
  e.key = `ability:${nm.toLowerCase()}:${a.shape}:${a.size}`;
  return e;
}
