// The effect animations in the vault: JB2A's packs and your own files, found by name.
// JB2A names its files like "Library/3rd_Level/Fireball/FireballExplosion_01_Orange_800x800.webm": words run
// together (CamelCase) and apart (_), colours are words, ray lengths are "15ft". The add-on only reads the names.
import type { Shape } from './areas';
import { elementsOf, type Element } from './elements';

export const EFFECT_EXT = ['webm', 'mp4', 'webp', 'gif', 'png', 'apng'];

const COLOURS = ['orange', 'blue', 'green', 'purple', 'red', 'yellow', 'white', 'black', 'pink', 'grey', 'gray', 'teal', 'rainbow',
  'cyan', 'magenta', 'violet', 'gold', 'silver', 'brown', 'aqua', 'lime', 'maroon', 'dark', 'light', 'bright', 'pale'];
const STOP = new Set(['of', 'the', 'a', 'an', 's', 'and', 'jb2a', 'dnd5e', 'library', 'level', 'cantrip', 'free', 'patreon', 'webm', 'mp4', 'regular', 'loop', 'complete', 'jb', '01', '02', '03', '04', '05', 'st', 'nd', 'rd', 'th']);

export interface EffectFile {
  path: string;
  /** The file's own name without its extension. */
  name: string;
  ext: string;
  /** Words of the file name (lower case), JB2A's run-together ones split. */
  words: string[];
  /** Words of its folders. */
  folderWords: string[];
  /** Its colour, e.g. "orange", "dark blue"; "" when it names none. */
  colour: string;
  /** The same effect in other colours shares this key. */
  family: string;
  /** A length the file is made for ("15ft"), in feet; 0 when none. */
  feet: number;
  video: boolean;
  /** A JB2A animation not in the vault yet: its path in the pack (fetched when first used). */
  remote?: string;
  /** Its still preview (an address), for one not downloaded yet. */
  thumb?: string;
}

/** Words of a name: "FireballExplosion_01_Orange_800x800" -> fireball, explosion, orange (sizes and numbers dropped). */
export function wordsOf(name: string): string[] {
  return name
    .replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/'/g, '')
    .split(/[^A-Za-z0-9]+/)
    .map((w) => w.toLowerCase())
    .filter((w) => w && !/^\d+x\d+$/.test(w) && !/^\d+$/.test(w) && !/^\d+ft$/.test(w));
}

export function indexFile(path: string): EffectFile | null {
  const slash = path.lastIndexOf('/');
  const file = path.slice(slash + 1);
  const dot = file.lastIndexOf('.');
  if (dot <= 0) return null;
  const ext = file.slice(dot + 1).toLowerCase();
  if (!EFFECT_EXT.includes(ext)) return null;
  const name = file.slice(0, dot);
  if (/[_\-\s]thumb\s*$/i.test(name)) return null;                     // JB2A's still previews of each animation
  const words = wordsOf(name);
  const folderWords = path.slice(0, Math.max(0, slash)).split('/').flatMap(wordsOf);
  const colourWords: string[] = [];
  const rest: string[] = [];
  for (const w of words) (COLOURS.includes(w) ? colourWords : rest).push(w);
  const ft = /(\d+)\s*ft/i.exec(name);
  const familyName = name.replace(/(^|[_\-\s])(\d+x\d+)(?=[_\-\s.]|$)/gi, '$1');
  const family = (path.slice(0, slash + 1) + wordsOf(familyName).filter((w) => !COLOURS.includes(w)).join('_')).toLowerCase();
  return { path, name, ext, words: rest, folderWords, colour: colourWords.join(' '), family, feet: ft ? Number(ft[1]) : 0, video: ext === 'webm' || ext === 'mp4' };
}

export function indexFiles(paths: readonly string[]): EffectFile[] {
  return paths.map(indexFile).filter((f): f is EffectFile => f !== null);
}

const keyWords = (name: string) => wordsOf(name).filter((w) => !STOP.has(w));

/** What the effect is generally like, by shape: for spells without art of their own. */
const SHAPE_WORDS: Record<Shape, string[]> = {
  radius: ['explosion', 'burst', 'sphere', 'impact', 'blast', 'circle'],
  emanation: ['aura', 'emanation', 'circle', 'ring', 'shield', 'guardians'],
  cone: ['cone', 'breath', 'spray', 'hands'],
  cube: ['cube', 'square', 'wave', 'box'],
  line: ['ray', 'line', 'beam', 'bolt', 'lightning', 'stream'],
  wall: ['wall', 'barrier', 'fence', 'hedge', 'curtain'],
};

export interface Match { file: EffectFile; score: number; why: 'name' | 'shape' }

/**
 * The animations for a spell, best first: those named after it (every word of the spell's name in the file's
 * name or folders), then ones of its shape. One per family (colour); the colours are picked separately.
 */
export function matchesFor(spellName: string, shape: Shape | null, files: readonly EffectFile[], limit = 40): Match[] {
  const want = keyWords(spellName);
  const out: Match[] = [];
  const seen = new Set<string>();
  const scored = files.map((f) => {
    const all = new Set([...f.words, ...f.folderWords]);
    const own = new Set(f.words);
    let score = -1, why: Match['why'] = 'name';
    if (want.length && want.every((w) => all.has(w))) {
      score = 100 + want.filter((w) => own.has(w)).length * 10 - Math.max(0, f.words.length - want.length);
      if (f.video) score += 3;
      // of the spell's own animations, the one of its shape first (Fireball's explosion before its beam)
      if (shape) score += f.words.filter((w) => SHAPE_WORDS[shape].includes(w)).length * 8;
    } else if (shape) {
      const sw = SHAPE_WORDS[shape];
      const hit = f.words.filter((w) => sw.includes(w)).length;
      if (hit) { score = 10 + hit * 5 - f.words.length; why = 'shape'; if (f.video) score += 3; }
    }
    return { f, score, why };
  }).filter((x) => x.score >= 0).sort((a, b) => b.score - a.score || a.f.path.localeCompare(b.f.path));
  for (const x of scored) {
    if (seen.has(x.f.family)) continue;
    seen.add(x.f.family);
    out.push({ file: x.f, score: x.score, why: x.why });
    if (out.length >= limit) break;
  }
  return out;
}

/** Words an animation of each element may be named with. */
const ELEMENTS: Record<Element, string[]> = {
  fire: ['fire', 'flame', 'burn'], cold: ['cold', 'ice', 'frost', 'snow'], lightning: ['lightning', 'electric'], acid: ['acid'],
  poison: ['poison', 'toxic'], radiant: ['radiant', 'holy', 'divine'], necrotic: ['necrotic', 'unholy'], thunder: ['thunder', 'sonic'], psychic: ['psychic'], force: ['force'],
};
/** What a spell or ability is made of, as words to find its animation by (see elements.ts), the surest first. */
export function hintsOf(text: string | undefined, name?: string): string[] {
  const out: string[] = [];
  for (const e of elementsOf(name, text)) for (const w of ELEMENTS[e]) if (!out.includes(w)) out.push(w);
  return out;
}

/**
 * The animation a spell or ability starts with: one named after it; else one of its shape that fits what it is
 * (its own name's words, or `hints`: a Fire Breath's cone, not Cone of Cold's). A cone or a line with nothing to go
 * by gets none (any one of them would be some other spell's): it's drawn as its area, and one can be picked.
 */
export function defaultFor(name: string, shape: Shape | null, files: readonly EffectFile[], hints: readonly string[] = []): EffectFile | null {
  const all = matchesFor(name, shape, files, 400);
  if (all[0]?.why === 'name') return all[0].file;
  if (!shape) return null;
  const mine = keyWords(name).filter((w) => w.length >= 3 && !SHAPE_WORDS[shape].includes(w));
  const other = shape === 'cone' ? ['line'] : shape === 'line' ? ['cone'] : [];
  let best: EffectFile | null = null, top = 0;
  for (const m of all) {
    const words = [...m.file.words, ...m.file.folderWords];
    if (other.some((o) => m.file.words.includes(o))) continue;
    const has = (h: string) => words.some((w) => w.startsWith(h));
    // (its own name's words count most; then the first kind of damage it does)
    const score = mine.filter(has).length * 100 + (hints.length ? Math.max(0, ...hints.map((h, i) => (has(h) ? 50 - i : 0))) : 0);
    if (score > top) { top = score; best = m.file; }
  }
  if (best) return best;
  return shape === 'cone' || shape === 'line' ? null : all[0]?.file ?? null;
}

/** The colours an effect comes in (its family), each with its file; for a line or cone, the one made closest to `feet`. */
export function coloursOf(file: EffectFile, files: readonly EffectFile[], feet = 0): Array<{ colour: string; file: EffectFile }> {
  const byColour = new Map<string, EffectFile>();
  for (const f of files) {
    if (f.family !== file.family) continue;
    const c = f.colour || 'as made';
    const have = byColour.get(c);
    if (!have || (feet && f.feet && Math.abs(f.feet - feet) < Math.abs((have.feet || 1e9) - feet))) byColour.set(c, f);
  }
  return [...byColour].map(([colour, f]) => ({ colour, file: f })).sort((a, b) => a.colour.localeCompare(b.colour));
}

/**
 * The same animation (its family and colour) in the length closest to `feet`: JB2A makes each ray and bolt for
 * 5, 15, 30, 60 and 90 ft; the one nearest the distance is stretched least. Itself when there are none.
 */
export function nearestLength(path: string, files: readonly EffectFile[], feet: number): string {
  const me = files.find((f) => f.path === path);
  if (!me || !me.feet || !(feet > 0)) return path;
  let best = me;
  for (const f of files) {
    if (f.family !== me.family || f.colour !== me.colour || !f.feet || f.ext !== me.ext) continue;
    if (Math.abs(Math.log(f.feet / feet)) < Math.abs(Math.log(best.feet / feet))) best = f;
  }
  return best.path;
}

/** Every animation whose name or folders hold all the words searched for. */
export function search(text: string, files: readonly EffectFile[], limit = 60): EffectFile[] {
  const want = wordsOf(text);
  if (!want.length) return [];
  const seen = new Set<string>();
  const out: EffectFile[] = [];
  for (const f of files) {
    const all = [...f.words, ...f.folderWords, ...f.colour.split(' ')];
    if (!want.every((w) => all.some((a) => a.startsWith(w)))) continue;
    if (seen.has(f.family)) continue;
    seen.add(f.family); out.push(f);
    if (out.length >= limit) break;
  }
  return out;
}
