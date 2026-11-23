// The D&D System Reference Documents built in (optional, Settings → Built-in SRD): 5.2.1 (2024 rules) and 5.1 (2014
// rules), CC-BY-4.0 by Wizards of the Coast. Each spell and creature is kept as the note it would be in a vault, so a
// built-in spell is read exactly as a spell note is, and a creature can be written out as an Atlas statblock note.
import { SRD_GZ } from './srd-data';

export type SrdEdition = '2024' | '2014';
export interface SrdBook { spells: Record<string, string>; monsters: Record<string, string>; attribution: string; source: string }
export type Srd = Record<SrdEdition, SrdBook>;

let loading: Promise<Srd> | null = null;

/** The SRD (unpacked once, the first time it's needed). */
export function loadSrd(): Promise<Srd> {
  loading ??= (async () => {
    const bin = Uint8Array.from(atob(SRD_GZ), (c) => c.charCodeAt(0));
    const stream = new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'));
    return JSON.parse(await new Response(stream).text()) as Srd;
  })();
  return loading;
}

/** A note's properties and text (its properties block parsed by `parse`, Obsidian's YAML reader). */
export function splitNote(md: string, parse: (y: string) => unknown): { fm: Record<string, unknown>; text: string } {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(md);
  let fm: Record<string, unknown> = {};
  if (m) { try { const y = parse(m[1]); if (y && typeof y === 'object') fm = y as Record<string, unknown>; } catch { /* not YAML */ } }
  return { fm, text: md };
}
