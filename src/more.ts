// What else a spell or ability does on the map, read from its own text (nothing is looked up): pushes and pulls,
// how many bolts or areas it makes (and at which levels more), a bolt that leaps on, a thing it makes that can be
// moved, difficult terrain. Each can be changed, and saved, in the cast window.
import { UNIT, num, toGame, square, type SpellEntry, type Area } from './areas';

export interface More {
  /** Pushes those it catches (or its target) this far (game units) from where it comes from; negative: pulls them towards it. */
  push?: number;
  /** How many it makes: darts, rays, beams (targets to click), or areas to place. */
  count?: number;
  /** More of them at these caster levels, lowest first: [level, how many] (from its text; not kept with a saved spell). */
  steps?: [number, number][];
  /** A bolt that leaps on from its target to this many others… */
  chain?: number;
  /** …each within this far (game units) of the first. */
  chainRange?: number;
  /** It makes a thing that stays and can be moved (Spiritual Weapon): a token of its own on the map. */
  summon?: boolean;
  /**
   * Its area is difficult terrain while it lasts (true: each foot costs 2), or moving through it costs this many feet
   * a foot (Plant Growth: 4).
   */
  terrain?: boolean | number;
  /** Its terrain fills the air (webs, a swarm, fog, a wall), so flying creatures pay for it too; else it's on the ground. */
  terrainAir?: boolean;
}

const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12 };
const N = String.raw`(one|two|three|four|five|six|seven|eight|nine|ten|twelve|\d+)`;
const count = (w: string | undefined): number => { const k = String(w ?? '').toLowerCase(); return WORDS[k] ?? (Number(k) || 0); };
const THINGS = String.raw`(?:darts?|rays?|beams?|bolts?|missiles?|motes?|spheres?|orbs?|lights?|blades?|arrows?|shards?|stars?|meteors?|needles?|daggers?|flames?)`;

/** What a spell's text says it does beside its area. `area`: its area as read (a thing to move has none, or a small one). */
export function moreOf(spell: SpellEntry, area?: Area | null): More {
  const t = String(spell.descFull ?? spell.desc ?? '').replace(/\s+/g, ' ');
  const out: More = {};
  if (!t) return out;
  let m: RegExpExecArray | null;
  // ("can't be pushed": not that)
  const denied = (at: number): boolean => /\b(?:can['’]?t|cannot|isn['’]?t|aren['’]?t|not|never|without being)\s+(?:be\s+)?$/i.test(t.slice(Math.max(0, at - 24), at));
  // pushed 10 feet away / pulled up to 10 feet towards (Draw Steel: "push 3", in squares)
  if ((m = new RegExp(String.raw`\b(push|pull)(?:ed|es|s|ing)?\b(?![^.;]{0,20}\b(?:can't|cannot|isn't|aren't|not)\b)[^.;]{0,60}?(\d+(?:\.\d+)?)\s*-?\s*` + UNIT, 'i').exec(t)) && !denied(m.index)) {
    const d = toGame(num(m[2]), m[3] ?? '');
    if (d > 0) out.push = m[1].toLowerCase() === 'pull' ? -d : d;
  } else if ((m = /\b(push|pull)\s+(\d+)\b/i.exec(t)) && !denied(m.index)) {
    const d = num(m[2]) * square();
    if (d > 0) out.push = m[1].toLowerCase() === 'pull' ? -d : d;
  }
  // "You create three glowing darts", "hurl three fiery rays", "at four different points"
  if ((m = new RegExp(String.raw`\b(?:creat|hurl|fir|launch|mak|shoot|conjur|loos|fling|throw|summon|send)\w*\s+(?:up to\s+)?` + N + String.raw`\s+(?:[\w'’-]+\s+){0,3}?` + THINGS + String.raw`\b(?!\s+at\s+(?:levels?\s+\d|\d+(?:st|nd|rd|th)\s+level))`, 'i').exec(t))
    ?? (m = new RegExp(String.raw`\bat\s+` + N + String.raw`\s+(?:different\s+|separate\s+)?(?:points|locations|spots)\b`, 'i').exec(t))) {
    const n = count(m[1]); if (n > 1 && n <= 12) out.count = n;
  }
  // "two beams at level 5, three beams at level 11" / "two beams at 5th level"
  const steps: [number, number][] = [];
  for (const s of t.matchAll(new RegExp(N + String.raw`\s+[\w'’-]+\s+at\s+(?:levels?\s+(\d+)|(\d+)(?:st|nd|rd|th)\s+level)`, 'gi'))) {
    const n = count(s[1]), lv = Number(s[2] ?? s[3]);
    if (n > 1 && n <= 12 && lv > 0 && lv <= 30) steps.push([lv, n]);
  }
  if (steps.length) out.steps = steps.sort((a, b) => a[0] - b[0]);
  // "leap from that target to as many as three other targets, each … within 30 feet of the first"
  if ((m = new RegExp(String.raw`\b(?:leap|jump|arc|bounce|chain)s?\b[^.]*?\b(?:as many as|up to)\s+` + N + String.raw`\s+other\b[^.]*?\bwithin\s+(\d+(?:\.\d+)?)\s*-?\s*` + UNIT, 'i').exec(t))) {
    const n = count(m[1]), r = toGame(num(m[2]), m[3] ?? '');
    if (n > 0 && r > 0) { out.chain = n; out.chainRange = r; }
  }
  // "you can move the weapon up to 20 feet": a thing of its own (its area none, or no bigger than a square)
  if (/\bmove\s+(?:it|the\s+[\w'’-]+(?:\s+[\w'’-]+)?)\s+up to\s+\d/i.test(t) && (!area || area.target || area.size <= square())) out.summon = true;
  if (/\bdifficult terrain\b/i.test(t) && !/\b(?:ignore|ignores|ignoring|unaffected by|isn['’]t slowed by|(?:doesn['’]t|does not|don['’]t|do not|no longer) counts? as|isn['’]t|is not)\b[^.]{0,30}difficult terrain/i.test(t) && !/\bdifficult terrain\b[^.]{0,60}\binto ordinary terrain\b/i.test(t)) out.terrain = true;
  // moving through it costs more than that: "must spend 4 feet of movement for every 1 foot it moves" (Plant Growth),
  // "each foot … costs 4 feet of movement" (Transmute Rock), "every foot of movement through the fog costs 2 extra
  // feet", Pathfinder's greater difficult terrain (each square three)
  const W: Record<string, number> = { one: 1, a: 1, an: 1, two: 2, three: 3, four: 4, five: 5 };
  const nw = (x: string) => W[x.toLowerCase()] ?? Number(x);
  let cost = 0;
  if ((m = /\bspend\s+(\d+|two|three|four|five)\s+feet of movement for (?:every|each)\s+(?:1|one)\s+foot\b/i.exec(t))) cost = nw(m[1]);
  else if ((m = /\b(?:each|every)\s+foot\b[^.]{0,60}?\bcosts?\s+(\d+|two|three|four|five)\s+feet of movement\b/i.exec(t))) cost = nw(m[1]);
  else if ((m = /\b(?:each|every)\s+foot of movement\s+(?:through|in|within)\b[^.]{0,40}?\bcosts?\s+(\d+|an?|one|two|three|four)\s+(?:extra|additional|more)\s+f(?:ee|oo)t\b/i.exec(t))) cost = nw(m[1]) + 1;
  else if (/\bgreater difficult terrain\b/i.test(t)) cost = 3;
  if (cost >= 2) out.terrain = cost === 2 ? true : cost;
  // what's difficult: the ground (rubble, plants, mud, grease, ice: a flying creature passes over it) or the air
  // through it (webs, a swarm, fog, wind, a wall)
  if (out.terrain && /\b(?:webs?|webbing|fog|mist|cloud|swarms?|insects|locusts|wind|gust|whirling|gravity|spirits|blackness|darkness|wall)\b/i.test(t) && !/\b(?:the ground|ground in|ground within|floor)\b[^.]{0,60}\bdifficult terrain\b|\bdifficult terrain\b[^.]{0,40}\b(?:on the ground|ground)\b/i.test(t)) out.terrainAir = true;
  return out;
}

/** How many it makes when cast by a caster of this level (null: unknown, its least). */
export function countAt(more: More | undefined, level: number | null | undefined): number {
  let n = Math.max(1, more?.count ?? 1);
  if (level && more?.steps) for (const [lv, c] of more.steps) if (level >= lv) n = Math.max(n, c);
  return n;
}

/** Whether there's anything in it. */
/** What moving a foot through a terrain costs, in feet (0: it isn't terrain). */
export const terrainCost = (t: boolean | number | undefined): number => t === true ? 2 : typeof t === 'number' && t > 1 ? t : 0;

export const hasMore = (m: More | undefined): boolean => !!m && (!!m.push || (m.count ?? 0) > 1 || !!m.steps?.length || !!m.chain || !!m.summon || !!m.terrain);
