// Atlas's conditions and spells: the "In a spell" marker the add-on puts on creatures inside a spell, and the
// conditions a spell gives the creatures inside it (Silence: Deafened; Darkness: Blinded). Conditions belong to a
// collection's game system in Atlas (its settings' list, each with an id); the add-on goes by their names, so a
// spell's conditions work in any collection that has conditions of those names.

/** The marker's id in a collection's conditions (the same in every collection). */
export const IN_SPELL_ID = 'atlas-spell-effects-in-a-spell';
/** The marker as a condition of Atlas's: a sparkle on a purple badge. */
export const IN_SPELL = { id: IN_SPELL_ID, name: 'In a spell', color: '#8b5cf6', icon: 'magic' };

/** A condition as Atlas defines it in a collection's settings. */
export interface ConditionDef { id: string; name: string; color?: string; icon?: string; valued?: boolean; effect?: string }

/** Spells whose text names no condition but which give one all the same (the DM's call, kept small). */
export const GIVES: Readonly<Record<string, readonly string[]>> = { darkness: ['Blinded'] };

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The conditions a spell's text gives (of `names`, the collection's): "have the Restrained condition", "is
 * Blinded", "falls Prone", "become Invisible". Not ones it ends, prevents or guards against ("is no longer
 * Restrained", "Immunity to the Charmed condition", "end one condition on it: Blinded").
 */
export function conditionsInText(text: string, names: readonly string[]): string[] {
  const out: string[] = [];
  for (const name of names) {
    if (!name.trim()) continue;
    const re = new RegExp(`\\b(?:has|have|having|gains?|becomes?|is|are|be|falls?|knocked|remains?)\\s+(?:the\\s+)?${esc(name.trim())}\\b`, 'gi');
    for (let m: RegExpExecArray | null; (m = re.exec(text)); ) {
      const before = text.slice(Math.max(0, m.index - 30), m.index).toLowerCase();
      if (/no longer|immun|can['’]?t|cannot|\bnot\b|\bend|cure|suppress|against|instead of/.test(before)) continue;
      out.push(name.trim());
      break;
    }
  }
  return out;
}

/** A spell's conditions: what its text gives, and any it gives without saying (Darkness: Blinded), of `names`. */
export function spellConditions(spell: { name: string; descFull?: string } | null, names: readonly string[]): string[] {
  if (!spell) return [];
  const from = conditionsInText(spell.descFull ?? '', names);
  const own = (GIVES[spell.name.trim().toLowerCase()] ?? []).map((n) => names.find((x) => x.toLowerCase() === n.toLowerCase())).filter((x): x is string => !!x);
  return [...new Set([...from, ...own])];
}

/** The ids of `names` among a collection's conditions (by name, any case); names it doesn't have are left out. */
export function idsOf(names: readonly string[], defs: readonly ConditionDef[]): string[] {
  const out: string[] = [];
  for (const n of names) { const d = defs.find((x) => x.name.trim().toLowerCase() === n.trim().toLowerCase()); if (d && !out.includes(d.id)) out.push(d.id); }
  return out;
}

/**
 * How long a spell has been up, from Atlas's initiative: rounds since the round it was cast in (or the fight began),
 * and, when the game system's round has a length (`secs`, set by you: game systems differ, some have none), the
 * time that is.
 */
export function upFor(rounds: number, secs?: number): string {
  const n = Math.max(0, rounds);
  if (!secs || !(secs > 0)) return `Round ${n + 1}`;
  if (n === 0) return 'Round 1 · cast this round';
  return `Round ${n + 1} · ${timeOf(n * secs)}`;
}

/**
 * How long a round lasts in Atlas's built-in game systems (seconds), where the game sets one. The others count
 * rounds only (Daggerheart, Call of Cthulhu, Shadowdark, Draw Steel: no fixed round), as do your own systems until
 * you set a length.
 */
export const ROUND_SECS: Readonly<Record<string, number>> = { 'builtin:dnd5e': 6, 'builtin:pathfinder2e': 6, 'builtin:ose': 10, 'builtin:cairn': 10, 'builtin:cyberpunkred': 3 };

/** A time in seconds, written short: "12 s", "1 min", "1 min 30 s", "1 h 5 min". */
export function timeOf(secs: number): string {
  const s = Math.round(secs);
  if (s < 60) return `${s} s`;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return [h ? `${h} h` : '', m ? `${m} min` : '', r ? `${r} s` : ''].filter(Boolean).join(' ');
}

/** A round's length as you write it ("6", "6 seconds", "10 s", "1 minute", "1 min 30 s"): seconds; 0 when empty or unreadable. */
export function secondsOf(text: string): number {
  const t = text.trim().toLowerCase(); if (!t) return 0;
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t);
  let total = 0, any = false;
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*(h(?:ours?|rs?)?|m(?:in(?:ute)?s?)?|s(?:ec(?:ond)?s?)?)\b/g)) {
    any = true; const v = Number(m[1]); const u = m[2] ?? 's';
    total += u.startsWith('h') ? v * 3600 : u.startsWith('m') ? v * 60 : v;
  }
  return any ? total : 0;
}
