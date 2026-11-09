// A spell's effect defaults, kept in the properties of the spell's own note: the notes your chosen Bases show
// (your compendium's spell pages, as Atlas's loot bases use item notes), or a note the add-on makes for an effect
// of your own. Every property is named "effect-…", so none of them clashes with what your spell pages already
// hold. Notes stored by older versions (plain "area", "size"… and a "spell-effect" tag) are still read.
import type { Area, Shape, WallBlocks } from './areas';
import type { EffectLight } from './lights';

export const STORAGE_TAG = 'spell-effect';
export const SHAPES: readonly Shape[] = ['radius', 'emanation', 'cone', 'cube', 'line', 'wall'];
const BLOCKS: readonly WallBlocks[] = ['none', 'sight', 'movement', 'solid'];
/** The add-on's properties, without their "effect-" prefix. */
const KEYS = ['area', 'size', 'width', 'angle', 'origin', 'lasting', 'attach', 'animation', 'colour', 'colour-outer', 'opacity', 'target', 'ring', 'round', 'walls', 'light', 'bright', 'dim', 'light-colour'] as const;
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
}

const yes = (v: unknown) => v === true || v === 'true' || v === 'yes' || v === 1;
const numOf = (v: unknown, d: number) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };
/** A property that links a file: "[[Darkness_01_Black.webm]]", "![[card.png]]", or a plain path. */
export const linkOf = (v: unknown): string => {
  const s = Array.isArray(v) ? String(v[0] ?? '') : typeof v === 'string' ? v : '';
  const m = /!?\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/.exec(s);
  return (m ? m[1]! : s).trim();
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
  const a = String(get(fm, 'area') ?? '').toLowerCase();
  const shape = (SHAPES.includes(a as Shape) ? a : 'radius') as Shape;
  const origin = String(get(fm, 'origin') ?? '').toLowerCase();
  const blocks = String(get(fm, 'walls') ?? '').toLowerCase() as WallBlocks;
  const tg = String(get(fm, 'target') ?? '').toLowerCase();
  const target = tg === 'on' && shape === 'emanation' ? 'on' as const : tg === 'bolt' && shape === 'line' ? 'bolt' as const : undefined;
  const area: Area = {
    shape,
    size: target === 'on' && Number(get(fm, 'size')) >= 0 ? Number(get(fm, 'size')) || 0 : numOf(get(fm, 'size'), shape === 'line' || shape === 'wall' ? 30 : 15),
    ...(target ? { target } : {}),
    ...(shape === 'line' ? { width: numOf(get(fm, 'width'), 5) } : shape === 'wall' ? { width: numOf(get(fm, 'width'), 1) } : {}),
    ...(shape === 'cone' && Number(get(fm, 'angle')) > 0 ? { angle: Number(get(fm, 'angle')) } : {}),
    ...(shape === 'wall' && Number(get(fm, 'ring')) > 0 ? { ring: Number(get(fm, 'ring')) } : {}),
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
  const feet = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; };
  const lcv = get(fm, 'light-colour'); const lc = typeof lcv === 'string' ? lcv : '';
  const light: EffectLight | null | undefined =
    lm === 'darkness' ? { mode: 'darkness', bright: 0, dim: area.size } :
    lm === 'light' || lm === 'bright' || lm === 'dim' ? { mode: 'light', bright: feet(get(fm, 'bright')), dim: Math.max(feet(get(fm, 'dim')), feet(get(fm, 'bright'))) || area.size, ...(lc ? { colour: lc } : {}) } :
    lm === 'none' || lm === 'no' || lm === 'false' ? null : undefined;
  const col = get(fm, 'colour'), col2 = fm[prop('colour-outer')], op = Number(fm[prop('opacity')]);
  return { path, name, area, ...(file ? { file } : {}), ...(typeof col === 'string' ? { colour: col } : {}), ...(typeof col2 === 'string' ? { colour2: col2 } : {}), ...(op > 0 && op < 1 ? { alpha: op } : op > 1 && op < 100 ? { alpha: op / 100 } : {}), ...(image ? { image } : {}), ...(yes(get(fm, 'attach')) ? { attach: true } : {}), ...(light !== undefined ? { light } : {}) };
}

/** Writes a spell's defaults into a note's properties (keeps everything else in them; an older note's plain ones are moved over). */
export function writeDefaults(fm: Record<string, unknown>, s: { area: Area; file?: string | undefined; colour?: string | undefined; colour2?: string | undefined; alpha?: number | undefined; attach?: boolean | undefined; light?: EffectLight | null | undefined }): void {
  if (isLegacy(fm)) {
    for (const k of [...KEYS, 'blocks', 'color', 'light-color']) delete fm[k];
    if (Array.isArray(fm['tags'])) { fm['tags'] = (fm['tags'] as unknown[]).filter((t) => String(t).replace(/^#/, '').toLowerCase() !== STORAGE_TAG); if (!(fm['tags'] as unknown[]).length) delete fm['tags']; }
    else if (hasTag(fm)) delete fm['tags'];
  }
  const set = (k: Key, v: unknown) => { if (v === undefined) delete fm[prop(k)]; else fm[prop(k)] = v; };
  const a = s.area;
  set('area', a.shape);
  set('size', a.size);
  set('width', a.shape === 'line' ? a.width ?? 5 : a.shape === 'wall' ? a.width ?? 1 : undefined);
  set('angle', a.shape === 'cone' && a.angle ? a.angle : undefined);
  set('origin', a.shape === 'radius' || a.shape === 'cube' ? (a.from === 'caster' ? 'caster' : 'point') : undefined);
  set('ring', a.shape === 'wall' && a.ring ? a.ring : undefined);
  set('round', a.shape === 'wall' && a.round ? true : undefined);
  set('walls', a.shape === 'wall' ? a.blocks ?? 'none' : undefined);
  set('target', a.target);
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
