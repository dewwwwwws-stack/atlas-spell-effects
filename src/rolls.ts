// Rolling a spell's or ability's attacks, saves and damage, D&D 5e (2014 and 2024): read from its own text and from
// the statblocks of its caster and targets (nothing is looked up). What can't be read is left for the GM to fill in.

export type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
export const ABILITIES: readonly Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const ABILITY_NAMES: Record<string, Ability> = {
  strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha',
  str: 'str', dex: 'dex', con: 'con', int: 'int', wis: 'wis', cha: 'cha',
};
export const ABILITY_LABEL: Record<Ability, string> = { str: 'Str', dex: 'Dex', con: 'Con', int: 'Int', wis: 'Wis', cha: 'Cha' };

export interface DamagePart { dice: string; type: string }
/** What a spell's text says it rolls. */
export interface RollSpec {
  /** The conditions it gives a creature it hits or that fails its save (names: Stunned, Grappled), offered on its card. */
  conds?: string[];
  /** A magic weapon's attack (a +2 Greatsword, a Very Rare one): it gets past resistances to nonmagical attacks. */
  magic?: boolean;
  /** An attack's reach, and its normal and long range ("reach 5 ft. or range 20/60 ft."), in feet; a ranged one. */
  reach?: number; short?: number; long?: number; ranged?: boolean;
  /**
   * What follows the attack, hit or miss (Ice Knife's shard explodes: a Dexterity save for the target and each
   * creature within `near` feet of it).
   */
  after?: RollSpec; near?: number;
  /** (`after`) only on a hit (a spider's poison), not hit or miss (Ice Knife). */
  onHit?: boolean;
  /** The damage instead on a creature missing any of its hit points (Toll the Dead: 1d12, not 1d8). */
  hurt?: DamagePart;
  /** The damage type the higher slot adds to (else the first). */
  upcastType?: string;
  /** A weapon attack made with the spell (Booming Blade): the weapon's damage is yours to add on its card. */
  weapon?: boolean;
  /** Healing (Cure Wounds): `damage[0]` is the dice healed (no type), plus the caster's spellcasting modifier. */
  healMod?: boolean;
  /** An attack roll (and its bonus, where the text gives it: "Ranged Attack Roll: +10"), or a saving throw (and its DC). */
  kind: 'attack' | 'save' | 'damage' | 'heal';
  save?: Ability;
  dc?: number;
  bonus?: number;
  /** Damage on a hit or a failed save. */
  damage: DamagePart[];
  /** Half damage on a successful save. */
  half?: boolean;
  /** Its damage dice as the caster's level goes up (a cantrip's): [level, dice]. */
  scale?: [number, string][];
  /** Its spell level, and more damage dice for each slot level above it ("increases by 1d6 for each slot level above 3"). */
  level?: number;
  upcast?: string;
  /** Temporary hit points it gives (False Life: "1d4 + 4"), and more for each slot level above its own. */
  temp?: string;
  tempUp?: number;
  /** A spell (Magic Resistance counts), not a creature's ability. */
  spell?: boolean;
}

const DICE = String.raw`(\d+d\d+(?:\s*[+−–-]\s*\d+)?)`;
const TYPES = 'acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder';
const clean = (d: string): string => d.replace(/\s+/g, '').replace(/[−–]/g, '-');

/** What a spell's or ability's text rolls; null when it rolls nothing (no damage, attack or save). */
export function rollSpecOf(text: string | undefined): RollSpec | null {
  const t = String(text ?? '').replace(/\s+/g, ' ');
  if (!t) return null;
  // an attack, then a save after it (Ice Knife: "Make a ranged spell attack… Hit or miss, the shard explodes. The
  // target and each creature within 5 feet of it must succeed on a Dexterity saving throw"): each read on its own
  const atk = /\b(?:melee|ranged)(?: or ranged)? (?:spell |weapon )?attack\b|\bAttack Roll:/i.exec(t);
  const sav = /\b(?:Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) sav(?:ing throw|e)\b|\bSaving Throw:/i.exec(t);
  if (atk && sav && sav.index > atk.index && !/^\s*$/.test(t.slice(atk.index, sav.index))) {
    // (from the save's own sentence or clause: "…Piercing damage, and the target must make a DC 11 Constitution saving throw")
    const cut = Math.max(t.lastIndexOf('. ', sav.index) + 2, t.lastIndexOf(', and ', sav.index) + 6, t.lastIndexOf('; ', sav.index) + 2, atk.index + 1);
    const first = rollSpecOf(t.slice(0, cut)), then = rollSpecOf(t.slice(cut));
    // a rider with no damage of its own ("…or have the Prone condition"): the attack alone (its condition is offered on its card)
    if (first?.kind === 'attack' && then?.kind === 'save' && !then.damage.length) return first;
    if (first?.kind === 'attack' && then?.kind === 'save') {
      const near = /\bwithin (\d+) (?:feet|foot|ft\.?) of (?:it|the target|that creature|the creature)\b/i.exec(t.slice(cut));
      first.after = { ...then, ...(near ? { near: Number(near[1]) } : {}), ...(/\bhit or miss\b/i.test(t) ? {} : { onHit: true }) };
      // a slot's more dice: whichever part names them
      if (first.upcast && !then.upcast && /\bslot level above\b/i.test(t.slice(cut))) delete first.upcast;
      return first;
    }
  }
  const damage: DamagePart[] = [];
  let hurt: DamagePart | undefined;
  let firstAt = 0, lastEnd = 0;
  let m0: RegExpExecArray | null;
  // "59 (17d6) Fire damage", "8d6 fire damage", "1d10 + 4 Force damage", "4 (1d8) Piercing damage plus 3 (1d6) Fire damage"
  for (const m of t.matchAll(new RegExp(String.raw`(?:\d+\s*\(\s*` + DICE + String.raw`\s*\)|` + DICE + String.raw`)\s+([A-Za-z]+)\s+damage`, 'gi'))) {
    const dice = clean(m[1] ?? m[2] ?? ''); const type = (m[3] ?? '').toLowerCase();
    if (!dice || type === 'extra' || type === 'additional') continue;
    if (damage.some((d) => d.dice === dice && d.type === type)) continue;
    // after the first, only what comes with it, in the same sentence ("2d8 Fire damage plus 2d8 Necrotic damage",
    // "2d10 Bludgeoning damage and 4d6 Cold damage"): not damage at a later turn (Moonfire), from another of its
    // effects (Storm Sphere's bolt), a choice ("Radiant damage… or Necrotic damage"), or instead of it (Toll the
    // Dead's 1d12 on one that's hurt: kept apart)
    if (damage.length) {
      const at = m.index ?? 0;
      const from = t.lastIndexOf('. ', at) + 1, to = t.indexOf('. ', at);
      const sentence = t.slice(from, to < 0 ? undefined : to);
      if (/\binstead\b/i.test(sentence) && /missing any of its hit points|isn't at (?:its )?full|is damaged/i.test(sentence)) { hurt = { dice, type }; continue; }
      if (firstAt < from) continue;
      const between = t.slice(lastEnd, at);
      if (/\bor\b/i.test(between) && !/\b(?:plus|and)\b/i.test(between)) continue;
      if (/\binstead\b/i.test(between)) continue;
      if (/^\s*(?:at the (?:end|start) of (?:its|their|your|the target's) next turn|later|on (?:its|each of its|your) (?:next|subsequent) turns?)/i.test(t.slice(at + m[0].length))) continue;
    } else firstAt = m.index ?? 0;
    lastEnd = (m.index ?? 0) + m[0].length;
    damage.push({ dice, type });
    if (damage.length >= 3) break;
  }
  // a type you choose: "6d6 damage of the chosen type" (no resistance can be judged)
  if (!damage.length && (m0 = new RegExp(DICE + String.raw`\s+damage of (?:the|a|that) (?:chosen )?type`, 'i').exec(t))) damage.push({ dice: clean(m0[1]), type: '' });
  // a weapon's hit, as players' sheets and 2024 statblocks write it: "Hit: 1d6-1 Bludgeoning", "Hit: 30 Bludgeoning
  // damage", "Hit: 1d8 + 3 piercing plus 1d6 fire"
  const hit = /\bHit:\s*([^]*?)(?=\.\s+(?:[A-Z][a-z]+:|Mastery\b|If\b|The\b|On\b)|$)/i.exec(t)?.[1] ?? '';
  if (!damage.length && hit) {
    for (const m of hit.matchAll(new RegExp(String.raw`(?:\d+\s*\(\s*` + DICE + String.raw`\s*\)|` + DICE + String.raw`|\b(\d+))\s+(` + TYPES + String.raw`)\b`, 'gi'))) {
      const dice = clean(m[1] ?? m[2] ?? m[3] ?? ''); const type = (m[4] ?? '').toLowerCase();
      if (!dice || damage.some((d) => d.dice === dice && d.type === type)) continue;
      damage.push({ dice, type });
      if (damage.length >= 3) break;
    }
  }
  let m: RegExpExecArray | null;
  const spec: RollSpec = { kind: 'damage', damage };
  if ((m = /\b(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+Saving Throw:\s*DC\s*(\d+)/i.exec(t))) {
    spec.kind = 'save'; spec.save = ABILITY_NAMES[m[1].toLowerCase()]; spec.dc = Number(m[2]);
  } else if ((m = /\b(?:DC\s*(\d+)\s+)?(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+sav(?:ing throw|e)\b(?:[^.]{0,20}?DC\s*(\d+))?/i.exec(t))) {
    spec.kind = 'save'; spec.save = ABILITY_NAMES[m[2].toLowerCase()];
    const dc = Number(m[1] ?? m[3]); if (dc > 0) spec.dc = dc;
  } else if ((m = /\b(?:Melee|Ranged)(?: or Ranged)? (?:Spell |Weapon )?Attack(?: Roll)?:\s*([+−–-]\s*\d+)/i.exec(t))) {
    spec.kind = 'attack'; spec.bonus = Number(clean(m[1]));
  } else if ((m = /\b(?:Melee|Ranged)\b[^.:]{0,30}?:\s*([+−–-]\s*\d+)\s*(?:to hit\b|,)/i.exec(t)) || (m = /([+−–-]\s*\d+)\s+to hit\b/i.exec(t))) {
    // "Melee: +2 to hit", "Ranged (Longbow): +5 to hit", "+5 to hit"
    spec.kind = 'attack'; spec.bonus = Number(clean(m[1]));
  } else if (/\b(?:melee|ranged) spell attack\b|\bmake (?:a|an) (?:melee|ranged) (?:spell )?attack\b|\bspell attack (?:roll|against)\b/i.test(t)) {
    spec.kind = 'attack';
  }
  if (spec.kind === 'attack') {
    // its reach and ranges: "reach 10 ft.", "range 80/320 ft.", "reach 5 ft. or range 20/60 ft."
    if ((m = /\breach (\d+)\s*(?:ft\.?|feet)/i.exec(t))) spec.reach = Number(m[1]);
    if ((m = /\brange (\d+)(?:\s*\/\s*(\d+))?\s*(?:ft\.?|feet)/i.exec(t))) { spec.short = Number(m[1]); if (m[2]) spec.long = Number(m[2]); }
    if (/\branged (?:spell |weapon )?attack\b/i.test(t) && !/\bmelee or ranged\b/i.test(t)) spec.ranged = true;
    if (spec.short !== undefined && spec.reach === undefined) spec.ranged = true;
  }
  if (spec.kind === 'save') spec.half = /\bhalf (?:as much )?(?:the )?(?:initial )?damage\b|\bSuccess:\s*Half damage\b/i.test(t);
  // a cantrip's damage as levels go up: "levels 5 (2d10), 11 (3d10), and 17 (4d10)" / "at 5th level (2d10)"
  const scale: [number, string][] = [];
  for (const s of t.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?(?:\s+level)?\s*\((\d+d\d+)(?:\s+or\s+\d+d\d+)?\)/gi)) {
    const lv = Number(s[1]); if (lv >= 2 && lv <= 20 && /\blevels?\b/i.test(t)) scale.push([lv, s[2]]);
  }
  if (scale.length) spec.scale = scale.sort((a, b) => a[0] - b[0]);
  // more for a higher slot: "increases by 1d6 for each slot level above 3" / "above 1st"
  if ((m = /\bincreases? by (\d+d\d+)\b[^.]{0,90}?\bfor each (?:spell )?(?:slot )?level above (\d+)/i.exec(t))) {
    spec.upcast = m[1]; spec.level ??= Number(m[2]);
    // which damage grows: "The Fire damage increases by 1d8" (Throw Glaive's second part)
    const named = new RegExp(String.raw`\b(` + TYPES + String.raw`) damage increases? by\s*$`, 'i').exec(t.slice(Math.max(0, m.index - 40), m.index + 'increases by'.length + 1).replace(/increases? by.*$/i, 'increases by'));
    if (named) spec.upcastType = named[1].toLowerCase();
  }
  // temporary hit points: "gain 1d4 + 4 Temporary Hit Points", "5 Temporary Hit Points for each slot level above 1"
  if ((m = new RegExp(String.raw`\b(?:gains?|gets?|has|have)\s+` + String.raw`(\d+d\d+(?:\s*\+\s*\d+)?|\d+)` + String.raw`\s+temporary hit points`, 'i').exec(t))) spec.temp = clean(m[1]);
  if ((m = /\b(\d+) (?:additional |more )?temporary hit points for each (?:spell )?slot level above (\d+)/i.exec(t))) { spec.tempUp = Number(m[1]); spec.level ??= Number(m[2]); }
  if (hurt) spec.hurt = hurt;
  // a smite, cast as you hit ("As you hit the target, it takes an extra 1d6 Fire damage from the attack"): its damage,
  // no roll of its own (a save after it is for what lasts)
  if (/\bextra (?:\d+\s*\(\s*)?\d+d\d+\)?\s*\w*\s*damage from the attack\b|\bAs you hit\b|\btakes an extra\b[^.]*\bfrom the attack\b/i.test(t) && spec.kind !== 'attack') { spec.kind = 'damage'; delete spec.save; delete spec.dc; delete spec.half; }
  // a lasting boost to your hits (Hex, Hunter's Mark, Divine Favor: "an extra 1d6 Necrotic damage… whenever you hit"):
  // nothing to roll when cast (add it on an attack's card, as extra damage)
  else if (spec.kind === 'damage' && /\buntil the spell ends\b/i.test(t) && /\bextra (?:\d+\s*\(\s*)?\d+d\d+[^.]*\b(?:whenever you hit|on a hit|when you hit|hits? (?:it|a creature) with)/i.test(t)) return null;
  // a weapon attack made with the spell (Booming Blade, Green-Flame Blade): the weapon's damage is the caster's to
  // add; what the text rolls happens later or to someone else
  if (spec.kind === 'attack' && /\b(?:weapon attack's|attack's) normal effects\b|\bmake a melee attack with (?:it|the weapon|that weapon)\b/i.test(t)) { spec.weapon = true; spec.damage = []; delete spec.scale; }
  // healing: "regains a number of Hit Points equal to 2d8 plus your spellcasting ability modifier", "regains 4d8 Hit Points"
  if (spec.kind === 'damage' && !damage.length && !spec.temp) {
    const h = new RegExp(String.raw`\bregains? (?:a number of )?Hit Points equal to ` + DICE + String.raw`(\s*(?:\+|plus)\s*your spellcasting (?:ability )?modifier)?`, 'i').exec(t)
      ?? new RegExp(String.raw`\bregains? ` + DICE + String.raw`(\s*(?:\+|plus)\s*your spellcasting (?:ability )?modifier)? Hit Points`, 'i').exec(t);
    if (h) { spec.kind = 'heal'; damage.push({ dice: clean(h[1]), type: '' }); if (h[2]) spec.healMod = true; return spec; }
  }
  if (spec.kind === 'damage' && !damage.length && !spec.temp) return null;
  return spec;
}

/** Dice added together where they're the same die ("8d6" and "2d6": "10d6"; else both, "8d6+1d8" stays apart). */
function addDice(a: string, b: string, times: number): string {
  if (!(times > 0)) return a;
  const x = /^(\d+)d(\d+)([+-]\d+)?$/.exec(a), y = /^(\d+)d(\d+)$/.exec(b);
  if (x && y && x[2] === y[2]) return `${Number(x[1]) + Number(y[1]) * times}d${x[2]}${x[3] ?? ''}`;
  return a;
}
/** Its temporary hit points at a slot level (none: undefined). */
export function tempAt(spec: RollSpec, slot?: number | null): string | undefined {
  if (!spec.temp) return undefined;
  const up = slot && spec.level && slot > spec.level && spec.tempUp ? (slot - spec.level) * spec.tempUp : 0;
  if (!up) return spec.temp;
  const m = /^(.*?)([+-]\d+)?$/.exec(spec.temp)!;
  if (/^\d+$/.test(spec.temp)) return String(Number(spec.temp) + up);
  return `${m[1]}+${Number(m[2] ?? 0) + up}`;
}

/** Its damage at a caster's level (a cantrip's dice grow) and a slot level (a spell's, upcast); the first part only. */
export function damageAt(spec: RollSpec, level: number | null | undefined, slot?: number | null): DamagePart[] {
  if (spec.upcast && slot && spec.level && slot > spec.level && spec.damage.length) {
    const i = Math.max(0, spec.upcastType ? spec.damage.findIndex((d) => d.type === spec.upcastType) : 0);
    return spec.damage.map((d, k) => (k === i ? { dice: addDice(d.dice, spec.upcast!, slot - spec.level!), type: d.type } : d));
  }
  if (!spec.scale?.length || !level || !spec.damage.length) return spec.damage;
  let dice = '';
  for (const [lv, d] of spec.scale) if (level >= lv) dice = d;
  if (!dice) return spec.damage;
  const first = spec.damage[0];
  const plus = /([+-]\d+)$/.exec(first.dice)?.[1] ?? '';
  return [{ dice: dice + plus, type: first.type }, ...spec.damage.slice(1)];
}

// ── dice ──

/** A whole number from 1 to `sides`, fairly (the browser's own random source). */
export function die(sides: number, random: () => number = defaultRandom): number {
  return Math.min(sides, Math.floor(random() * sides) + 1);
}
function defaultRandom(): number {
  const c = globalThis.crypto;
  if (c?.getRandomValues) { const a = new Uint32Array(1); c.getRandomValues(a); return a[0] / 2 ** 32; }
  return Math.random();
}

export interface Rolled { total: number; dice: number[]; text: string }
/** "2d6+3" rolled (a crit: its dice twice). */
export function rollDice(formula: string, crit = false, random?: () => number): Rolled {
  const m = /^(\d+)d(\d+)([+-]\d+)?$/.exec(clean(formula));
  if (!m) { const n = Number(formula) || 0; return { total: n, dice: [], text: String(n) }; }
  const count = Number(m[1]) * (crit ? 2 : 1), sides = Number(m[2]), plus = Number(m[3] ?? 0);
  const dice = Array.from({ length: Math.min(count, 100) }, () => die(sides, random));
  const total = Math.max(0, dice.reduce((a, b) => a + b, 0) + plus);
  return { total, dice, text: `${count}d${sides}${plus ? (plus > 0 ? '+' : '') + plus : ''}` };
}

// ── statblocks ──

/** What a creature's statblock says that rolls need. */
export interface Stats {
  ac?: number;
  /** Ability modifiers. */
  mods: Partial<Record<Ability, number>>;
  /** Saving throw bonuses it lists (else its modifiers). */
  saves: Partial<Record<Ability, number>>;
  resist: string[];
  immune: string[];
  vulnerable: string[];
  /** Its spell save DC and spell attack bonus, where it gives them. */
  dc?: number;
  hit?: number;
  /** Its proficiency bonus (given, or from its CR or level). */
  prof?: number;
  /** Legendary Resistance uses a day; Evasion; Magic Resistance (advantage on saves against spells). */
  legendary?: number;
  evasion?: boolean;
  magicRes?: boolean;
  /** Resistances only to nonmagical attacks (none against spells). */
  resistMundane?: string[];
  /**
   * Extra damage it can add when it hits (Sneak Attack, Martial Advantage): offered on its attack cards as a button,
   * for you to press when its rules are met (once a turn, with advantage or an ally beside the target…).
   */
  extras?: { name: string; dice: string; type?: string }[];
}

/** A Rogue's level in "Rogue 5", "Fighter 3 / Rogue 4" (else the first level named). */
function levelIn(cls: string): number | undefined {
  const m = /\bRogue\s*(\d+)/i.exec(cls) ?? /\b(\d+)\b/.exec(cls);
  const n = m ? Number(m[1]) : 0; return n > 0 && n <= 30 ? n : undefined;
}

/**
 * The extra damage a creature's traits add when it hits: "Sneak Attack (1/Turn). … an extra 7 (2d6) damage", "Martial
 * Advantage… an extra 10 (3d6) damage"; a player's Sneak Attack that grows with Rogue levels ("an extra 1d6 damage…
 * increases as you gain Rogue levels"): half its level, rounded up, in d6s. Its statblock lists, and its note's text.
 */
export function extrasOf(fields: Record<string, unknown>, text: string, level?: number): { name: string; dice: string; type?: string }[] {
  const out: { name: string; dice: string; type?: string }[] = [];
  const consider = (rawName: string, desc: string) => {
    const name = rawName.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/[*_.:\s]+$/g, '').replace(/^[*_\s]+/, '').trim();
    if (!name || name.length > 40 || out.some((x) => x.name.toLowerCase() === name.toLowerCase())) return;
    const d = desc.replace(/\s+/g, ' ');
    if (/included in the attack/i.test(d)) return;
    const m = new RegExp(String.raw`\bextra\s+(?:\d+\s*\(\s*)?(\d+d\d+)\s*\)?\s*(` + TYPES + String.raw`)?\s*damage`, 'i').exec(d);
    if (!m || !/\bhits?\b|\bhit (?:a|the|one)\b/i.test(d)) return;
    let dice = m[1];
    if (/sneak attack/i.test(name) && /increases as you gain|Sneak Attack column|Rogue level/i.test(d) && level) dice = `${Math.ceil(level / 2)}d6`;
    out.push({ name, dice, ...(m[2] ? { type: m[2].toLowerCase() } : {}) });
  };
  for (const key of ['traits', 'features', 'actions', 'bonus_actions', 'reactions', 'abilities', 'class_features', 'feats']) {
    const list = fields[key]; if (!Array.isArray(list)) continue;
    for (const it of list) if (it && typeof it === 'object') { const o = it as Record<string, unknown>; consider(String(o['name'] ?? ''), String(o['desc'] ?? o['description'] ?? o['entries'] ?? '')); }
  }
  // the note's own text: "***Sneak Attack (1/Turn).*** The …", "**Sneak Attack.** Once per turn…", "Sneak Attack: …"
  for (const line of text.replace(/^---\n[\s\S]*?\n---\n?/, '').split('\n')) {
    const m = /^[\s>#*_-]*([A-Z][A-Za-z’' ]{2,40}?)\s*(?:\([^)]*\))?\s*[.:]\s*[*_]*\s+(.+)$/.exec(line);
    if (m) consider(m[1], m[2]);
  }
  return out;
}

const num = (v: unknown): number | undefined => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const m = /-?\d+/.exec(String(v ?? '')); return m ? Number(m[0]) : undefined;
};
const mod = (score: number): number => Math.floor((score - 10) / 2);
const words = (v: unknown): string[] => {
  const s = (Array.isArray(v) ? v.map(String).join(', ') : String(v ?? '')).toLowerCase();
  return ['acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic', 'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder'].filter((w) => new RegExp(`\\b${w}\\b`).test(s));
};
const profFromCr = (cr: unknown): number | undefined => {
  const s = String(cr ?? '').trim(); if (!s) return undefined;
  const v = s.includes('/') ? 0 : Number(/\d+/.exec(s)?.[0]); if (!Number.isFinite(v)) return undefined;
  return v < 5 ? 2 : Math.min(9, 2 + Math.floor((v - 1) / 4));
};

/**
 * A statblock's numbers, from its fields (Fantasy Statblocks' and Atlas's 5e templates: ac, stats, saves,
 * damage_resistances…), and its text for a spellcaster's DC and attack bonus.
 */
export function statsOf(fields: Record<string, unknown> | null | undefined, text = ''): Stats {
  const f = fields ?? {};
  const get = (...keys: string[]): unknown => { for (const k of keys) { const hit = Object.keys(f).find((x) => x.toLowerCase().replace(/[\s-]+/g, '_') === k); if (hit && f[hit] !== undefined && f[hit] !== null && f[hit] !== '') return f[hit]; } return undefined; };
  // "bludgeoning, piercing, and slashing from nonmagical attacks": not against spells
  const split = (v: unknown): [unknown, string[]] => {
    const str = Array.isArray(v) ? v.map(String).join('; ') : String(v ?? '');
    const parts = str.split(/;/); const mundane = parts.filter((p) => /nonmagical|non-magical|not magical|aren['’]?t magical/i.test(p));
    return [parts.filter((p) => !mundane.includes(p)).join('; '), words(mundane.join(' '))];
  };
  const [resAll, resMundane] = split(get('damage_resistances', 'resistances'));
  const s: Stats = { mods: {}, saves: {}, resist: words(resAll), resistMundane: resMundane, immune: words(get('damage_immunities', 'immunities')), vulnerable: words(get('damage_vulnerabilities', 'vulnerabilities')) };
  const ac = get('ac', 'armor_class', 'armour_class');
  s.ac = num(typeof ac === 'object' && ac && !Array.isArray(ac) ? (ac as Record<string, unknown>)['value'] : ac);
  const stats = get('stats', 'abilities');
  if (Array.isArray(stats)) stats.slice(0, 6).forEach((v, i) => { const n = num(v); if (n !== undefined) s.mods[ABILITIES[i]] = mod(n); });
  for (const a of ABILITIES) {
    const full = Object.keys(ABILITY_NAMES).find((k) => k.length > 3 && ABILITY_NAMES[k] === a) ?? a;
    const n = num(get(full, a)); if (n !== undefined && s.mods[a] === undefined) s.mods[a] = mod(n);
  }
  // saves: [{dex: 5}, {wisdom: 3}], or "Dex +5, Wis +3"
  const sv = get('saves', 'saving_throws');
  const put = (k: string, v: unknown) => { const a = ABILITY_NAMES[k.toLowerCase().trim()]; const n = num(v); if (a && n !== undefined) s.saves[a] = n; };
  if (Array.isArray(sv)) for (const o of sv) { if (o && typeof o === 'object') for (const [k, v] of Object.entries(o as Record<string, unknown>)) put(k, v); }
  else if (sv && typeof sv === 'object') for (const [k, v] of Object.entries(sv as Record<string, unknown>)) put(k, v);
  else if (typeof sv === 'string') for (const m of sv.matchAll(/\b(str|dex|con|int|wis|cha)\w*\s*([+-]\s*\d+)/gi)) put(m[1], m[2].replace(/\s/g, ''));
  s.prof = num(get('proficiency_bonus', 'pb', 'prof')) ?? profFromCr(get('cr', 'challenge')) ?? (() => { const lv = num(get('level')); return lv ? 2 + Math.floor((lv - 1) / 4) : undefined; })();
  const all = (text + ' ' + JSON.stringify(f)).replace(/\s+/g, ' ');
  const lr = /Legendary Resistance\s*\((\d+)\s*\/\s*Day/i.exec(all); if (lr) s.legendary = Number(lr[1]);
  if (/\bEvasion\b/.test(all)) s.evasion = true;
  if (/\bMagic Resistance\b/.test(all)) s.magicRes = true;
  const dc = /spell save DC\s*(\d+)/i.exec(all); if (dc) s.dc = Number(dc[1]);
  const hit = /([+-]\d+)\s+to hit with spell attacks|spell attack (?:bonus|modifier)[^\d+-]{0,6}([+-]?\d+)/i.exec(all);
  if (hit) s.hit = Number(hit[1] ?? hit[2]);
  // a caster that gives neither: from its proficiency and best casting ability
  if ((s.dc === undefined || s.hit === undefined) && s.prof !== undefined && (s.mods.int !== undefined || s.mods.wis !== undefined || s.mods.cha !== undefined)) {
    const best = Math.max(s.mods.int ?? -5, s.mods.wis ?? -5, s.mods.cha ?? -5);
    s.dc ??= 8 + s.prof + best; s.hit ??= s.prof + best;
  }
  const extras = extrasOf(f, text, num(get('level')) ?? levelIn(String(get('class', 'classes') ?? '')));
  if (extras.length) s.extras = extras;
  return s;
}

// ── a roll against each target ──

export type Outcome = 'crit' | 'hit' | 'miss' | 'fumble' | 'failed' | 'saved' | 'damage' | 'heal';
export interface RollRow {
  id: string;
  name: string;
  /** The d20s (two with advantage or disadvantage) and the one kept; none for damage only. */
  d20?: number[];
  kept?: number;
  bonus?: number;
  /** Against: an AC or a DC (unknown: undefined, for the GM to judge). */
  against?: number;
  outcome: Outcome | 'unknown';
  /** Its damage before and after its resistances; and why it changed. */
  rolled: number;
  damage: number;
  why?: string;
  applied?: boolean;
  /** Why it rolled with advantage or disadvantage, or crit, or failed by itself (its conditions, Magic Resistance…). */
  note?: string;
  /** Extra damage added on its card (Sneak Attack, Divine Smite): "+3d6 piercing: 11". */
  extra?: string[];
  /** A failed save that Legendary Resistance could turn: its damage then. */
  onSave?: { rolled: number; damage: number; why?: string };
  legendary?: boolean;
  /** A save its player rolls: its damage either way, for Saved or Failed on its card. */
  own?: { saved: { rolled: number; damage: number; why?: string }; failed: { rolled: number; damage: number; why?: string } };
  /** Temporary hit points it gives this creature. */
  temp?: number;
}

/** Damage of a type on a creature: immune none, resistant half (rounded down), vulnerable double. */
export function damageOn(amount: number, type: string, s: Stats | null, magical = true): { damage: number; why?: string } {
  if (!s || !type) return { damage: amount };
  if (s.immune.includes(type)) return { damage: 0, why: `immune to ${type}` };
  let d = amount, why: string | undefined;
  if (s.resist.includes(type) || (!magical && s.resistMundane?.includes(type))) { d = Math.floor(d / 2); why = `resists ${type}`; }
  if (s.vulnerable.includes(type)) { d *= 2; why = why ? `${why}, vulnerable` : `vulnerable to ${type}`; }
  return { damage: d, ...(why ? { why } : {}) };
}

/**
 * Extra damage added to a row that hit, from its card (Sneak Attack, Divine Smite, Hex): "3d6", "2d8 radiant", "5";
 * its dice doubled on a crit, its type the attack's own unless given. False when the text can't be read.
 */
export function addExtra(row: RollRow, text: string, fallbackType: string, stats: Stats | null, magical: boolean, random?: () => number): boolean {
  const m = new RegExp(String.raw`^\s*(\d+d\d+(?:\s*[+−–-]\s*\d+)?|\d+)\s*(` + TYPES + String.raw`)?\s*(?:damage)?\s*$`, 'i').exec(text);
  if (!m) return false;
  const type = (m[2] ?? fallbackType).toLowerCase();
  const r = rollDice(clean(m[1]), row.outcome === 'crit', random);
  const d = damageOn(r.total, type, stats, magical);
  row.rolled += r.total; row.damage += d.damage;
  row.extra = [...(row.extra ?? []), `+${r.text}${type ? ` ${type}` : ''}: ${r.total}`];
  if (d.why && !(row.why ?? '').includes(d.why)) row.why = row.why ? `${row.why}, ${d.why}` : d.why;
  return true;
}

/** Each part's damage on a creature, added up. */
function totalOn(parts: { total: number; type: string }[], s: Stats | null, half: boolean, magical = true): { rolled: number; damage: number; why?: string } {
  let rolled = 0, damage = 0; const whys: string[] = [];
  for (const p of parts) {
    const base = half ? Math.floor(p.total / 2) : p.total;
    rolled += base;
    const d = damageOn(base, p.type, s, magical); damage += d.damage; if (d.why) whys.push(d.why);
  }
  return { rolled, damage, ...(whys.length ? { why: whys.join(', ') } : {}) };
}

export interface CastRoll { header: string; damageText: string; rows: RollRow[]; slot?: number }
export type Edge = 'normal' | 'advantage' | 'disadvantage';

/** A creature a spell is rolled against: its statblock, its conditions (Atlas's, by name or id), how far from the caster (feet). */
export interface Target { id: string; name: string; stats: Stats | null; conds?: readonly string[]; feet?: number; /** Missing any of its hit points. */ hurt?: boolean; /** A player character who rolls their own save (its row waits for Saved or Failed). */ own?: boolean }

const has = (conds: readonly string[] | undefined, ...names: string[]): boolean => !!conds?.some((c) => names.some((n) => c.toLowerCase().includes(n)));
/** Advantage and disadvantage together: neither. */
function edgeOf(base: Edge, adv: string[], dis: string[]): { edge: Edge; note?: string } {
  const a = base === 'advantage' || adv.length > 0, d = base === 'disadvantage' || dis.length > 0;
  const note = [...adv.map((x) => `advantage: ${x}`), ...dis.map((x) => `disadvantage: ${x}`)].join('; ');
  return { edge: a && d ? 'normal' : a ? 'advantage' : d ? 'disadvantage' : 'normal', ...(note ? { note: a && d ? `${note} (they cancel)` : note } : {}) };
}

/**
 * A spell's rolls against its targets (5e, 2014 and 2024 alike). An attack against each one's AC: a 20 a crit, its
 * damage dice doubled, as is any hit on a Paralyzed or Unconscious creature within 5 feet; a 1 a miss; advantage
 * and disadvantage from the target's and caster's conditions. Or each one's save against the DC, its damage rolled
 * once for all: Paralyzed, Stunned, Unconscious or Petrified fail Strength and Dexterity saves; Restrained has
 * disadvantage on Dexterity saves; Magic Resistance advantage against spells; Evasion takes none on a Dexterity
 * save for half, and half on a failure; Legendary Resistance can turn a failure (offered, not used).
 */
export function rollAgainst(spec: RollSpec, caster: Stats | null, targets: Target[], opts: { level?: number | null; slot?: number | null; edge?: Edge; random?: () => number; casterConds?: readonly string[] } = {}): CastRoll {
  const parts = damageAt(spec, opts.level, opts.slot);
  // on a creature missing hit points, its other die (Toll the Dead: as many d12s as it has d8s)
  const hurtParts = spec.hurt && parts.length ? [{ dice: parts[0].dice.replace(/d\d+/, `d${/d(\d+)/.exec(spec.hurt.dice)?.[1] ?? '12'}`), type: spec.hurt.type }, ...parts.slice(1)] : null;
  const partsOf = (t: Target) => (t.hurt && hurtParts ? hurtParts : parts);
  const base = opts.edge ?? 'normal';
  const throwD20 = (edge: Edge): { r: number[]; k: number } => {
    const r = edge !== 'normal' ? [die(20, opts.random), die(20, opts.random)] : [die(20, opts.random)];
    return { r, k: edge === 'advantage' ? Math.max(...r) : edge === 'disadvantage' ? Math.min(...r) : r[0] };
  };
  const slot = opts.slot && spec.level && opts.slot > spec.level ? opts.slot : undefined;
  const dmgText = parts.map((p) => `${p.dice} ${p.type}`).join(' + ');
  const magical = spec.spell !== false || !!spec.magic;
  const temp = tempAt(spec, opts.slot);
  const giveTemp = (): Partial<RollRow> => (temp ? { temp: rollDice(temp, false, opts.random).total } : {});
  const head = (h: string) => `${h}${slot ? ` · slot ${slot}` : ''}`;
  if (spec.kind === 'attack') {
    const bonus = spec.bonus ?? caster?.hit;
    const rows = targets.map((t): RollRow => {
      const adv: string[] = [], dis: string[] = [];
      const near = t.feet !== undefined && t.feet <= 5;
      if (has(t.conds, 'paralyz', 'stunned', 'unconscious', 'petrified', 'restrained')) adv.push(`target ${(t.conds ?? []).find((c) => /paralyz|stunned|unconscious|petrified|restrained/i.test(c))}`);
      if (has(t.conds, 'blinded')) adv.push('target can’t see');
      if (has(t.conds, 'prone')) (near ? adv : dis).push(near ? 'target prone, within 5 ft' : 'target prone, beyond 5 ft');
      if (has(t.conds, 'invisible')) dis.push('target unseen');
      if (has(opts.casterConds, 'blinded')) dis.push('caster can’t see');
      if (has(opts.casterConds, 'poisoned')) dis.push('caster poisoned');
      if (has(opts.casterConds, 'prone')) dis.push('caster prone');
      if (has(opts.casterConds, 'restrained')) dis.push('caster restrained');
      if (has(opts.casterConds, 'invisible')) adv.push('caster unseen');
      // ranges: past its normal range, disadvantage; past its long range, out of reach (yours to judge); a ranged
      // attack at a creature next to it, disadvantage (a reach that covers it makes it a melee one)
      const melee = spec.reach !== undefined && t.feet !== undefined && t.feet <= spec.reach + 0.5;
      let far = '';
      if (!melee && t.feet !== undefined) {
        if (spec.long !== undefined && t.feet > spec.long + 0.5) far = `out of range (${Math.round(t.feet)} ft, long range ${spec.long} ft)`;
        else if (spec.long === undefined && spec.short !== undefined && t.feet > spec.short + 0.5) far = `out of range (${Math.round(t.feet)} ft, range ${spec.short} ft)`;
        else if (spec.short !== undefined && t.feet > spec.short + 0.5) dis.push(`long range (${Math.round(t.feet)} ft)`);
        if ((spec.ranged || spec.short !== undefined) && near && !has(t.conds, 'paralyz', 'stunned', 'unconscious', 'petrified', 'incapacitated')) dis.push('ranged, target within 5 ft');      // (unless it can't act)
      }
      const e = edgeOf(base, adv, dis);
      const { r, k } = throwD20(e.edge);
      const ac = t.stats?.ac;
      let outcome: Outcome | 'unknown' = k === 20 ? 'crit' : k === 1 ? 'fumble' : bonus === undefined || ac === undefined ? 'unknown' : k + bonus >= ac ? 'hit' : 'miss';
      let note = [e.note, far].filter(Boolean).join('; ') || undefined;
      if (outcome === 'hit' && near && has(t.conds, 'paralyz', 'unconscious')) { outcome = 'crit'; note = [note, 'crit: paralyzed or unconscious, within 5 ft'].filter(Boolean).join('; '); }
      const hits = outcome === 'crit' || outcome === 'hit' || outcome === 'unknown';
      const rolled = partsOf(t).map((p) => ({ total: rollDice(p.dice, outcome === 'crit', opts.random).total, type: p.type }));
      const tot = hits ? totalOn(rolled, t.stats, false, magical) : { rolled: 0, damage: 0 };
      return { id: t.id, name: t.name, d20: r, kept: k, ...(bonus !== undefined ? { bonus } : {}), ...(ac !== undefined ? { against: ac } : {}), outcome, ...tot, ...(note ? { note } : {}), ...(hits ? giveTemp() : {}) };
    });
    return { header: head(bonus === undefined ? 'Attack (bonus ?)' : `Attack ${bonus >= 0 ? '+' : ''}${bonus}`), damageText: dmgText, rows, ...(slot ? { slot } : {}) };
  }
  if (spec.kind === 'save') {
    const dc = spec.dc ?? caster?.dc, ab = spec.save ?? 'dex';
    const rolledAll = parts.map((p) => ({ total: rollDice(p.dice, false, opts.random).total, type: p.type }));
    const rolledHurt = hurtParts ? hurtParts.map((p) => ({ total: rollDice(p.dice, false, opts.random).total, type: p.type })) : null;
    const rolled = rolledAll;
    const rows = targets.map((t): RollRow => {
      const rolled = t.hurt && rolledHurt ? rolledHurt : rolledAll;
      const adv: string[] = [], dis: string[] = [];
      if (spec.spell !== false && t.stats?.magicRes) adv.push('Magic Resistance');
      if (ab === 'dex' && has(t.conds, 'restrained')) dis.push('restrained');
      const autoFail = (ab === 'str' || ab === 'dex') && has(t.conds, 'paralyz', 'stunned', 'unconscious', 'petrified');
      const e = edgeOf(base, adv, dis);
      const { r, k } = throwD20(e.edge);
      const bonus = t.stats ? t.stats.saves[ab] ?? t.stats.mods[ab] : undefined;
      const outcome: Outcome | 'unknown' = autoFail ? 'failed' : bonus === undefined || dc === undefined ? 'unknown' : k + bonus >= dc ? 'saved' : 'failed';
      // Evasion: a Dexterity save for half takes none on a success, half on a failure
      const evade = ab === 'dex' && !!spec.half && !!t.stats?.evasion && !autoFail;
      const saved = evade ? { rolled: 0, damage: 0, why: 'Evasion' } : spec.half ? totalOn(rolled, t.stats, true, magical) : { rolled: 0, damage: 0 };
      const failed = evade ? { ...totalOn(rolled, t.stats, true, magical), why: 'Evasion: half' } : totalOn(rolled, t.stats, false, magical);
      const tot = outcome === 'saved' ? saved : failed;
      const note = [e.note, autoFail ? `fails ${ABILITY_LABEL[ab]} saves (${(t.conds ?? []).find((c) => /paralyz|stunned|unconscious|petrified/i.test(c))})` : ''].filter(Boolean).join('; ');
      // a player's own save: no roll here; its row waits for Saved or Failed (its damage on a failure meanwhile)
      if (t.own && !autoFail) return { id: t.id, name: t.name, ...(bonus !== undefined ? { bonus } : {}), ...(dc !== undefined ? { against: dc } : {}), outcome: 'unknown', ...failed, note: [e.note, 'their player rolls the save'].filter(Boolean).join('; '), own: { saved, failed }, ...giveTemp() };
      const lr = outcome === 'failed' && (t.stats?.legendary ?? 0) > 0;
      return { id: t.id, name: t.name, d20: r, kept: k, ...(bonus !== undefined ? { bonus } : {}), ...(dc !== undefined ? { against: dc } : {}), outcome, ...tot, ...(note ? { note } : {}), ...(lr ? { onSave: saved } : {}), ...(outcome !== 'saved' ? giveTemp() : {}) };
    });
    return { header: head(`${ABILITY_LABEL[ab]} save${dc === undefined ? ' (DC ?)' : ` DC ${dc}`}${spec.half ? ', half on a save' : ''}`), damageText: rolled.length ? `${dmgText}: ${rolled.map((p) => p.total).join(' + ')}` : '', rows, ...(slot ? { slot } : {}) };
  }
  if (spec.kind === 'heal') {
    // healing: its dice (one roll for all), plus the caster's spellcasting modifier where it says so
    const mod = spec.healMod ? (caster?.hit !== undefined && caster.prof !== undefined ? caster.hit - caster.prof : caster ? Math.max(caster.mods.int ?? -5, caster.mods.wis ?? -5, caster.mods.cha ?? -5) : undefined) : 0;
    const r = parts[0] ? rollDice(parts[0].dice, false, opts.random) : { total: 0, text: '' };
    const total = Math.max(0, r.total + (mod ?? 0));
    return {
      header: head(spec.healMod && mod === undefined ? 'Healing (+ modifier ?)' : 'Healing'),
      damageText: `${r.text}${spec.healMod ? ` + ${mod ?? '?'}` : ''}: ${total}`,
      rows: targets.map((t) => ({ id: t.id, name: t.name, outcome: 'heal' as const, rolled: total, damage: total })),
      ...(slot ? { slot } : {}),
    };
  }
  const rolled = parts.map((p) => ({ total: rollDice(p.dice, false, opts.random).total, type: p.type }));
  return {
    header: head(rolled.length ? 'Damage' : 'Temporary hit points'),
    damageText: rolled.length ? `${dmgText}: ${rolled.map((p) => p.total).join(' + ')}` : temp ? `${temp} temporary hit points` : '',
    rows: targets.map((t) => ({ id: t.id, name: t.name, outcome: 'damage' as const, ...totalOn(rolled, t.stats, false, magical), ...giveTemp() })),
    ...(slot ? { slot } : {}),
  };
}
