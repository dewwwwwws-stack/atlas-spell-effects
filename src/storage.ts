// A spell's effect defaults, kept in the properties of the spell's own note: the notes your chosen Bases show
// (your compendium's spell pages, as Atlas's loot bases use item notes), or a note the add-on makes for an effect
// of your own. Every property is named "effect-…", so none of them clashes with what your spell pages already
// hold. Notes stored by older versions (plain "area", "size"… and a "spell-effect" tag) are still read.
import { square, fromFeet, currentRules, type Area, type Shape, type WallBlocks } from './areas';
import type { EffectLight } from './lights';

export const STORAGE_TAG = 'spell-effect';
export const SHAPES: readonly Shape[] = ['radius', 'emanation', 'cone', 'cube', 'line', 'wall'];
const BLOCKS: readonly WallBlocks[] = ['none', 'sight', 'movement', 'solid'];
/** The add-on's properties, without their "effect-" prefix. */
const KEYS = ['area', 'size', 'width', 'angle', 'origin', 'lasting', 'attach', 'animation', 'colour', 'colour-outer', 'opacity', 'target', 'ring', 'round', 'walls', 'light', 'bright', 'dim', 'light-colour', 'menu', 'range', 'conditions', 'unit'] as const;
type Key = (typeof KEYS)[number];
export const prop = (k: Key): string => 'effect-' + k;

/** A stored spell: its note and its defaults. */
export interface StoredSpell {
  path: string;
  name: string;
  area: Area;
  /** The animation (a vault path), or none: drawn in `colour`. */
  file?: string;
  colour?: string;
  /** Drawn: the colour at its edge, and how see-through. */
  colour2?: string;
  alpha?: number;
  /** Card art (a vault path): the note's "effect-image", or its own "image". */
  image?: string;
  /** Follows its caster's token (cones, lines, auras: a beholder's eye). */
  attach?: boolean;
  /** The light it gives off or the darkness it spreads; null: none (said so); missing: not said. */
  light?: EffectLight | null;
  /** In ✨'s menu, to cast in one click. */
  menu?: boolean;
  /** How far from its caster it can be cast (game units). */
  range?: number;
  /** The conditions it gives the creatures inside it (names); missing: not said (read from its text). */
  conditions?: string[];
}

/** The game's units now, as a saved spell's sizes are written in ("5 feet": a square's size and its unit). */
export const unitNow = (): string => { const r = currentRules(); return `${r.perSquare} ${r.unit}`; };
/**
 * What a size saved in `saved` units ("5 feet") is worth in the game's units now (another game system: "1.5
 * meters" to a square): the same number of squares. 1 when they're the same, or the note doesn't say.
 */
export function unitFactor(saved: unknown): number {
  const m = /^\s*([\d.]+)\s+(\w+)\s*$/.exec(typeof saved === 'string' ? saved : '');
  const per = m ? Number(m[1]) : NaN;
  const r = currentRules();
  if (!m || !(per > 0) || (per === r.perSquare && m[2] === r.unit)) return 1;
  return r.perSquare / per;
}
const scaled = (v: number, k: number): number => (k === 1 ? v : Math.round(v * k * 100) / 100);
/** A list property: a YAML list, or names separated by commas. */
const listOf = (v: unknown): string[] | undefined => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : typeof v === 'string' ? v.split(',').map((x) => x.trim()).filter(Boolean) : undefined);

const yes = (v: unknown) => v === true || v === 'true' || v === 'yes' || v === 1;
const numOf = (v: unknown, d: number) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };
/** A property that links a file: "[[Darkness_01_Black.webm]]", "![[card.png]]", or a plain path. */
export const linkOf = (v: unknown): string => {
  const s = Array.isArray(v) ? String(v[0] ?? '') : typeof v === 'string' ? v : '';
  const m = /!?\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/.exec(s);
  return (m ? m[1] : s).trim();
};

type FM = Record<string, unknown> | null | undefined;
const hasTag = (fm: FM) => { const t = fm?.['tags']; return (Array.isArray(t) ? t : typeof t === 'string' ? [t] : []).some((x) => String(x).replace(/^#/, '').toLowerCase() === STORAGE_TAG); };
/** A note stored by an older version: plain property names. */
const isLegacy = (fm: FM): boolean => !!fm && fm[prop('area')] === undefined && ((fm['area'] !== undefined && SHAPES.includes(String(fm['area']).toLowerCase() as Shape)) || hasTag(fm));
/** One of the add-on's properties ("effect-size", or "size" in an older note). */
function get(fm: Record<string, unknown>, k: Key): unknown {
  const v = fm[prop(k)];
  if (v !== undefined) return v;
  if (!isLegacy(fm)) return undefined;
  return k === 'walls' ? fm['blocks'] : k === 'colour' ? fm['colour'] ?? fm['color'] : k === 'light-colour' ? fm['light-colour'] ?? fm['light-color'] : fm[k];
}

/** Whether a note holds effect defaults. */
export function isStored(fm: FM): boolean {
  if (!fm) return false;
  if (SHAPES.includes(String(fm[prop('area')] ?? '').toLowerCase() as Shape)) return true;
  return isLegacy(fm);
}

/**
 * A stored spell from its note. `resolve` turns a property's link into a vault path (Obsidian finds the file
 * the way a link in the note would).
 */
export function storedFrom(path: string, fm: Record<string, unknown>, resolve: (link: string) => string | null): StoredSpell {
  const name = (typeof fm['name'] === 'string' && fm['name'].trim()) || path.split('/').pop()!.replace(/\.md$/i, '');
  // saved in another game system's units: the same squares in this one's
  const k = unitFactor(get(fm, 'unit'));
  const a = String(get(fm, 'area') ?? '').toLowerCase();
  const shape = (SHAPES.includes(a as Shape) ? a : 'radius') as Shape;
  const origin = String(get(fm, 'origin') ?? '').toLowerCase();
  const blocks = String(get(fm, 'walls') ?? '').toLowerCase() as WallBlocks;
  const tg = String(get(fm, 'target') ?? '').toLowerCase();
  const target = (tg === 'on' || tg === 'self') && shape === 'emanation' ? 'on' as const : tg === 'bolt' && shape === 'line' ? 'bolt' as const : undefined;
  const area: Area = {
    shape,
    size: target === 'on' && Number(get(fm, 'size')) >= 0 ? scaled(Number(get(fm, 'size')) || 0, k) : scaled(numOf(get(fm, 'size'), fromFeet(shape === 'line' || shape === 'wall' ? 30 : 15) / k), k),
    ...(target ? { target } : {}),
    ...(tg === 'self' && target === 'on' ? { self: true } : {}),
    ...(shape === 'line' ? { width: scaled(numOf(get(fm, 'width'), square() / k), k) } : shape === 'wall' ? { width: scaled(numOf(get(fm, 'width'), fromFeet(1) / k), k) } : {}),
    ...(shape === 'cone' && Number(get(fm, 'angle')) > 0 ? { angle: Number(get(fm, 'angle')) } : {}),
    ...(shape === 'wall' && Number(get(fm, 'ring')) > 0 ? { ring: scaled(Number(get(fm, 'ring')), k) } : {}),
    ...(shape === 'wall' && yes(get(fm, 'round')) ? { round: true } : {}),
    ...(shape === 'wall' && BLOCKS.includes(blocks) ? { blocks } : {}),
    from: shape === 'cone' || shape === 'line' || shape === 'emanation' ? 'caster' : shape === 'wall' ? 'point' : origin === 'caster' || origin === 'self' ? 'caster' : 'point',
    lasting: yes(get(fm, 'lasting')),
  };
  const anim = linkOf(get(fm, 'animation'));
  const img = linkOf(fm['effect-image'] ?? fm['image']);
  const file = anim ? resolve(anim) ?? undefined : undefined;
  const image = img ? resolve(img) ?? undefined : undefined;
  const lm = String(get(fm, 'light') ?? '').toLowerCase().trim();
  const feet = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? scaled(n, k) : 0; };
  const lcv = get(fm, 'light-colour'); const lc = typeof lcv === 'string' ? lcv : '';
  const light: EffectLight | null | undefined =
    lm === 'darkness' ? { mode: 'darkness', bright: 0, dim: area.size } :
    lm === 'light' || lm === 'bright' || lm === 'dim' ? { mode: 'light', bright: feet(get(fm, 'bright')), dim: Math.max(feet(get(fm, 'dim')), feet(get(fm, 'bright'))) || area.size, ...(lc ? { colour: lc } : {}) } :
    lm === 'none' || lm === 'no' || lm === 'false' ? null : undefined;
  const col = get(fm, 'colour'), col2 = fm[prop('colour-outer')], op = Number(fm[prop('opacity')]);
  return { path, name, area, ...(file ? { file } : {}), ...(typeof col === 'string' ? { colour: col } : {}), ...(typeof col2 === 'string' ? { colour2: col2 } : {}), ...(op > 0 && op < 1 ? { alpha: op } : op > 1 && op < 100 ? { alpha: op / 100 } : {}), ...(image ? { image } : {}), ...(yes(get(fm, 'attach')) ? { attach: true } : {}), ...(light !== undefined ? { light } : {}), ...(yes(fm[prop('menu')]) ? { menu: true } : {}), ...(Number(get(fm, 'range')) > 0 ? { range: scaled(Number(get(fm, 'range')), k) } : {}), ...(listOf(get(fm, 'conditions')) ? { conditions: listOf(get(fm, 'conditions'))! } : {}) };
}

/** Writes a spell's defaults into a note's properties (keeps everything else in them; an older note's plain ones are moved over). */
export function writeDefaults(fm: Record<string, unknown>, s: { area: Area; file?: string | undefined; colour?: string | undefined; colour2?: string | undefined; alpha?: number | undefined; attach?: boolean | undefined; light?: EffectLight | null | undefined; menu?: boolean | undefined; range?: number | undefined; conditions?: string[] | undefined }): void {
  if (isLegacy(fm)) {
    for (const k of [...KEYS, 'blocks', 'color', 'light-color']) delete fm[k];
    if (Array.isArray(fm['tags'])) { fm['tags'] = (fm['tags'] as unknown[]).filter((t) => String(t).replace(/^#/, '').toLowerCase() !== STORAGE_TAG); if (!(fm['tags'] as unknown[]).length) delete fm['tags']; }
    else if (hasTag(fm)) delete fm['tags'];
  }
  const set = (k: Key, v: unknown) => { if (v === undefined) delete fm[prop(k)]; else fm[prop(k)] = v; };
  const a = s.area;
  set('area', a.shape);
  set('size', a.size);
  set('width', a.shape === 'line' ? a.width ?? square() : a.shape === 'wall' ? a.width ?? fromFeet(1) : undefined);
  set('angle', a.shape === 'cone' && a.angle ? a.angle : undefined);
  set('origin', a.shape === 'radius' || a.shape === 'cube' ? (a.from === 'caster' ? 'caster' : 'point') : undefined);
  set('ring', a.shape === 'wall' && a.ring ? a.ring : undefined);
  set('round', a.shape === 'wall' && a.round ? true : undefined);
  set('walls', a.shape === 'wall' ? a.blocks ?? 'none' : undefined);
  set('target', a.target === 'on' && a.self ? 'self' : a.target);
  set('lasting', a.lasting);
  set('animation', s.file ? `[[${s.file}]]` : undefined);
  set('colour', s.colour);
  set('colour-outer', s.colour2);
  set('opacity', s.alpha !== undefined && s.alpha < 1 ? s.alpha : undefined);
  set('attach', s.attach ? true : undefined);
  set('light', !s.light ? 'none' : s.light.mode === 'darkness' ? 'darkness' : 'light');
  set('bright', s.light?.mode === 'light' ? s.light.bright : undefined);
  set('dim', s.light?.mode === 'light' ? s.light.dim : undefined);
  set('light-colour', s.light?.mode === 'light' && s.light.colour ? s.light.colour : undefined);
  set('menu', s.menu ? true : undefined);
  set('range', s.range && s.range > 0 ? s.range : undefined);
  set('conditions', s.conditions ? [...s.conditions] : undefined);
  // the units its sizes are in (read again in another game system's units)
  set('unit', unitNow());
}

/** Takes a spell's saved settings off its note (everything else in it stays): it is cast from its text again. */
export function clearDefaults(fm: Record<string, unknown>): void {
  // an older note's plain properties go too (writing moves them over; then they are taken off)
  if (isLegacy(fm)) writeDefaults(fm, { area: { shape: 'radius', size: 1, from: 'point', lasting: false } });
  for (const k of KEYS) delete fm[prop(k)];
}

/** A file name for a spell's note. */
export const noteName = (name: string): string => name.replace(/[\\/:*?"<>|#^[\]]/g, '').trim() || 'Spell';

/** A Base that shows the folder's spells and their defaults as a table. */
export function baseFile(folder: string): string {
  return `filters:
  and:
    - file.inFolder("${folder.replace(/"/g, '\\"')}")
    - file.ext == "md"
views:
  - type: table
    name: Spells
    order:
      - file.name
${KEYS.map((k) => `      - ${prop(k)}`).join('\n')}
`;
}
