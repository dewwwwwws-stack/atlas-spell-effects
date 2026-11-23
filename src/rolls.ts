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
  /** An attack roll (and its bonus, where the text gives it: "Ranged Attack Roll: +10"), or a saving throw (and its DC). */
  kind: 'attack' | 'save' | 'damage';
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
const clean = (d: string): string => d.replace(/\s+/g, '').replace(/[−–]/g, '-');

/** What a spell's or ability's text rolls; null when it rolls nothing (no damage, attack or save). */
export function rollSpecOf(text: string | undefined): RollSpec | null {
  const t = String(text ?? '').replace(/\s+/g, ' ');
  if (!t) return null;
  const damage: DamagePart[] = [];
  // "59 (17d6) Fire damage", "8d6 fire damage", "1d10 + 4 Force damage", "4 (1d8) Piercing damage plus 3 (1d6) Fire damage"
  for (const m of t.matchAll(new RegExp(String.raw`(?:\d+\s*\(\s*` + DICE + String.raw`\s*\)|` + DICE + String.raw`)\s+([A-Za-z]+)\s+damage`, 'gi'))) {
    const dice = clean(m[1] ?? m[2] ?? ''); const type = (m[3] ?? '').toLowerCase();
    if (!dice || type === 'extra' || type === 'additional') continue;
    if (damage.some((d) => d.dice === dice && d.type === type)) continue;
    damage.push({ dice, type });
    if (damage.length >= 3) break;
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
  } else if (/\b(?:melee|ranged) spell attack\b|\bmake (?:a|an) (?:melee|ranged) (?:spell )?attack\b|\bspell attack (?:roll|against)\b/i.test(t)) {
    spec.kind = 'attack';
  }
  if (spec.kind === 'save') spec.half = /\bhalf (?:as much )?(?:the )?damage\b|\bSuccess:\s*Half damage\b/i.test(t);
  // a cantrip's damage as levels go up: "levels 5 (2d10), 11 (3d10), and 17 (4d10)" / "at 5th level (2d10)"
  const scale: [number, string][] = [];
  for (const s of t.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?(?:\s+level)?\s*\((\d+d\d+)\)/gi)) {
    const lv = Number(s[1]); if (lv >= 2 && lv <= 20 && /\blevels?\b/i.test(t)) scale.push([lv, s[2]]);
  }
  if (scale.length) spec.scale = scale.sort((a, b) => a[0] - b[0]);
  // more for a higher slot: "increases by 1d6 for each slot level above 3" / "above 1st"
  if ((m = /\bincreases? by (\d+d\d+) for each (?:spell )?slot level above (\d+)/i.exec(t))) { spec.upcast = m[1]; spec.level ??= Number(m[2]); }
  // temporary hit points: "gain 1d4 + 4 Temporary Hit Points", "5 Temporary Hit Points for each slot level above 1"
  if ((m = new RegExp(String.raw`\b(?:gains?|gets?|has|have)\s+` + String.raw`(\d+d\d+(?:\s*\+\s*\d+)?|\d+)` + String.raw`\s+temporary hit points`, 'i').exec(t))) spec.temp = clean(m[1]);
  if ((m = /\b(\d+) (?:additional |more )?temporary hit points for each (?:spell )?slot level above (\d+)/i.exec(t))) { spec.tempUp = Number(m[1]); spec.level ??= Number(m[2]); }
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
    const first = spec.damage[0];
    return [{ dice: addDice(first.dice, spec.upcast, slot - spec.level), type: first.type }, ...spec.damage.slice(1)];
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
  return s;
}

// ── a roll against each target ──

export type Outcome = 'crit' | 'hit' | 'miss' | 'fumble' | 'failed' | 'saved' | 'damage';
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
  /** A failed save that Legendary Resistance could turn: its damage then. */
  onSave?: { rolled: number; damage: number; why?: string };
  legendary?: boolean;
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
export interface Target { id: string; name: string; stats: Stats | null; conds?: readonly string[]; feet?: number }

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
  const base = opts.edge ?? 'normal';
  const throwD20 = (edge: Edge): { r: number[]; k: number } => {
    const r = edge !== 'normal' ? [die(20, opts.random), die(20, opts.random)] : [die(20, opts.random)];
    return { r, k: edge === 'advantage' ? Math.max(...r) : edge === 'disadvantage' ? Math.min(...r) : r[0] };
  };
  const slot = opts.slot && spec.level && opts.slot > spec.level ? opts.slot : undefined;
  const dmgText = parts.map((p) => `${p.dice} ${p.type}`).join(' + ');
  const magical = spec.spell !== false;
  const temp = tempAt(spec, opts.slot);
  const giveTemp = (t: Target): Partial<RollRow> => (temp ? { temp: rollDice(temp, false, opts.random).total } : {});
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
      const e = edgeOf(base, adv, dis);
      const { r, k } = throwD20(e.edge);
      const ac = t.stats?.ac;
      let outcome: Outcome | 'unknown' = k === 20 ? 'crit' : k === 1 ? 'fumble' : bonus === undefined || ac === undefined ? 'unknown' : k + bonus >= ac ? 'hit' : 'miss';
      let note = e.note;
      if (outcome === 'hit' && near && has(t.conds, 'paralyz', 'unconscious')) { outcome = 'crit'; note = [note, 'crit: paralyzed or unconscious, within 5 ft'].filter(Boolean).join('; '); }
      const hits = outcome === 'crit' || outcome === 'hit' || outcome === 'unknown';
      const rolled = parts.map((p) => ({ total: rollDice(p.dice, outcome === 'crit', opts.random).total, type: p.type }));
      const tot = hits ? totalOn(rolled, t.stats, false, magical) : { rolled: 0, damage: 0 };
      return { id: t.id, name: t.name, d20: r, kept: k, ...(bonus !== undefined ? { bonus } : {}), ...(ac !== undefined ? { against: ac } : {}), outcome, ...tot, ...(note ? { note } : {}), ...(hits ? giveTemp(t) : {}) };
    });
    return { header: head(bonus === undefined ? 'Attack (bonus ?)' : `Attack ${bonus >= 0 ? '+' : ''}${bonus}`), damageText: dmgText, rows, ...(slot ? { slot } : {}) };
  }
  if (spec.kind === 'save') {
    const dc = spec.dc ?? caster?.dc, ab = spec.save ?? 'dex';
    const rolled = parts.map((p) => ({ total: rollDice(p.dice, false, opts.random).total, type: p.type }));
    const rows = targets.map((t): RollRow => {
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
      const lr = outcome === 'failed' && (t.stats?.legendary ?? 0) > 0;
      return { id: t.id, name: t.name, d20: r, kept: k, ...(bonus !== undefined ? { bonus } : {}), ...(dc !== undefined ? { against: dc } : {}), outcome, ...tot, ...(note ? { note } : {}), ...(lr ? { onSave: saved } : {}), ...(outcome !== 'saved' ? giveTemp(t) : {}) };
    });
    return { header: head(`${ABILITY_LABEL[ab]} save${dc === undefined ? ' (DC ?)' : ` DC ${dc}`}${spec.half ? ', half on a save' : ''}`), damageText: rolled.length ? `${dmgText}: ${rolled.map((p) => p.total).join(' + ')}` : '', rows, ...(slot ? { slot } : {}) };
  }
  const rolled = parts.map((p) => ({ total: rollDice(p.dice, false, opts.random).total, type: p.type }));
  return {
    header: head(rolled.length ? 'Damage' : 'Temporary hit points'),
    damageText: rolled.length ? `${dmgText}: ${rolled.map((p) => p.total).join(' + ')}` : temp ? `${temp} temporary hit points` : '',
    rows: targets.map((t) => ({ id: t.id, name: t.name, outcome: 'damage' as const, ...totalOn(rolled, t.stats, false, magical), ...giveTemp(t) })),
    ...(slot ? { slot } : {}),
  };
}
