// Spells from spell notes in the vault: any note whose properties say it is a spell (a `school`, or a tag with
// "spell" in it), or every note in a chosen folder. Its range and duration come from its properties or from
// lines like "**Range:** Self (15-foot cone)" in its text; its area from the text itself (areas.ts).
import { untag } from './rolls';
import type { SpellEntry } from './areas';

type FM = Record<string, unknown> | null | undefined;

const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : Array.isArray(v) ? v.map(str).join(', ') : '');

function tagsOf(fm: FM, bodyTags: readonly string[] = []): string[] {
  const t = fm?.['tags'] ?? fm?.['tag'];
  const list = Array.isArray(t) ? t.map(str) : typeof t === 'string' ? t.split(/[,\s]+/) : [];
  return [...list, ...bodyTags].map((x) => x.replace(/^#/, '').toLowerCase()).filter(Boolean);
}

/** Whether a note's properties (or tags) say it is a spell. */
export function looksLikeSpell(fm: FM, bodyTags: readonly string[] = []): boolean {
  if (!fm && !bodyTags.length) return false;
  if (fm && (fm['school'] !== undefined || fm['spell-school'] !== undefined) && (fm['level'] !== undefined || fm['spell-level'] !== undefined)) return true;
  return tagsOf(fm, bodyTags).some((t) => /(^|\/)spells?(\/|$)/.test(t) || /^spell[-/]/.test(t));
}

/**
 * Whether a note is a creature's statblock (a monster, an NPC, a player), never a spell: its properties say so
 * (statblock, cr, ac and hp, ability scores…), or its tags (statblock, monster, creature, npc…), or its text has a
 * statblock block.
 */
export function looksLikeStatblock(fm: FM, bodyTags: readonly string[] = [], body = ''): boolean {
  const has = (...k: string[]) => !!fm && k.some((x) => fm[x] !== undefined && fm[x] !== null && fm[x] !== '');
  if (fm && (fm['statblock'] === true || has('layout', 'cr', 'challenge', 'challenge_rating', 'stats', 'hit_dice', 'hit_points') || (has('ac', 'armor_class', 'armour_class') && has('hp', 'hit_points')))) return true;
  if (tagsOf(fm, bodyTags).some((t) => /(^|\/)(statblocks?|monsters?|creatures?|npcs?|bestiary|beasts?|characters?|pcs?)(\/|$)/.test(t))) return true;
  return /```statblock\b/.test(body);
}

/** Whether a note is a magic item, weapon or other gear: never a spell. */
export function looksLikeItem(fm: FM, bodyTags: readonly string[] = [], body = ''): boolean {
  const spellish = !!fm && ['school', 'casting_time', 'casting-time', 'components'].some((k) => fm[k] !== undefined && fm[k] !== null && fm[k] !== '');
  if (spellish) return false;
  const has = (...k: string[]) => !!fm && k.some((x) => fm[x] !== undefined && fm[x] !== null && fm[x] !== '');
  if (has('rarity', 'attunement', 'requires_attunement', 'item_type', 'item-type', 'weapon_category', 'mastery')) return true;
  const type = str(fm?.['type'] ?? fm?.['category']).toLowerCase();
  if (/\b(item|weapon|armou?r|gear|equipment|wondrous|potion|ring|rod|staff|wand|scroll|ammunition|shield|loot|vehicle)\b/.test(type)) return true;
  if (tagsOf(fm, bodyTags).some((t) => /(^|\/)(items?|magic-?items?|weapons?|armou?r|gear|equipment|loot|treasure|wondrous)(\/|$)/.test(t))) return true;
  // "Wondrous item, very rare (requires attunement)", "Weapon (longsword), rare"
  return /^\s*[*_]*(?:wondrous item|weapon|armou?r|ring|rod|staff|wand|potion|scroll)\b[^\n]*\b(?:common|uncommon|rare|very rare|legendary|artifact|artefact)\b/im.test(body.replace(/^---\n[\s\S]*?\n---\n?/, ''));
}

/** A line's value in the note's text: "**Range:** 150 feet", "- Range: Self (15-foot cone)", "Range | 60 feet". */
function lineValue(body: string, label: string): string {
  // "Range:", or Pathfinder's "**Range** 30 feet" (a bold label, no colon)
  const re = new RegExp(`^[\\s>*_\\-|]*(?:\\*\\*${label}\\*\\*\\s*:?|${label}\\**\\s*[:|])\\**\\s*\\**\\s*([^\\n|;]+)`, 'im');
  const m = re.exec(body);
  return m ? m[1].replace(/\*+/g, '').trim() : '';
}

/** The spell a note describes. */
export function spellFromNote(path: string, fm: FM, body: string): SpellEntry {
  const base = path.split('/').pop()!.replace(/\.md$/i, '');
  const name = str(fm?.['name'] ?? fm?.['title'] ?? fm?.['aliases']).split(',')[0].trim() || base;
  // the text without the properties block
  // (5e.tools' tags made plain: "{@damage 8d6}" 8d6)
  const text = untag(body.replace(/^---\n[\s\S]*?\n---\n?/, ''));
  const level = Number(fm?.['level'] ?? fm?.['spell-level']);
  return {
    key: 'note:' + path,
    name,
    range: str(fm?.['range']) || lineValue(text, 'Range') || lineValue(text, 'Distance'),
    duration: str(fm?.['duration']) || lineValue(text, 'Duration'),
    descFull: text,
    ...(Number.isFinite(level) ? { level } : {}),
    ...(fm?.['school'] ? { school: str(fm['school']) } : {}),
  };
}
