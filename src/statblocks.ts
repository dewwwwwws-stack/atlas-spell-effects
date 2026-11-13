// Spells in Atlas's statblocks: the names of spells this add-on can cast are found in a statblock's spell lists
// and spellcasting text, and a small Cast button is put in front of each; it opens a menu (the caster and range,
// how it's cast, the cast window). Only text drawn as markdown gets buttons (Obsidian's output, which Atlas itself
// rewrites and draws again from scratch): text React draws is never split; its names are underlined instead (the
// CSS Custom Highlight API), and a click on one casts it. A statblock opened from a token on the map knows its
// token: that creature is the caster.

/** A spell a name in a statblock stands for. */
export interface SpellLink { key: string; name: string }

const norm = (s: string): string => s.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
const bare = (s: string): string => norm(s.replace(/\([^)]*\)/g, '').replace(/[\s.:;,*]+$/g, ''));
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
  /** The spell a text is, as the whole of it ("Fireball", "Misty Step (2/day)."), or null. */
  exact(text: string): SpellLink | null { return this.byName.get(bare(text.replace(/^[\s•·*\-–]+/, ''))) ?? null; }
  /**
   * Whether a text is a run of spells: two names or more, after a label ("Magic Initiate (Wizard): Fire Bolt, Mage
   * Hand, Shield"), split at commas, semicolons, "and", "or"; nearly all of them spells.
   */
  isRun(text: string): boolean {
    // after its label: a colon, a full stop ("Magic Initiate (Wizard). Fire Bolt, …") or a dash
    const tail = text.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').split(/:|\.\s|\s[—–-]\s/).pop() ?? '';
    const items = tail.split(/[,;\/•·]|\band\b|\bor\b/i).map((t) => t.trim()).filter((t) => t.length > 0);
    if (items.length < 2) return false;
    const spells = items.filter((t) => this.exact(t)).length;
    return spells >= 2 && spells >= Math.ceil(items.length * 0.8);
  }
  /** The spells named in `text`, where. */
  find(text: string): { start: number; end: number; link: SpellLink }[] {
    if (!this.re) return [];
    const out: { start: number; end: number; link: SpellLink }[] = [];
    this.re.lastIndex = 0;
    for (let m: RegExpExecArray | null; (m = this.re.exec(text)); ) {
      // the name itself (after the character before it, which isn't part of it)
      const start = m.index + m[1].length, name = m[2];
      const link = this.byName.get(norm(name));
      if (link) out.push({ start, end: start + name.length, link });
      if (name.length === 0) this.re.lastIndex++;
    }
    return out;
  }
}

/** What a heading or label says the part under it is: spells, or gear and the like (where "Shield" is a shield). */
export function headingKind(text: string): 'spell' | 'gear' | null {
  if (/magic items?/i.test(text)) return 'gear';
  if (/spell|cantrip|\bmagic\b|ritual|grimoire|invocation|incantation|mystic arcanum|\bprepared\b|\bpowers?\b|\bprayers?\b|\bmiracles?\b|\bpsionics?\b/i.test(text)) return 'spell';
  if (/inventory|equipment|\bgear\b|\bitems?\b|weapons?|armou?r|possessions|treasure|loot|currency|coins|proficienc|languages|skills|tools?\b|senses|conditions/i.test(text)) return 'gear';
  return null;
}

/** Text that is about spellcasting (not a spell's name that is also a word, as "light" in "dim light"). */
export const SPELL_TEXT = /spellcast|\bcasts?\b|\bspells?\b|at will|\/day|cantrips?|\(\d+ slots?\)|\d+(st|nd|rd|th)[- ]level|spell save dc|casting time|\bcomponents?\b|\bconc(entration)?\b|\britual\b/i;

const STATBLOCK = '.atlas-statblock, .atlas-sb-sheet, .atlas-statblock-preview-window, [class*="statblock"]';
/** The add-on's own things on screen: never read for spells. */
const OWN = '.sfx-caught, .sfx-layer, .sfx-hint, .sfx-castwin, .sfx-edit, .sfx-tool';
const LIST = '.atlas-sb-spell-list, .atlas-sb-spell-header, .atlas-sb-spells-block';
const HL = 'sfx-spell';
/** The Cast button's class (its word is drawn by CSS, so it's no text of the statblock's). */
export const CAST_BTN = 'sfx-sb-cast';
/** Inline elements a name may sit in, as the whole of their text: the button goes in front of them. */
const WRAP = 'a, strong, em, b, i, span';
/** A node React draws (and would draw again its own way): not split, nothing put beside it. */
const reacts = (n: Node): boolean => Object.keys(n).some((k) => k.startsWith('__react'));

type Hit = { node: Text; start: number; end: number; link: SpellLink };
/** The CSS Custom Highlight API (Chromium's; not in every DOM typing yet). */
interface HighlightWindow { Highlight?: new (...ranges: Range[]) => object; CSS?: { highlights?: { set(name: string, h: object): void; delete(name: string): void } } }
/** Where a point falls in the text (the two names browsers give it). */
interface CaretDocument { caretRangeFromPoint?(x: number, y: number): Range | null; caretPositionFromPoint?(x: number, y: number): { offsetNode: Node; offset: number } | null }

/** Watches one document's Atlas statblocks. */
export class StatblockLinker {
  /** The names with no button (in text React draws): underlined, a click casts. */
  private hits: Hit[] = [];
  private buttons = new WeakMap<Element, SpellLink>();
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
    /** A Cast button pressed: its menu, at `x`, `y`. */
    private readonly menu: (link: SpellLink, how: { statblock: HTMLElement; x: number; y: number }) => void = () => {},
    /** A statblock seen (each look): its window's token can be noted while the pointer that opened it is fresh. */
    private readonly seen: (statblock: HTMLElement) => void = () => {},
  ) {}

  start(): void {
    const d = this.doc;
    this.obs = new MutationObserver(() => this.soon());
    this.watch();
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

  private watch(): void { this.obs?.observe(this.doc.body, { childList: true, subtree: true, characterData: true }); }

  stop(): void {
    this.obs?.disconnect(); this.obs = null;
    for (const b of Array.from(this.doc.querySelectorAll('.' + CAST_BTN))) b.remove();
    for (const f of this.off.splice(0)) f();
    (this.doc.defaultView as (Window & HighlightWindow) | null)?.CSS?.highlights?.delete(HL);
    this.tip?.remove(); this.tip = null;
    this.doc.body.classList.remove('sfx-sb-over');
    window.clearTimeout(this.timer);
  }

  /** Looks again soon (a statblock opened, or redrew itself). */
  soon(): void { window.clearTimeout(this.timer); this.timer = window.setTimeout(() => this.scan(), 120); }

  /** Finds the spell names in every statblock and underlines them. */
  scan(): void {
    const names = this.names();
    let hits: Hit[] = [];
    if (names.size) {
      const all = [...this.doc.querySelectorAll<HTMLElement>(STATBLOCK)];
      // the outermost of nested ones only (a sheet inside a preview window is read once)
      const roots = all.filter((el) => !all.some((o) => o !== el && o.contains(el)));
      for (const sb of roots) {
        // the add-on's own cards and windows (a spell's name in a title) are no statblocks
        if (sb.closest(OWN)) continue;
        this.seen(sb);
        if (sb.closest('.sfx-modal, .modal')) continue;
        const spelly = /\bspells?\b|cantrips?|spellcasting/i.test(sb.textContent ?? '');
        const kinds = new Map<Element, 'spell' | 'gear' | null>();
        const walker = this.doc.createTreeWalker(sb, NodeFilter.SHOW_TEXT);
        const about = new Map<Element, boolean>();
        /** Blocks not under gear, in a statblock that has spells: a name of two words or more counts in any text there. */
        const loose = new Map<Element, boolean>();
        const display = new Map<Element, string>();
        for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
          const text = n.data; if (text.trim().length < 3) continue;
          const host = n.parentElement; if (!host || host.closest('input, textarea, [contenteditable=true], ' + OWN)) continue;
          // a spell list, or a paragraph about spellcasting: the block the name is in (Atlas sets a trait's text in
          // spans and links, inside a block of its own)
          const unit = host.closest(LIST) ?? this.blockOf(host, sb, display);
          let ok = about.get(unit);
          if (ok === undefined) {
            // a spell list, text about spellcasting (a name set in bold or italics in a statblock that has spells: below)
            // or under a heading or label about spells ("Spells", "Cantrips", a "Magic" tab); or, not under one about
            // gear, a name that is the whole of its block (a chip, a list item, a table cell, an entry's heading) in a
            // statblock that has spells, or a run of spell names ("Magic Initiate: Fire Bolt, Mage Hand")
            const t = unit.textContent ?? '';
            const kind = this.kindOf(unit, sb, kinds);
            ok = !!unit.closest(LIST) || SPELL_TEXT.test(t) || kind === 'spell'
              || (kind !== 'gear' && ((spelly && !!names.exact(t)) || names.isRun(t)));
            about.set(unit, ok);
            loose.set(unit, spelly && kind !== 'gear');
          }
          // (this text's own: a name in bold or italics, not the rest of its block)
          if (!ok && spelly && host.closest('strong, em, b, i')) ok = true;
          if (!ok) {
            // a name standing on its own in bold, italics or a link ("***Fireball (Recharge 5–6).***", "[[Shield]]"):
            // a spell, wherever it is
            const own = host.closest('strong, em, b, i, a');
            const t = own && sb.contains(own) ? (own.textContent ?? '').replace(/\([^)]*\)/g, '').replace(/[\s.:;,*]+$/g, '').trim() : null;
            // or a name of two words or more ("Misty Step", "Cure Wounds": not words of other text), in a statblock
            // that has spells, not under gear; one word ("Light", "Shield") needs one of the above
            const many = loose.get(unit) === true;
            for (const f of names.find(text)) {
              const said = text.slice(f.start, f.end);
              if ((t !== null && (norm(f.link.name) === norm(t) || norm(said) === norm(t))) || (many && /\s/.test(said.trim()))) hits.push({ node: n, ...f });
            }
            continue;
          }
          for (const f of names.find(text)) hits.push({ node: n, ...f });
        }
      }
    }
    // a button in front of each name (the last in a text first, so the earlier ones' places hold); the rest underlined
    this.obs?.disconnect();
    const left: Hit[] = [];
    try {
      for (const h of [...hits].sort((a, b) => a.node === b.node ? b.start - a.start : 0)) if (!this.button(h)) left.push(h);
    } finally { this.obs?.takeRecords(); this.watch(); }
    this.hits = left;
    hits = left;
    const w = this.doc.defaultView as (Window & HighlightWindow) | null;
    const H = w?.Highlight, reg = w?.CSS?.highlights;
    if (H && reg) {
      const ranges = hits.map((h) => { const r = this.doc.createRange(); r.setStart(h.node, h.start); r.setEnd(h.node, h.end); return r; });
      if (ranges.length) reg.set(HL, new H(...ranges)); else reg.delete(HL);
    }
  }

  /** Puts a Cast button in front of a name (once); false where it can't (text React draws). */
  private button(h: Hit): boolean {
    const n = h.node;
    if (!n.parentNode || reacts(n)) return false;
    const said = n.data.slice(h.start, h.end);
    // the name is the whole of its text and of the inline elements round it: in front of the outermost of them
    let before: Node = n;
    if (h.start === 0 && bare(n.data) === bare(n.data.slice(h.start, h.end))) {
      for (let el = n.parentElement; el && el.matches(WRAP) && !el.matches(STATBLOCK) && !reacts(el) && bare(el.textContent ?? '') === bare(n.data); el = el.parentElement) before = el;
    } else if (h.start > 0) before = n.splitText(h.start);
    const prev = before.previousSibling;
    if (prev instanceof Element && prev.classList.contains(CAST_BTN) && this.buttons.get(prev)?.key === h.link.key) return true;
    const parent = before.parentElement; if (!parent) return false;
    // made in its own window's document (a popped-out window's too), then put in front of the name
    const b = parent.createSpan({ cls: CAST_BTN });
    b.setAttribute('role', 'button'); b.tabIndex = 0;
    b.setAttribute('aria-label', `Cast ${h.link.name}`);
    b.dataset.spell = said || h.link.name;
    this.buttons.set(b, h.link);
    const open = (e: Event, x: number, y: number) => {
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      const sb = b.closest<HTMLElement>(STATBLOCK); const link = this.buttons.get(b);
      if (sb && link) this.menu(link, { statblock: sb, x, y });
    };
    const quiet = (e: Event) => { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); };
    b.addEventListener('pointerdown', quiet);
    b.addEventListener('mousedown', quiet);
    b.addEventListener('click', (e) => { const r = b.getBoundingClientRect(); open(e, r.left, r.bottom); });
    b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { const r = b.getBoundingClientRect(); open(e, r.left, r.bottom); } });
    parent.insertBefore(b, before);
    return true;
  }

  /**
   * What the nearest heading or label over `el` (within the statblock) says its part is: a label of its own or of a
   * block round it (Atlas's labelled lines, section headings, a tab's name), or a heading just before it.
   */
  private kindOf(el: Element, sb: Element, seen: Map<Element, 'spell' | 'gear' | null>): 'spell' | 'gear' | null {
    const HEAD = 'h1, h2, h3, h4, h5, h6, [role=heading], .atlas-sb-section-heading, .atlas-sb-label, .atlas-sb-section-toggle, summary, th, dt';
    const found: Element[] = [];
    let kind: 'spell' | 'gear' | null = null;
    for (let at: Element | null = el; at && kind === null; at = at === sb ? null : at.parentElement) {
      const known = seen.get(at);
      if (known !== undefined) { kind = known; break; }
      found.push(at);
      const texts: string[] = [];
      // its own label (a tab's panel is named by its tab)
      const by = at.getAttribute('aria-labelledby');
      if (by) texts.push(this.doc.getElementById(by)?.textContent ?? '');
      for (const c of Array.from(at.children)) if (c !== el && !c.contains(el) && c.matches(HEAD)) { texts.push(c.textContent ?? ''); break; }
      // a heading just before it
      if (at !== sb) for (let p = at.previousElementSibling, i = 0; p && i < 30; p = p.previousElementSibling, i++) {
        if (p.matches(HEAD)) { texts.push(p.textContent ?? ''); break; }
      }
      for (const t of texts) { kind = headingKind(t); if (kind) break; }
    }
    for (const f of found) seen.set(f, kind);
    return kind;
  }

  /** The nearest element round `el` that is a block of text (not a span or link in a line), within `root`. */
  private blockOf(el: Element, root: Element, seen: Map<Element, string>): Element {
    const view = this.doc.defaultView;
    let at: Element | null = el;
    for (let i = 0; at && i < 10; i++, at = at.parentElement) {
      if (at.matches('p, li, td, dd, blockquote, h1, h2, h3, h4, h5, h6')) return at;
      let d = seen.get(at);
      if (d === undefined) { d = view ? view.getComputedStyle(at).display : 'block'; seen.set(at, d); }
      if (!d.startsWith('inline') && d !== 'contents' && d !== 'none') return at;
      if (at === root) return at;
    }
    return el;
  }

  /** The spell name under the pointer, if any. */
  private at(e: MouseEvent): Hit | null {
    if (!this.hits.length) return null;
    const t = e.target as Element | null;
    if (!t?.closest?.(STATBLOCK)) return null;
    const d = this.doc as Document & CaretDocument;
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
