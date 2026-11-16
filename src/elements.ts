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
