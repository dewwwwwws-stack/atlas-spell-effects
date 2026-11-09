// Draws effects over a map: the DM's Atlas view and the player window each get a layer laid exactly over the
// map canvas (turned with the TV), and every effect is an element placed in it from its box in the world.
// Animations are the vault's files (video or image); without one, the add-on draws the shape itself.
import { boxOf, wallPieces, wallPoints, wallThickness, type Handle, type Point, type Box, type Effect, type Scale, type TokenAt } from './geometry';

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
}

/** What the painter needs to know of the world for an effect, now. */
export interface World {
  scale(map: string): Scale | null;
  /** A token's centre and radius (world units), or null when it is gone. */
  token(map: string, id: string): TokenAt | null;
  /** The vault file's address for a video or image element. */
  url(path: string): string | null;
}

/** What is known of an animation once loaded (shared by every surface). */
export const artInfo = new Map<string, { aspect: number; feet: number; duration: number }>();

/** How long an instant effect drawn by the add-on, or an image, stays. */
export const DRAWN_MS = 1800;
export const FADE_MS = 450;



/** One surface's elements, by effect id. */
export class Painter {
  private els = new Map<string, HTMLElement>();
  constructor(readonly surface: Surface, private readonly world: World) {}

  /** Draws `effects` as they are now (`now`, ms); `out` are ending (fading). */
  paint(effects: readonly Effect[], now: number, out: ReadonlySet<string>, preview?: Effect | null): void {
    const layer = this.surface.layer();
    const m = layer ? this.surface.mapping() : null;
    const keep = new Set<string>();
    if (layer && m) {
      const all = preview ? [...effects, preview] : effects;
      for (const e of all) {
        if (!this.surface.shows(e.map)) continue;
        const s = this.world.scale(e.map); if (!s) continue;
        const tok = e.token ? this.world.token(e.map, e.token) : null;
        if (e.token && !tok) continue;                               // its token is gone (or on another level)
        const info = e.file ? artInfo.get(e.file) : undefined;
        let el = this.els.get(e.id);
        if (!el) { const made = this.make(e, layer); if (!made) continue; el = made; this.els.set(e.id, el); }
        if (e.shape === 'wall') { if (e.file && e.id !== 'preview') this.placeWall(el, e, wallPieces(e, s, tok, true), m, s, info, wallPoints(e, tok)); else this.drawWall(el, e, s, tok, m); }
        else this.place(el, boxOf(e, s, tok, info ? { aspect: info.aspect, feet: info.feet } : null), m, s);
        el.classList.toggle('sfx-out', out.has(e.id));
        keep.add(e.id);
      }
    }
    for (const [id, el] of this.els) if (!keep.has(id)) { el.remove(); this.els.delete(id); }
    void now;
  }

  private make(e: Effect, layer: HTMLElement): HTMLElement | null {
    const doc = this.surface.doc;
    const el = doc.createElement('div');
    el.className = `sfx sfx-${e.shape} ${e.lasting ? 'sfx-lasting' : 'sfx-instant'}${e.id === 'preview' ? ' sfx-preview' : ''}`;
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
    const url = e.file && e.id !== 'preview' ? this.world.url(e.file) : null;
    if (url && e.file) {
      const file = e.file;
      const video = /\.(webm|mp4)$/i.test(file);
      const media = doc.createElement(video ? 'video' : 'img') as HTMLVideoElement | HTMLImageElement;
      const feet = Number((/(\d+)\s*ft/i.exec(file) ?? [])[1] ?? 0) || 0;
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
      if (e.shape === 'cone') {
        // a cone drawn as a triangle, its colour fading from its point to its far end
        const NS = 'http://www.w3.org/2000/svg', gid = 'sfx-g-' + Math.random().toString(36).slice(2);
        const svg = doc.createElementNS(NS, 'svg'); svg.setAttribute('class', 'sfx-drawn'); svg.setAttribute('viewBox', '0 0 100 100'); svg.setAttribute('preserveAspectRatio', 'none');
        const grad = doc.createElementNS(NS, 'linearGradient'); grad.id = gid;
        for (const [off, cls] of [['0', 'sfx-cone-near'], ['1', 'sfx-cone-far']]) { const st = doc.createElementNS(NS, 'stop'); st.setAttribute('offset', off!); st.setAttribute('class', cls!); grad.appendChild(st); }
        const defs = doc.createElementNS(NS, 'defs'); defs.appendChild(grad); svg.appendChild(defs);
        const tri = doc.createElementNS(NS, 'polygon'); tri.setAttribute('points', '0,50 100,0 100,100'); tri.setAttribute('fill', `url(#${gid})`); svg.appendChild(tri);
        el.appendChild(svg);
      } else {
        const d = doc.createElement('div'); d.className = 'sfx-drawn'; el.appendChild(d);
      }
    }
  }

  /** A wall drawn in its colour: one glowing line along its corners (no bright knots where stretches meet). */
  private drawWall(el: HTMLElement, e: Effect, s: Scale, tok: TokenAt | null, m: Mapping): void {
    const NS = 'http://www.w3.org/2000/svg';
    let svg = el.firstElementChild as SVGSVGElement | null;
    if (!svg || svg.tagName.toLowerCase() !== 'svg') {
      el.replaceChildren();
      svg = this.surface.doc.createElementNS(NS, 'svg') as SVGSVGElement;
      svg.setAttribute('class', 'sfx-drawn sfx-path');
      svg.appendChild(this.surface.doc.createElementNS(NS, 'path'));
      const core = this.surface.doc.createElementNS(NS, 'path'); core.setAttribute('class', 'sfx-core'); svg.appendChild(core);
      el.appendChild(svg);
    }
    const pts = wallPoints(e, tok).map((p) => m.toLocal(p.x, p.y));
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') + (e.closed && pts.length > 2 ? ' Z' : '');
    const [path, core] = [...svg.children] as SVGPathElement[];
    const w = wallThickness(e, s, false) * m.scale;
    path!.setAttribute('d', d); path!.style.strokeWidth = `${w}px`;
    core!.setAttribute('d', d); core!.style.strokeWidth = `${Math.max(1, w * 0.35)}px`;
    el.style.setProperty('--u', `${Math.max(4, s.cell * m.scale * 0.5)}px`);
  }

  /**
   * A wall: one piece per stretch, each laid along it. An animation repeats along a long stretch at its own
   * proportions (a 60 ft wall of fire is several flames side by side, not one stretched thin). JB2A's wall art
   * fades out at both ends, so the copies overlap (the fades blend instead of leaving gaps), and each stretch runs a
   * little past its corners, so stretches meet without a notch. A ring with ring art ("…_Ring", "…_Circle") is that
   * art, once, round the whole ring.
   */
  private placeWall(el: HTMLElement, e: Effect, pieces: Box[], m: Mapping, s: Scale, info?: { aspect: number }, pts?: Point[]): void {
    const doc = this.surface.doc;
    const ringArt = !!e.closed && !!e.file && /(ring|circle|sphere)/i.test(e.file) && !!pts && pts.length > 2;
    if (ringArt) {
      const cx = pts!.reduce((t, p) => t + p.x, 0) / pts!.length, cy = pts!.reduce((t, p) => t + p.y, 0) / pts!.length;
      const r = Math.max(...pts!.map((p) => Math.hypot(p.x - cx, p.y - cy)));
      const d = 2 * r + (pieces[0]?.h ?? 0);
      pieces = [{ cx, cy, w: d, h: d, rot: 0 }];
    }
    while (el.children.length > pieces.length) el.lastElementChild!.remove();
    const last = pieces.length - 1;
    pieces.forEach((b0, i) => {
      let piece = el.children[i] as HTMLElement | undefined;
      if (!piece) { piece = doc.createElement('div'); piece.className = 'sfx-piece'; el.appendChild(piece); }
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
      [...piece.children].forEach((k, n) => { const ks = (k as HTMLElement).style; ks.left = `${n * (1 - OVER) * len}px`; ks.width = `${len}px`; });
    });
    el.style.setProperty('--u', `${Math.max(4, s.cell * m.scale * 0.5)}px`);
  }

  private place(el: HTMLElement, b: Box, m: Mapping, s: Scale): void {
    const c = m.toLocal(b.cx, b.cy);
    const w = b.w * m.scale, h = b.h * m.scale;
    el.style.width = `${w}px`; el.style.height = `${h}px`;
    el.style.transform = `translate(${c.x - w / 2}px, ${c.y - h / 2}px) rotate(${b.rot}rad)`;
    el.style.setProperty('--u', `${Math.max(4, s.cell * m.scale * 0.5)}px`);
  }

  /** Drops an effect's element, so it is made again (another animation or colour). */
  forget(id: string): void { this.els.get(id)?.remove(); this.els.delete(id); }

  stop(): void {
    for (const el of this.els.values()) el.remove();
    this.els.clear();
  }
}

/** The frame and handles of the effect picked on the map (the DM's view only); none: taken away. */
export function paintHandles(layer: HTMLElement | null, m: Mapping | null, sel: { frame: Point[]; handles: Handle[] } | null): void {
  const doc = layer?.ownerDocument;
  let box = layer?.querySelector(':scope > .sfx-sel') as HTMLElement | null;
  if (!layer || !m || !sel || !doc) { box?.remove(); return; }
  const NS = 'http://www.w3.org/2000/svg';
  if (!box) {
    box = doc.createElement('div'); box.className = 'sfx-sel';
    const svg = doc.createElementNS(NS, 'svg'); svg.appendChild(doc.createElementNS(NS, 'polygon')); svg.appendChild(doc.createElementNS(NS, 'line'));
    box.appendChild(svg); layer.prepend(box);                  // first, but drawn over the effects
  }
  const svg = box.firstElementChild as SVGSVGElement;
  const [poly, stalk] = [...svg.children] as SVGElement[];
  const loc = (p: Point) => m.toLocal(p.x, p.y);
  poly!.setAttribute('points', sel.frame.map((p) => { const q = loc(p); return `${q.x.toFixed(1)},${q.y.toFixed(1)}`; }).join(' '));
  // a stalk from the frame to the turn handle
  const turn = sel.handles.find((h) => h.id === 'turn');
  if (turn && sel.frame.length === 4) {
    const t = loc(turn), f = sel.frame;
    const near = [0, 1, 2, 3].map((i) => { const a = f[i]!, b = f[(i + 1) % 4]!; return loc({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }); }).sort((a, b) => Math.hypot(a.x - t.x, a.y - t.y) - Math.hypot(b.x - t.x, b.y - t.y))[0]!;
    stalk!.setAttribute('x1', String(near.x)); stalk!.setAttribute('y1', String(near.y)); stalk!.setAttribute('x2', String(t.x)); stalk!.setAttribute('y2', String(t.y));
  } else stalk!.setAttribute('x1', 'NaN');
  const els = [...box.querySelectorAll(':scope > .sfx-handle')] as HTMLElement[];
  while (els.length > sel.handles.length) els.pop()!.remove();
  sel.handles.forEach((h, i) => {
    let el = els[i];
    if (!el) { el = doc.createElement('div'); el.className = 'sfx-handle'; box!.appendChild(el); }
    const q = loc(h);
    el.dataset.handle = h.id; el.style.cursor = h.cursor;
    el.style.transform = `translate(${q.x}px, ${q.y}px)`;
  });
}

/** How long an instant effect lasts: its video's length, or the drawn / image time. */
export function instantMs(e: Effect): number {
  const d = e.file ? artInfo.get(e.file)?.duration : undefined;
  if (e.file && /\.(webm|mp4)$/i.test(e.file)) return d && d > 0 ? d : 4000;   // until the video says, at most 4 s
  return DRAWN_MS;
}
