// Draws effects over a map: the DM's Atlas view and the player window each get a layer laid exactly over the
// map canvas (turned with the TV), and every effect is an element placed in it from its box in the world.
// Animations are the vault's files (video or image); without one, the add-on draws the shape itself.
import { boxOf, onCreature, coneWidth, wallPieces, wallPoints, wallThickness, type Controls, type Point, type Box, type Effect, type Scale, type TokenAt } from './geometry';
import { fromFeet, unitLabel, type Shape } from './areas';
import { fitOf, type Trim } from './trim';

export interface Mapping {
  /** A world point in the layer's pixels. */
  toLocal(x: number, y: number): { x: number; y: number };
  /** Layer pixels per world unit. */
  scale: number;
}

export interface Surface {
  doc: Document;
  /** The layer over the map canvas (made when missing); null when there is no map to draw over. */
  layer(): HTMLElement | null;
  /** How the world lands on the layer now; null while nothing is shown. */
  mapping(): Mapping | null;
  /** Whether this surface shows the map `map` now. */
  shows(map: string): boolean;
  /** The players' view: only tokens the players have show through lasting effects. */
  players?: boolean;
}

/** What the painter needs to know of the world for an effect, now. */
export interface World {
  scale(map: string): Scale | null;
  /** A token's centre and radius (world units), or null when it is gone. */
  token(map: string, id: string): TokenAt | null;
  /** The vault file's address for a video or image element. */
  url(path: string): string | null;
  /** Where an animation's picture really is in its frame, once it has been looked at. */
  trim(path: string): Trim | null;
  /** The tokens on a map (for the players: only their own, never hidden ones), to show through lasting effects. */
  tokens(map: string, players: boolean): TokenAt[];
  /**
   * Whether Atlas draws a token in the frame being drawn now (its sprite is shown): the players' frame leaves out
   * hidden tokens and those no player sees. Null when it can't tell.
   */
  shown?(map: string, id: string): boolean | null;
}

/** A style written only when it changed. */
export function setVar(el: HTMLElement | SVGElement, prop: string, value: string): void { if (el.style.getPropertyValue(prop) !== value) el.style.setProperty(prop, value); }

/** Where each element was last put (so an unchanged one isn't written again). */
const placed = new WeakMap<HTMLElement, string>();

/** What is known of an animation once loaded (shared by every surface). */
export const artInfo = new Map<string, { aspect: number; feet: number; duration: number }>();

/** How long an instant effect drawn by the add-on, or an image, stays. */
export const DRAWN_MS = 1800;
export const FADE_MS = 450;



/** One surface's elements, by effect id. */
/** A preview while placing: the aimed area, or the range ring round the caster. */
const isPreview = (e: Effect): boolean => e.id === 'preview' || e.id.startsWith('preview-');

export class Painter {
  private els = new Map<string, HTMLElement>();
  private under: HTMLElement | null = null;
  private mask = '';
  constructor(readonly surface: Surface, private readonly world: World) {}

  /** Draws `effects` as they are now (`now`, ms); `out` are ending (fading). */
  paint(effects: readonly Effect[], now: number, out: ReadonlySet<string>, preview?: Effect | readonly (Effect | null)[] | null): void {
    const layer = this.surface.layer();
    const m = layer ? this.surface.mapping() : null;
    const keep = new Set<string>();
    const holes: { x: number; y: number; r: number; sel: boolean }[] = [];
    if (layer && m) {
      const extra = (Array.isArray(preview) ? preview : [preview]).filter((x): x is Effect => !!x);
      const all = extra.length ? [...effects, ...extra] : effects;
      // lasting effects sit together under the tokens' holes: what stays on the map never hides who stands in it
      if (!this.under || this.under.parentElement !== layer) { this.under?.remove(); this.under = layer.createDiv({ cls: 'sfx-under' }); layer.prepend(this.under); this.mask = ''; }
      const maps = new Set<string>();
      for (const e of effects) if (e.lasting && this.surface.shows(e.map)) maps.add(e.map);
      for (const map of maps) for (const t of this.world.tokens(map, !!this.surface.players)) {
        const q = m.toLocal(t.x, t.y); const r = t.r * m.scale;
        if (r > 1 && q.x > -r - 80 && q.y > -r - 80 && q.x < layer.clientWidth + r + 80 && q.y < layer.clientHeight + r + 80) holes.push({ x: q.x, y: q.y, r, sel: !!t.sel });
      }
      for (const e of all) {
        if (!this.surface.shows(e.map)) continue;
        const s = this.world.scale(e.map); if (!s) continue;
        const tok = e.token ? this.world.token(e.map, e.token) : null;
        if (e.token && !tok) continue;                               // its token is gone (or on another level)
        const info = e.file ? artInfo.get(e.file) : undefined;
        let el = this.els.get(e.id);
        if (!el) { const made = this.make(e, e.lasting && !isPreview(e) && !onCreature(e) ? this.under : layer); if (!made) continue; el = made; this.els.set(e.id, el); }
        if (e.shape === 'wall') { if (e.file && !isPreview(e)) this.placeWall(el, e, wallPieces(e, s, tok, true), m, s, info, wallPoints(e, tok)); else this.drawWall(el, e, s, tok, m); }
        else { this.place(el, boxOf(e, s, tok, info ? { aspect: info.aspect, feet: info.feet } : null), m, s); this.fit(el, e); }
        if (el.classList.contains('sfx-out') !== out.has(e.id)) el.classList.toggle('sfx-out', out.has(e.id));
        keep.add(e.id);
      }
    }
    for (const [id, el] of this.els) if (!keep.has(id)) { el.remove(); this.els.delete(id); }
    if (this.under) {
      const mask = holes.length ? holesMask(holes.slice(0, 120), this.surface.layer()?.clientWidth ?? 0, this.surface.layer()?.clientHeight ?? 0) : '';
      if (mask !== this.mask) {
        this.mask = mask;
        // the holes go in a CSS variable; the class (styles.css) puts them to use
        if (mask) setVar(this.under, '--sfx-holes', mask);
        if (this.under.classList.contains('sfx-holes') !== !!mask) this.under.classList.toggle('sfx-holes', !!mask);
      }
    }
    void now;
  }

  private make(e: Effect, layer: HTMLElement): HTMLElement | null {
    const el = layer.createDiv({ cls: `sfx sfx-${e.shape} ${e.lasting ? 'sfx-lasting' : 'sfx-instant'}${isPreview(e) ? ' sfx-preview' : ''}${e.id === 'preview-range' ? ' sfx-range' : ''}` });
    el.style.setProperty('--c', e.colour || '#ff8a2a');
    if (e.colour2) el.style.setProperty('--c2', e.colour2);
    if (e.alpha !== undefined && e.alpha < 1) el.style.setProperty('--sfx-alpha', String(Math.max(0.05, e.alpha)));
    el.dataset.look = (e.file ?? '') + '|' + (e.colour ?? '');
    if (e.shape !== 'wall') this.fill(el, e);                     // a wall's pieces are made as they are placed
    layer.appendChild(el);
    return el;
  }

  /** The effect's animation (or the drawn shape) inside `el`. */
  private fill(el: HTMLElement, e: Effect): void {
    const doc = this.surface.doc;
    const url = e.file && !isPreview(e) ? this.world.url(e.file) : null;
    if (url && e.file) {
      const file = e.file;
      const video = /\.(webm|mp4)$/i.test(file);
      const media: HTMLVideoElement | HTMLImageElement = video ? el.createEl('video') : el.createEl('img');
      const feet = fromFeet(Number((/(\d+)\s*ft/i.exec(file) ?? [])[1] ?? 0) || 0);
      const learn = (w: number, h: number, duration: number) => { if (w > 0 && h > 0) artInfo.set(file, { aspect: w / h, feet, duration }); };
      if (video) {
        const v = media as HTMLVideoElement;
        v.muted = true; v.autoplay = true; v.playsInline = true; v.loop = e.lasting; v.preload = 'auto';
        v.addEventListener('loadedmetadata', () => learn(v.videoWidth, v.videoHeight, v.duration * 1000));
        v.src = url;
        void v.play?.()?.catch?.(() => undefined);
      } else {
        const im = media as HTMLImageElement;
        im.addEventListener('load', () => learn(im.naturalWidth, im.naturalHeight, 0));
        im.src = url;
      }
      el.appendChild(media);
    } else {
      drawShape(doc, el, e.shape);
    }
  }

  /** A wall drawn in its colour: one glowing line along its corners (no bright knots where stretches meet). */
  private drawWall(el: HTMLElement, e: Effect, s: Scale, tok: TokenAt | null, m: Mapping): void {
    const NS = 'http://www.w3.org/2000/svg';
    let svg = el.firstElementChild as SVGSVGElement | null;
    if (!svg || svg.tagName.toLowerCase() !== 'svg') {
      el.replaceChildren();
      svg = this.surface.doc.createElementNS(NS, 'svg');
      svg.setAttribute('class', 'sfx-drawn sfx-path');
      svg.appendChild(this.surface.doc.createElementNS(NS, 'path'));
      const core = this.surface.doc.createElementNS(NS, 'path'); core.setAttribute('class', 'sfx-core'); svg.appendChild(core);
      el.appendChild(svg);
    }
    const pts = wallPoints(e, tok).map((p) => m.toLocal(p.x, p.y));
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') + (e.closed && pts.length > 2 ? ' Z' : '');
    const [path, core] = [...svg.children] as SVGPathElement[];
    const w = wallThickness(e, s, false) * m.scale;
    if (path.getAttribute('d') !== d) { path.setAttribute('d', d); core.setAttribute('d', d); }
    setVar(path, 'stroke-width', `${w.toFixed(1)}px`); setVar(core, 'stroke-width', `${Math.max(1, w * 0.35).toFixed(1)}px`);
    setVar(el, '--u', `${Math.max(4, s.cell * m.scale * 0.5)}px`);
  }

  /**
   * A wall: one piece per stretch, each laid along it. An animation repeats along a long stretch at its own
   * proportions (a 60 ft wall of fire is several flames side by side, not one stretched thin). JB2A's wall art
   * fades out at both ends, so the copies overlap (the fades blend instead of leaving gaps), and each stretch runs a
   * little past its corners, so stretches meet without a notch. A ring with ring art ("…_Ring", "…_Circle") is that
   * art, once, round the whole ring.
   */
  private placeWall(el: HTMLElement, e: Effect, pieces: Box[], m: Mapping, s: Scale, info?: { aspect: number }, pts?: Point[]): void {
    const ringArt = !!e.closed && !!e.file && /(ring|circle|sphere)/i.test(e.file) && !!pts && pts.length > 2;
    if (ringArt) {
      const cx = pts.reduce((t, p) => t + p.x, 0) / pts.length, cy = pts.reduce((t, p) => t + p.y, 0) / pts.length;
      const r = Math.max(...pts.map((p) => Math.hypot(p.x - cx, p.y - cy)));
      const d = 2 * r + (pieces[0]?.h ?? 0);
      pieces = [{ cx, cy, w: d, h: d, rot: 0 }];
    }
    while (el.children.length > pieces.length) el.lastElementChild!.remove();
    const last = pieces.length - 1;
    pieces.forEach((b0, i) => {
      let piece = el.children[i] as HTMLElement | undefined;
      if (!piece) piece = el.createDiv({ cls: 'sfx-piece' });
      let b = b0;
      if (!ringArt) {
        // past the corners: a little at each join (not at a wall's two free ends)
        const ext = b.h * 0.15;
        const es = i > 0 || e.closed ? ext : 0, ee = i < last || e.closed ? ext : 0;
        const c = Math.cos(b.rot), si = Math.sin(b.rot), shift = (ee - es) / 2;
        b = { cx: b.cx + c * shift, cy: b.cy + si * shift, w: b.w + es + ee, h: b.h, rot: b.rot };
      }
      const OVER = 0.18;                                            // how much neighbouring copies overlap
      const tile = info && info.aspect > 0 ? b.h * info.aspect : b.w;
      const repeat = ringArt || !(info && info.aspect > 0) ? 1 : Math.max(1, Math.round((b.w - OVER * tile) / ((1 - OVER) * tile)));
      if (Number(piece.dataset.n) !== repeat) {
        piece.replaceChildren(); piece.dataset.n = String(repeat);
        for (let k = 0; k < repeat; k++) this.fill(piece, e);
      }
      this.place(piece, b, m, s);
      // the copies, side by side, overlapping
      const wpx = b.w * m.scale;
      const len = repeat > 1 ? wpx / (repeat - (repeat - 1) * OVER) : wpx;
      [...piece.children].forEach((k, n) => { setVar(k as HTMLElement, 'left', `${(n * (1 - OVER) * len).toFixed(1)}px`); setVar(k as HTMLElement, 'width', `${len.toFixed(1)}px`); });
    });
    setVar(el, '--u', `${Math.max(4, s.cell * m.scale * 0.5)}px`);
  }

  /** Where an element goes; written only when it changed (each write makes the browser work out styles again). */
  private place(el: HTMLElement, b: Box, m: Mapping, s: Scale): void {
    const c = m.toLocal(b.cx, b.cy);
    const w = b.w * m.scale, h = b.h * m.scale;
    const key = `${w.toFixed(1)}|${h.toFixed(1)}|${(c.x - w / 2).toFixed(1)}|${(c.y - h / 2).toFixed(1)}|${b.rot.toFixed(4)}|${(s.cell * m.scale).toFixed(1)}`;
    if (placed.get(el) === key) return;
    placed.set(el, key);
    el.style.width = `${w}px`; el.style.height = `${h}px`;
    el.style.transform = `translate(${c.x - w / 2}px, ${c.y - h / 2}px) rotate(${b.rot}rad)`;
    el.style.setProperty('--u', `${Math.max(4, s.cell * m.scale * 0.5)}px`);
  }

  /** The art laid out so its picture, not its empty frame, fills the area (a cone reaching its full length). */
  private fit(el: HTMLElement, e: Effect): void {
    const fo = e.file && !isPreview(e) && (e.shape === 'cone' || e.shape === 'line') ? fitOf(this.world.trim(e.file), e.shape) : null;
    if (fo) {
      setVar(el, '--fx-l', `${fo.l.toFixed(2)}%`); setVar(el, '--fx-t', `${fo.t.toFixed(2)}%`);
      setVar(el, '--fx-w', `${fo.w.toFixed(2)}%`); setVar(el, '--fx-h', `${fo.h.toFixed(2)}%`);
    }
    if (el.classList.contains('sfx-fit') !== !!fo) el.classList.toggle('sfx-fit', !!fo);
  }

  /** Drops an effect's element, so it is made again (another animation or colour). */
  forget(id: string): void { this.els.get(id)?.remove(); this.els.delete(id); }

  stop(): void {
    for (const el of this.els.values()) el.remove();
    this.els.clear();
  }
}

/**
 * The see-through holes for tokens in lasting effects, as a mask (an SVG picture the size of the layer): each
 * token, the nameplate and bars Atlas draws under it, the counters beside it, and, when it is picked, the ring of
 * its handles. Atlas draws those at the same size on screen at any zoom, so they are measured in screen pixels.
 */
export function holesMask(holes: readonly { x: number; y: number; r: number; sel: boolean }[], w: number, h: number): string {
  const f = (n: number) => n.toFixed(1);
  const shapes: string[] = [];
  for (const t of holes) {
    const r = t.sel ? t.r + 34 : t.r * 1.06 + 2;
    shapes.push(`<circle cx='${f(t.x)}' cy='${f(t.y)}' r='${f(r)}'/>`);
    // nameplate and bars, under it
    const bw = Math.max(t.r * 1.15, 62), top = t.y + t.r * 0.55, bh = t.r * 0.45 + 54;
    shapes.push(`<rect x='${f(t.x - bw)}' y='${f(top)}' width='${f(bw * 2)}' height='${f(bh)}' rx='22'/>`);
    // counters beside it
    const sw = t.r + 30;
    shapes.push(`<rect x='${f(t.x - sw)}' y='${f(t.y - t.r * 0.7)}' width='${f(sw * 2)}' height='${f(t.r * 1.4)}' rx='${f(t.r * 0.7)}'/>`);
  }
  // white: the effect shows; the holes' grey: it shows faintly (a fifth)
  const W = Math.max(1, Math.round(w)), H = Math.max(1, Math.round(h));
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}' viewBox='0 0 ${W} ${H}'><defs><filter id='b' x='-10%' y='-10%' width='120%' height='120%'><feGaussianBlur stdDeviation='7'/></filter><mask id='m'><rect width='100%' height='100%' fill='#fff'/><g fill='#333' filter='url(#b)'>${shapes.join('')}</g></mask></defs><rect width='100%' height='100%' fill='#000' mask='url(#m)'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/**
 * A drawn effect's shape inside `el` (an element with the classes `sfx sfx-<shape>` and its colours in --c and --c2):
 * a cone is a triangle, its colour fading from its point, its edge in the outer colour; the rest are styled boxes.
 */
export function drawShape(doc: Document, el: HTMLElement, shape: Shape): void {
  const NS = 'http://www.w3.org/2000/svg';
  if (shape === 'cone') {
    const gid = 'sfx-g-' + Math.random().toString(36).slice(2);
    const svg = doc.createElementNS(NS, 'svg'); svg.setAttribute('class', 'sfx-drawn'); svg.setAttribute('viewBox', '0 0 100 100'); svg.setAttribute('preserveAspectRatio', 'none');
    const grad = doc.createElementNS(NS, 'linearGradient'); grad.id = gid;
    for (const [off, cls] of [['0', 'sfx-cone-near'], ['0.55', 'sfx-cone-mid'], ['1', 'sfx-cone-far']]) { const st = doc.createElementNS(NS, 'stop'); st.setAttribute('offset', off); st.setAttribute('class', cls); grad.appendChild(st); }
    const defs = doc.createElementNS(NS, 'defs'); defs.appendChild(grad); svg.appendChild(defs);
    const tri = doc.createElementNS(NS, 'polygon'); tri.setAttribute('points', '0,50 100,0 100,100'); tri.setAttribute('fill', `url(#${gid})`); tri.setAttribute('class', 'sfx-cone-fill'); svg.appendChild(tri);
    const edge = doc.createElementNS(NS, 'polygon'); edge.setAttribute('points', '0,50 100,0 100,100'); edge.setAttribute('class', 'sfx-cone-edge'); edge.setAttribute('vector-effect', 'non-scaling-stroke'); svg.appendChild(edge);
    el.appendChild(svg);
  } else if (shape === 'wall') {
    // a sample of a wall (the cast window's tile): a bent stretch, drawn as walls on the map are
    const svg = doc.createElementNS(NS, 'svg'); svg.setAttribute('class', 'sfx-drawn sfx-path sfx-sample-path'); svg.setAttribute('viewBox', '0 0 100 100');
    for (const cls of ['', 'sfx-core']) { const p = doc.createElementNS(NS, 'path'); p.setAttribute('d', 'M10 72 L42 36 L64 58 L90 26'); if (cls) p.setAttribute('class', cls); svg.appendChild(p); }
    el.appendChild(svg);
  } else {
    el.createDiv({ cls: 'sfx-drawn' });
  }
}

/** A drawn effect as a sample (the cast window's first tile): its shape in its colours, as on the map. */
export function drawnSample(parent: HTMLElement, shape: Shape, colour: string, colour2: string | undefined, alpha: number | undefined, angle?: number): HTMLElement {
  const el = parent.createDiv({ cls: `sfx sfx-${shape} sfx-lasting sfx-sample` });
  el.style.setProperty('--c', colour);
  if (colour2) el.style.setProperty('--c2', colour2);
  if (alpha !== undefined && alpha < 1) el.style.setProperty('--sfx-alpha', String(Math.max(0.05, alpha)));
  // a cone as wide as its angle makes it (within the tile)
  if (shape === 'cone') el.style.setProperty('--sfx-cone-h', `${Math.min(92, 60 * coneWidth(1, angle)).toFixed(1)}%`);
  drawShape(parent.ownerDocument, el, shape);
  parent.appendChild(el);
  return el;
}

/** Lucide's rotate and chevron glyphs, as Atlas's own controls use. */
const ICON: Record<string, string[]> = {
  turn: ['M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8', 'M21 3v5h-5'],
  left: ['m15 18-6-6 6-6'],
  right: ['m9 18 6-6-6-6'],
};

/**
 * The picked effects on the DM's view, as Atlas shows a picked token: an outline in the accent colour, and for
 * one effect alone its controls (rotate, ‹ › for size, the size badge with − and +, a dot on each wall corner).
 * Written only when something changed. None: taken away.
 */
export function paintHandles(layer: HTMLElement | null, m: Mapping | null, picked: Controls[] | null): void {
  const doc = layer?.ownerDocument;
  let box = layer?.querySelector(':scope > .sfx-sel') as HTMLElement | null;
  if (!layer || !m || !picked?.length || !doc) { box?.remove(); return; }
  const loc = (p: Point) => m.toLocal(p.x, p.y);
  const f = (n: number) => n.toFixed(1);
  const one = picked.length === 1 ? picked[0] : null;
  const key = JSON.stringify(picked.map((c) => [c.outline, c.handles.map((h) => [h.id, f(h.x), f(h.y)]), c.badge])) + f(m.scale) + JSON.stringify(loc({ x: 0, y: 0 }));
  if (box && box.dataset.key === key) return;
  const NS = 'http://www.w3.org/2000/svg';
  if (!box) { box = layer.createDiv({ cls: 'sfx-sel' }); layer.prepend(box); }
  box.dataset.key = key;
  box.replaceChildren();
  // outlines
  const svg = doc.createElementNS(NS, 'svg');
  for (const c of picked) {
    const o = c.outline;
    let el: SVGElement;
    if (o.circle) {
      const q = loc({ x: o.circle.cx, y: o.circle.cy });
      el = doc.createElementNS(NS, 'circle');
      el.setAttribute('cx', f(q.x)); el.setAttribute('cy', f(q.y)); el.setAttribute('r', f(o.circle.r * m.scale));
    } else {
      el = doc.createElementNS(NS, o.closed ? 'polygon' : 'polyline');
      el.setAttribute('points', (o.poly ?? []).map((p) => { const q = loc(p); return `${f(q.x)},${f(q.y)}`; }).join(' '));
    }
    el.setAttribute('class', 'sfx-outline');
    svg.appendChild(el);
  }
  box.appendChild(svg);
  if (!one) return;
  // the controls of one picked effect
  for (const h of one.handles) {
    const q = loc(h);
    const dot = h.id.startsWith('p');
    const el = box.createDiv({ cls: dot ? 'sfx-ctl sfx-dot' : 'sfx-ctl' });
    el.dataset.handle = h.id; el.style.cursor = h.cursor;
    el.style.transform = `translate(${f(q.x)}px, ${f(q.y)}px)`;
    if (!dot) {
      const icon = doc.createElementNS(NS, 'svg'); icon.setAttribute('viewBox', '0 0 24 24');
      for (const d of ICON[h.id === 'turn' ? 'turn' : h.id === 'chev-l' ? 'left' : 'right']) { const pth = doc.createElementNS(NS, 'path'); pth.setAttribute('d', d); icon.appendChild(pth); }
      el.appendChild(icon);
      el.title = h.id === 'turn' ? 'Drag to turn' : 'Drag to change the size';
    } else el.title = 'Drag this corner';
    box.appendChild(el);
  }
  if (one.badge) {
    const q = loc(one.badge);
    const b = box.createDiv({ cls: 'sfx-sizebadge' });
    b.style.transform = `translate(${f(q.x)}px, ${f(q.y)}px)`;
    const v = b.createDiv({ cls: 'sfx-size', text: one.badge.text }); v.title = `${one.badge.text} ${unitLabel()}`;
    const col = b.createDiv({ cls: 'sfx-steps' });
    for (const [cls, by, t] of [['sfx-plus', 1, '+'], ['sfx-minus', -1, '−']] as const) {
      const btn = col.createEl('button', { cls, text: t }); btn.dataset.step = String(by); btn.title = by > 0 ? 'One square more' : 'One square less';
    }
    b.appendChild(col);
    box.appendChild(b);
  }
}

/** How long an instant effect lasts: its video's length, or the drawn / image time. */
export function instantMs(e: Effect): number {
  const d = e.file ? artInfo.get(e.file)?.duration : undefined;
  if (e.file && /\.(webm|mp4)$/i.test(e.file)) return d && d > 0 ? d : 4000;   // until the video says, at most 4 s
  return DRAWN_MS;
}
