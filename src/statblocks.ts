// Spells in Atlas's statblocks: the names of spells this add-on can cast are found in a statblock's spell lists
// and spellcasting text, shown underlined (the CSS Custom Highlight API: Atlas's own statblock is left exactly as
// it is, nothing is put into it), and a click on one casts it. A statblock opened from a token on the map knows
// its token: that creature is the caster.

/** A spell a name in a statblock stands for. */
export interface SpellLink { key: string; name: string }

const norm = (s: string): string => s.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+').replace(/'/g, "['’]");

/** Finds names in text: longest first, whole words only, any case. */
export class SpellNames {
  private re: RegExp | null = null;
  private byName = new Map<string, SpellLink>();
  constructor(links: Iterable<SpellLink>) {
    for (const l of links) { const n = norm(l.name); if (n.length >= 3 && !this.byName.has(n)) this.byName.set(n, l); }
    const names = [...this.byName.keys()].sort((a, b) => b.length - a.length);
    if (names.length) this.re = new RegExp(`(^|[^\\p{L}\\p{N}])(${names.map(esc).join('|')})(?![\\p{L}\\p{N}])`, 'giu');
  }
  get size(): number { return this.byName.size; }
  /** The spells named in `text`, where. */
  find(text: string): { start: number; end: number; link: SpellLink }[] {
    if (!this.re) return [];
    const out: { start: number; end: number; link: SpellLink }[] = [];
    this.re.lastIndex = 0;
    for (let m: RegExpExecArray | null; (m = this.re.exec(text)); ) {
      // the name itself (after the character before it, which isn't part of it)
      const start = m.index + m[1]!.length, name = m[2]!;
      const link = this.byName.get(norm(name));
      if (link) out.push({ start, end: start + name.length, link });
      if (name.length === 0) this.re.lastIndex++;
    }
    return out;
  }
}

/** Text that is about spellcasting (not a spell's name that is also a word, as "light" in "dim light"). */
export const SPELL_TEXT = /spellcast|\bspells?\b|at will|\/day|cantrips?|\(\d+ slots?\)|\d+(st|nd|rd|th)[- ]level|spell save dc|casting time|\bcomponents?\b|\bconc(entration)?\b|\britual\b/i;

const STATBLOCK = '.atlas-statblock, .atlas-sb-sheet, .atlas-statblock-preview-window, [class*="statblock"]';
const LIST = '.atlas-sb-spell-list, .atlas-sb-spell-header, .atlas-sb-spells-block';
const HL = 'sfx-spell';

type Hit = { node: Text; start: number; end: number; link: SpellLink };

/** Watches one document's Atlas statblocks. */
export class StatblockLinker {
  private hits: Hit[] = [];
  private obs: MutationObserver | null = null;
  private timer = 0;
  private tip: HTMLElement | null = null;
  private hover: Hit | null = null;
  private readonly off: (() => void)[] = [];

  constructor(
    private readonly doc: Document,
    private readonly names: () => SpellNames,
    /** A spell name clicked: `shift` for the cast window; `statblock` is the statblock's element (for its token). */
    private readonly cast: (link: SpellLink, how: { shift: boolean; statblock: HTMLElement; x: number; y: number }) => void,
  ) {}

  start(): void {
    const d = this.doc;
    this.obs = new MutationObserver(() => this.soon());
    this.obs.observe(d.body, { childList: true, subtree: true, characterData: true });
    const opts = { capture: true } as AddEventListenerOptions;
    const move = (e: PointerEvent) => this.over(e);
    const down = (e: PointerEvent) => this.press(e);
    const click = (e: MouseEvent) => { if (this.at(e) && !(e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); } };
    d.addEventListener('pointermove', move, opts);
    d.addEventListener('pointerdown', down, opts);
    d.addEventListener('click', click, opts);
    this.off.push(() => { d.removeEventListener('pointermove', move, opts); d.removeEventListener('pointerdown', down, opts); d.removeEventListener('click', click, opts); });
    this.scan();
  }

  stop(): void {
    this.obs?.disconnect(); this.obs = null;
    for (const f of this.off.splice(0)) f();
    (this.doc.defaultView as any)?.CSS?.highlights?.delete?.(HL);
    this.tip?.remove(); this.tip = null;
    this.doc.body.classList.remove('sfx-sb-over');
    window.clearTimeout(this.timer);
  }

  /** Looks again soon (a statblock opened, or redrew itself). */
  soon(): void { window.clearTimeout(this.timer); this.timer = window.setTimeout(() => this.scan(), 120); }

  /** Finds the spell names in every statblock and underlines them. */
  scan(): void {
    const names = this.names();
    const hits: Hit[] = [];
    if (names.size) {
      const all = [...this.doc.querySelectorAll<HTMLElement>(STATBLOCK)];
      // the outermost of nested ones only (a sheet inside a preview window is read once)
      const roots = all.filter((el) => !all.some((o) => o !== el && o.contains(el)));
      for (const sb of roots) {
        if (sb.closest('.sfx-modal, .modal')) continue;
        const spelly = /\bspells?\b|cantrips?|spellcasting/i.test(sb.textContent ?? '');
        const walker = this.doc.createTreeWalker(sb, NodeFilter.SHOW_TEXT);
        const about = new Map<Element, boolean>();
        for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
          const text = n.data; if (text.trim().length < 3) continue;
          const host = n.parentElement; if (!host || host.closest('input, textarea, [contenteditable=true]')) continue;
          // a spell list, or a paragraph about spellcasting
          const unit = host.closest(`${LIST}, p, li, td`) ?? host;
          let ok = about.get(unit);
          if (ok === undefined) {
            // a spell list, text about spellcasting, or a name set in bold or italics in a statblock that has spells
            ok = !!unit.closest(LIST) || SPELL_TEXT.test(unit.textContent ?? '') || (spelly && !!host.closest('strong, em, b, i'));
            about.set(unit, ok);
          }
          if (!ok) continue;
          for (const f of names.find(text)) hits.push({ node: n, ...f });
        }
      }
    }
    this.hits = hits;
    const w = this.doc.defaultView as any;
    const H = w?.Highlight, reg = w?.CSS?.highlights;
    if (H && reg) {
      const ranges = hits.map((h) => { const r = this.doc.createRange(); r.setStart(h.node, h.start); r.setEnd(h.node, h.end); return r; });
      if (ranges.length) reg.set(HL, new H(...ranges)); else reg.delete(HL);
    }
  }

  /** The spell name under the pointer, if any. */
  private at(e: MouseEvent): Hit | null {
    if (!this.hits.length) return null;
    const t = e.target as Element | null;
    if (!t?.closest?.(STATBLOCK)) return null;
    const d = this.doc as any;
    let node: Node | null = null, off = 0;
    if (d.caretRangeFromPoint) { const r = d.caretRangeFromPoint(e.clientX, e.clientY); if (r) { node = r.startContainer; off = r.startOffset; } }
    else if (d.caretPositionFromPoint) { const p = d.caretPositionFromPoint(e.clientX, e.clientY); if (p) { node = p.offsetNode; off = p.offset; } }
    if (!node || node.nodeType !== 3) return null;
    for (const h of this.hits) {
      if (h.node !== node || off < h.start || off > h.end) continue;
      // the caret lands beside a letter: check the pointer is really over the name
      const r = this.doc.createRange(); r.setStart(h.node, h.start); r.setEnd(h.node, h.end);
      if ([...r.getClientRects()].some((b) => e.clientX >= b.left - 1 && e.clientX <= b.right + 1 && e.clientY >= b.top - 1 && e.clientY <= b.bottom + 1)) return h;
    }
    return null;
  }

  private over(e: PointerEvent): void {
    const h = this.at(e);
    if (h !== this.hover) {
      this.hover = h;
      this.doc.body.classList.toggle('sfx-sb-over', !!h);
      if (h && !this.tip) { this.tip = this.doc.body.createDiv({ cls: 'sfx-sb-tip' }); }
      if (!h) { this.tip?.remove(); this.tip = null; }
      else this.tip!.setText(`✨ Cast ${h.link.name}   ·   Shift: open in the cast window`);
    }
    if (this.tip) { this.tip.style.left = `${e.clientX}px`; this.tip.style.top = `${e.clientY}px`; }
  }

  private press(e: PointerEvent): void {
    if (e.button !== 0 || e.ctrlKey || e.metaKey) return;                   // Ctrl / ⌘ click: Atlas's own (a link opens)
    const h = this.at(e); if (!h) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    this.tip?.remove(); this.tip = null; this.hover = null; this.doc.body.classList.remove('sfx-sb-over');
    const sb = (e.target as Element).closest(STATBLOCK) as HTMLElement;
    this.cast(h.link, { shift: e.shiftKey, statblock: sb, x: e.clientX, y: e.clientY });
  }
}
