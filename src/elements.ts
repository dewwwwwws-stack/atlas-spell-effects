// What a spell or an ability is made of (fire, cold, lightning…), read from its own text, as each game system
// Atlas knows writes it: its animation and its area's look are picked by it. Nothing is looked up.
//   D&D 5e:        "Fire damage", Cold, Lightning, Acid, Poison, Radiant, Necrotic, Thunder, Psychic, Force
//   Pathfinder 2e: "fire damage", cold, electricity, acid, poison, sonic, vitality (positive), void (negative),
//                  spirit, mental, force
//   Draw Steel:    "fire damage", cold, lightning, acid, poison, holy, corruption, sonic, psychic
//   Old-School Essentials, Shadowdark, Cairn, Call of Cthulhu, Cyberpunk RED, Daggerheart: damage has no kind
//   ("magic damage", "3d6 damage"), so the words round it say: "a cone of fire", "breathes lightning", "a cloud of
//   chlorine gas", "incendiary".

export type Element = 'fire' | 'cold' | 'lightning' | 'acid' | 'poison' | 'radiant' | 'necrotic' | 'thunder' | 'psychic' | 'force';

/** A kind of damage as a system names it ("electricity damage"): which element it is. */
const KINDS: Record<string, Element> = {
  fire: 'fire', cold: 'cold', lightning: 'lightning', electricity: 'lightning', electric: 'lightning', electrical: 'lightning',
  acid: 'acid', poison: 'poison', radiant: 'radiant', holy: 'radiant', vitality: 'radiant', positive: 'radiant', spirit: 'radiant',
  necrotic: 'necrotic', void: 'necrotic', negative: 'necrotic', corruption: 'necrotic', unholy: 'necrotic',
  thunder: 'thunder', sonic: 'thunder', psychic: 'psychic', mental: 'psychic', force: 'force',
};
/** Words that say it outright, where damage has no kind (in the text round it, or the name). */
const WORDS: Array<[RegExp, Element]> = [
  [/\b(?:fire|fiery|flames?|flaming|burning|incendiary|napalm|magma|lava)\b/i, 'fire'],
  [/\b(?:cold|frost|frosty|ice|icy|freezing|frozen)\b/i, 'cold'],
  [/\b(?:lightning|electricity|electric|electrical|emp)\b/i, 'lightning'],
  [/\b(?:acid|acidic|corrosive)\b/i, 'acid'],
  [/\b(?:poison|poisonous|venom|venomous|toxic|toxin|chlorine)\b/i, 'poison'],
  [/\b(?:radiant|holy|sunlight)\b/i, 'radiant'],
  [/\b(?:necrotic|unholy|corruption)\b/i, 'necrotic'],
  [/\b(?:thunder|thunderous|sonic)\b/i, 'thunder'],
  [/\b(?:psychic)\b/i, 'psychic'],
];

/**
 * The elements of a spell or ability, the surest first: the kinds of damage its text names, in the order named;
 * where it deals damage of no kind, the words of its name, then of its text (not what it's resisted by or
 * immune to). A text that deals no damage has none (Faerie Fire is no fire).
 */
export function elementsOf(name: string | undefined, text: string | undefined): Element[] {
  const t = String(text ?? '');
  const out: Element[] = [];
  const add = (e: Element | undefined) => { if (e && !out.includes(e)) out.push(e); };
  for (const m of t.matchAll(/([\p{L}]+)\s+damage/giu)) add(KINDS[m[1].toLowerCase()]);
  if (out.length || !/damage|\b\d*d\d+\b/i.test(t)) return out;
  for (const [re, e] of WORDS) if (re.test(String(name ?? ''))) add(e);
  const found: Array<{ at: number; e: Element }> = [];
  for (const [re, e] of WORDS) {
    for (const m of t.matchAll(new RegExp(re.source, 'gi'))) {
      const before = t.slice(Math.max(0, m.index - 40), m.index).toLowerCase();
      if (/resist|immun|vulnerab|weak|unaffected|protect|save(?:s)? (?:vs|versus|against)/.test(before)) continue;
      found.push({ at: m.index, e }); break;
    }
  }
  for (const f of found.sort((a, b) => a.at - b.at)) add(f.e);
  return out;
}

/** A drawn effect's colours and motion (a spell with no animation): by what it's made of, else its school. */
const PALETTE: Record<Element, { colour: string; colour2: string; motion: string }> = {
  fire: { colour: '#ff6a1a', colour2: '#ffd04a', motion: 'flicker' }, cold: { colour: '#8ad1f8', colour2: '#eaf8ff', motion: 'shimmer' },
  lightning: { colour: '#3a8bff', colour2: '#e0f0ff', motion: 'flicker' }, acid: { colour: '#7fd32a', colour2: '#e0ff8a', motion: 'breathe' },
  poison: { colour: '#4caf50', colour2: '#b5e07a', motion: 'breathe' }, radiant: { colour: '#ffd54a', colour2: '#fff6c8', motion: 'shimmer' },
  necrotic: { colour: '#6b3fa0', colour2: '#1e1230', motion: 'breathe' }, thunder: { colour: '#6c7bff', colour2: '#d0d5ff', motion: 'pulse' },
  psychic: { colour: '#e055c8', colour2: '#ffc4f2', motion: 'pulse' }, force: { colour: '#9a7bff', colour2: '#e6deff', motion: 'pulse' },
};
const SCHOOLS: Record<string, { colour: string; colour2: string; motion: string }> = {
  abjuration: { colour: '#4fa3ff', colour2: '#d6ebff', motion: 'shimmer' }, conjuration: { colour: '#ffb347', colour2: '#fff0d0', motion: 'breathe' },
  divination: { colour: '#9fd8ff', colour2: '#ffffff', motion: 'shimmer' }, enchantment: { colour: '#ff7fd0', colour2: '#ffe0f4', motion: 'pulse' },
  evocation: { colour: '#ff8a2a', colour2: '#ffe0b0', motion: '' }, illusion: { colour: '#b388ff', colour2: '#efe4ff', motion: 'shimmer' },
  necromancy: { colour: '#6b3fa0', colour2: '#1e1230', motion: 'breathe' }, transmutation: { colour: '#c9a227', colour2: '#fff2c0', motion: 'breathe' },
};
const ABILITY_PALETTES: readonly [RegExp, { colour: string; colour2: string; motion: string }][] = [
  [/\bsleep|\bslow|\bweaken|\brepuls|\bparaly/, { colour: '#c9b8ff', colour2: '#f4efff', motion: 'breathe' }],
  [/\bpetrif|\bstone|\bgaze\b/, { colour: '#9e9e8e', colour2: '#e2e2d6', motion: 'shimmer' }],
  [/\billuminat|\blight\b|\bglow/, { colour: '#ffcf6b', colour2: '#fff4cc', motion: 'flicker' }],
  [/\bdark/, { colour: '#3a2a5c', colour2: '#120b20', motion: 'breathe' }],
  [/\bstench|\bfetid|\btoxic|\bink\b|\bspore|\bnoxious/, { colour: '#6f8f2e', colour2: '#c4d68a', motion: 'breathe' }],
  [/\bfear|\bfright|\bmoan|\bblasphem|\bturn defiance|\bwail|\bvisage|\bvile|\bhorr|\bterrif/, { colour: '#5b2a6e', colour2: '#c08ad6', motion: 'pulse' }],
  [/\bgibber|\btelepath|\bsong\b|\bcharm|\bauthority|\blur/, { colour: '#e055c8', colour2: '#ffc4f2', motion: 'pulse' }],
  [/\bdust|\bblind|\bshaking|\bsand\b|\bwhirlwind|\bground\b|\bstomp|\bquake/, { colour: '#c2a26b', colour2: '#efe2c4', motion: 'shimmer' }],
  [/\bmetal|\brust\b/, { colour: '#b5652b', colour2: '#e8b48a', motion: '' }],
  [/\bantimagic|\bnullif|\bdispel|\bsuppress/, { colour: '#8fa3b8', colour2: '#e4ecf4', motion: 'shimmer' }],
  [/\btime\b|\btemporal|\bchrono|\bstasis/, { colour: '#3fc1c9', colour2: '#f3e3a1', motion: 'pulse' }],
  [/\bwing\b|\bgust\b|\bwind\b|\bbuffet/, { colour: '#cfe3ee', colour2: '#ffffff', motion: 'shimmer' }],
  [/\bentangl|\bvines?\b|\bplants?\b|\broots?\b|\bthorns?\b/, { colour: '#4f8a2b', colour2: '#bfe08a', motion: 'breathe' }],
  [/\bblood\b/, { colour: '#a3151b', colour2: '#ff6b6b', motion: 'pulse' }],
  [/\bbravery|\bprotect|\binvulnerab|\bbolster|\brally|\binspir|\bmarshal|\bbattle cry\b/, { colour: '#ffd54a', colour2: '#fff6c8', motion: 'breathe' }],
];

export function paletteOf(name: string, text: string | undefined, school?: string): { colour: string; colour2: string; motion: string } | null {
  if (/\bregains?\b[^.]*\bhit points\b/i.test(String(text ?? ''))) return { colour: '#5fd35f', colour2: '#e2ffd8', motion: 'breathe' };   // healing
  const e = elementsOf(name, text)[0];
  if (e) return PALETTE[e];
  // what a creature's ability does, where it deals no damage (a sleeping breath, a petrifying gaze, a stench…)
  // (a spell by its name alone: its text says "dim light" or "darkness" in passing; a creature's ability by both)
  const n = (school ? name : `${name} ${String(text ?? '').slice(0, 400)}`).toLowerCase();
  // (its name first: a Darkness Aura's text speaks of light it puts out)
  for (const [re, pal] of ABILITY_PALETTES) if (re.test(name.toLowerCase())) return pal;
  for (const [re, pal] of ABILITY_PALETTES) if (re.test(n)) return pal;
  const sc = SCHOOLS[String(school ?? '').trim().toLowerCase()];
  if (sc) return sc;
  // a creature's ability of plain force (a wing buffet, a thrown boulder, a burst of something chosen): pale, like
  // dust and air
  if (school === undefined && /\b(?:bludgeoning|piercing|slashing|damage)\b/i.test(String(text ?? ''))) return { colour: '#d8d2c4', colour2: '#f6f3ec', motion: 'shimmer' };
  return null;
}
