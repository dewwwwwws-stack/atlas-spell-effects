// Effects drawn inside Atlas's own map canvas (pixi), in a layer of their own just under the tokens: tokens, their
// bars, nameplates and handles always stay on top, as on any map. The players' window is a copy of this canvas,
// so effects reach the TV through it (under Atlas's fog, as the players see the map).
//
// Atlas gives add-ons no pixi of their own, so its classes are taken from what is on the map: the viewport's own
// Container, and a Sprite and Texture from a picture on it. When they can't be found, the overlay (overlay.ts)
// draws effects instead, as before.

import { boxOf, wallPieces, wallPoints, wallThickness, type Box, type Effect, type Point, type Scale, type TokenAt } from './geometry';
import { artInfo, instantMs, FADE_MS, DRAWN_MS, type World } from './overlay';
import { fitOf } from './trim';
import type { AtlasViewport } from './atlas';

/** The parts of a pixi node the add-on uses. */
interface PNode {
  x: number; y: number; rotation: number; alpha: number; visible: boolean; zIndex: number; label?: string; eventMode?: string;
  parent: PNode | null; children: PNode[]; destroyed?: boolean; sortableChildren?: boolean;
  scale: { x: number; y: number; set(x: number, y?: number): void };
  addChild(c: PNode): PNode; addChildAt?(c: PNode, i: number): PNode; removeChild(c: PNode): PNode;
  destroy(options?: { children?: boolean; texture?: boolean; textureSource?: boolean }): void;
}
interface PTexture { destroy(destroySource?: boolean): void }
interface PSprite extends PNode { texture: PTexture; anchor: { set(x: number, y?: number): void }; width: number; height: number }
interface Kit { Container: new () => PNode; Sprite: new (texture?: PTexture) => PSprite; texture(source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement): PTexture }

const kits = new WeakMap<object, Kit | null>();

/** Atlas's pixi classes, found on its map (cached per viewport); null when not found. */
export function kitOf(viewport: AtlasViewport): Kit | null {
  if (kits.has(viewport)) return kits.get(viewport) ?? null;
  let kit: Kit | null = null;
  try {
    // the viewport is a Container of pixi-viewport's: its parent class is pixi's Container
    const Container = (Object.getPrototypeOf((viewport.constructor as { prototype: object }).prototype) as { constructor: new () => PNode } | null)?.constructor;
    // a plain Sprite on the map (the map's picture, a token's): its class, and its texture's (with Texture.from)
    let found: { S: new (t?: PTexture) => PSprite; from: (s: unknown) => PTexture } | null = null;
    const look = (n: unknown, depth: number): void => {
      if (found || !n || typeof n !== 'object') return;
      const o = n as Record<string, unknown>;
      const tex = o['texture'] as { constructor?: { from?: unknown } } | undefined;
      if (o['anchor'] && tex && typeof tex.constructor?.from === 'function' && !('tilePosition' in o) && !('textures' in o) && !('text' in o)) {
        const T = tex.constructor as { from: (s: unknown) => PTexture };
        found = { S: (n as { constructor: new (t?: PTexture) => PSprite }).constructor, from: (s) => T.from(s) };
        return;
      }
      if (depth > 0) for (const c of (o['children'] as unknown[] | undefined) ?? []) look(c, depth - 1);
    };
    look(viewport, 6);
    const f = found as { S: new (t?: PTexture) => PSprite; from: (s: unknown) => PTexture } | null;
    if (Container && f && typeof new Container().addChild === 'function') kit = { Container, Sprite: f.S, texture: (s) => f.from(s) };
  } catch { kit = null; }
  // not found yet (the map still loading): asked again later
  if (kit) kits.set(viewport, kit);
  return kit;
}

/** Each animation's bytes as an address the canvas can take (read once, kept while the add-on runs). */
const blobs = new Map<string, Promise<string | null>>();
function blobUrl(read: (path: string) => Promise<ArrayBuffer | null>, path: string): Promise<string | null> {
  let p = blobs.get(path);
  if (!p) {
    const ext = (/\.([a-z0-9]+)$/i.exec(path)?.[1] ?? '').toLowerCase();
    const type = ext === 'webm' ? 'video/webm' : ext === 'mp4' ? 'video/mp4' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : ext === 'png' ? 'image/png' : 'image/jpeg';
    p = read(path).then((b) => (b ? URL.createObjectURL(new Blob([b], { type })) : null)).catch(() => null);
    blobs.set(path, p);
    void p.then((u) => { if (!u) blobs.delete(path); });
  }
  return p;
}
/** Lets go of every animation's bytes (the add-on stopping). */
export function forgetBlobs(): void { for (const p of blobs.values()) void p.then((u) => { if (u) URL.revokeObjectURL(u); }); blobs.clear(); }

/** "#rrggbb" with an alpha, for canvas. */
function rgba(hex: string | undefined, a: number): string {
  let h = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec((hex ?? '').trim())?.[1] ?? 'ff8a2a';
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** A drawn effect's picture, w × h world units (drawn at up to 1024 pixels), its colours as in the cast window. */
function drawnCanvas(e: Effect, w: number, h: number): HTMLCanvasElement {
  const k = Math.min(1, 1024 / Math.max(w, h, 1));
  const pad = Math.max(w, h) * 0.08;                            // room for the glow
  const cw = Math.max(2, Math.round((w + pad * 2) * k)), ch = Math.max(2, Math.round((h + pad * 2) * k));
  const c = createEl('canvas'); c.width = cw; c.height = ch;
  const g = c.getContext('2d'); if (!g) return c;
  const c1 = e.colour, c2 = e.colour2 ?? e.colour;
  g.translate(cw / 2, ch / 2); g.scale(k, k);
  const glow = Math.max(w, h) * 0.03;
  if (e.shape === 'radius' || e.shape === 'emanation') {
    const r = Math.min(w, h) / 2;
    const rg = g.createRadialGradient(0, 0, 0, 0, 0, r);
    rg.addColorStop(0, rgba(c1, 0.42)); rg.addColorStop(0.45, rgba(c1, 0.32)); rg.addColorStop(0.72, rgba(c2, 0.42)); rg.addColorStop(1, rgba(c2, 0.75));
    g.shadowColor = rgba(c2, 1); g.shadowBlur = glow * k * 2;
    g.fillStyle = rg; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
  } else if (e.shape === 'cube') {
    const rg = g.createRadialGradient(0, 0, 0, 0, 0, Math.max(w, h) / 2);
    rg.addColorStop(0, rgba(c1, 0.55)); rg.addColorStop(0.8, rgba(c2, 0.45)); rg.addColorStop(1, rgba(c2, 0.7));
    g.shadowColor = rgba(c2, 1); g.shadowBlur = glow * k * 2;
    g.fillStyle = rg; g.fillRect(-w / 2, -h / 2, w, h);
  } else if (e.shape === 'line') {
    const lg = g.createLinearGradient(0, -h / 2, 0, h / 2);
    lg.addColorStop(0, rgba(c2, 0.55)); lg.addColorStop(0.5, rgba(c1, 0.85)); lg.addColorStop(1, rgba(c2, 0.55));
    g.shadowColor = rgba(c2, 1); g.shadowBlur = glow * k * 2;
    g.fillStyle = lg; g.beginPath(); g.roundRect(-w / 2, -h / 2, w, h, Math.min(h / 2, w * 0.02)); g.fill();
  } else if (e.shape === 'cone') {
    // its point on the left, its far end on the right: the inner colour fading from the point, the outer on its edge
    const lg = g.createLinearGradient(-w / 2, 0, w / 2, 0);
    lg.addColorStop(0, rgba(c1, 0.8)); lg.addColorStop(0.55, rgba(c1, 0.4)); lg.addColorStop(1, rgba(c2, 0.55));
    g.beginPath(); g.moveTo(-w / 2, 0); g.lineTo(w / 2, -h / 2); g.lineTo(w / 2, h / 2); g.closePath();
    g.fillStyle = lg; g.fill();
    g.shadowColor = rgba(c2, 1); g.shadowBlur = glow * k * 1.5;
    g.strokeStyle = rgba(c2, 0.9); g.lineWidth = Math.max(2 / k, Math.max(w, h) * 0.008); g.lineJoin = 'round'; g.stroke();
  }
  return c;
}

/** A wall drawn in its colours along its corners, in a picture covering it; where that picture goes (world). */
function drawnWall(e: Effect, pts: Point[], thick: number): { canvas: HTMLCanvasElement; box: Box } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  const pad = thick * 2;
  x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
  const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0);
  const k = Math.min(1, 1600 / Math.max(w, h));
  const c = createEl('canvas'); c.width = Math.max(2, Math.round(w * k)); c.height = Math.max(2, Math.round(h * k));
  const g = c.getContext('2d');
  if (g) {
    g.scale(k, k); g.translate(-x0, -y0);
    const path = () => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); if (e.closed) g.closePath(); };
    g.lineCap = 'round'; g.lineJoin = 'round';
    path(); g.shadowColor = rgba(e.colour2 ?? e.colour, 1); g.shadowBlur = thick * k; g.strokeStyle = rgba(e.colour2 ?? e.colour, 0.7); g.lineWidth = thick; g.stroke();
    path(); g.shadowBlur = 0; g.strokeStyle = rgba(e.colour, 0.85); g.lineWidth = Math.max(1, thick * 0.35); g.stroke();
  }
  return { canvas: c, box: { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w, h, rot: 0 } };
}

/** One effect on the map: its node, and what it was made from (made again when its look changes). */
interface Item {
  node: PNode;
  look: string;
  sprites: PSprite[];
  textures: PTexture[];
  video: HTMLVideoElement | null;
  drawn: boolean;
  outAt: number | null;
}

/** The effects of one Atlas map tab, in its canvas. */
export class PixiPainter {
  private root: PNode | null = null;
  private items = new Map<string, Item>();
  private tick = 0;

  constructor(
    private readonly kit: Kit,
    private readonly viewport: AtlasViewport,
    private readonly world: World,
    /** The vault file's bytes (Atlas's canvas takes pictures from the vault as their bytes, as Atlas itself does). */
    private readonly read: (path: string) => Promise<ArrayBuffer | null>,
    /** Something new to draw (an animation loaded): the add-on's loop wakes. */
    private readonly wake: () => void,
    /** Atlas's canvas wouldn't take an animation: effects are drawn over it instead. */
    private readonly fail: (e: unknown) => void,
  ) {}

  /** A texture of an animation once loaded; on failure, effects go back to being drawn over the canvas. */
  private textureOf(it: Item, source: HTMLVideoElement | HTMLImageElement): void {
    try { it.textures.push(this.kit.texture(source)); this.wake(); } catch (e) { this.fail(e); }
  }

  /** Their layer: in the viewport, under the tokens (Atlas's tokens are at 0, the map's picture under them). */
  private layer(): PNode | null {
    const vp = this.viewport as unknown as PNode;
    if (this.root && !this.root.destroyed && this.root.parent === vp) return this.root;
    const root = new this.kit.Container();
    root.label = 'sfx-spell-effects';
    root.zIndex = -0.5;
    root.eventMode = 'none';
    // where its place in the order is: before the first of the viewport's layers from the tokens up
    const kids = vp.children ?? [];
    const at = kids.findIndex((k) => (k.zIndex ?? 0) >= 0);
    if (at >= 0 && typeof vp.addChildAt === 'function') vp.addChildAt(root, at); else vp.addChild(root);
    this.root = root;
    return root;
  }

  /** Atlas only draws its canvas when something on it changes: a new video frame is a change it can't see. */
  private nudge(): void {
    if (!this.root) return;
    this.tick = (this.tick + 1) % 2;
    this.root.x = this.tick * 0.001;
  }

  /** Whether an effect is drawn here (the others are for the overlay: the one being placed). */
  static wants(e: Effect): boolean { return e.id !== 'preview'; }

  /** Draws the effects of map `map` as they are now; `out` are ending (fading). */
  paint(effects: readonly Effect[], now: number, out: ReadonlySet<string>, map: string): void {
    const root = this.layer(); if (!root) return;
    const keep = new Set<string>();
    let animating = false;
    for (const e of effects) {
      if (e.map !== map || !PixiPainter.wants(e)) continue;
      const s = this.world.scale(e.map); if (!s) continue;
      const tok = e.token ? this.world.token(e.map, e.token) : null;
      if (e.token && !tok) continue;
      const look = [e.file ?? '', e.colour, e.colour2 ?? '', e.shape, e.closed ? 1 : 0, e.shape === 'wall' ? JSON.stringify(e.points ?? []) + (e.width ?? '') : ''].join('|');
      let it = this.items.get(e.id);
      if (it && it.look !== look) { this.drop(e.id); it = undefined; }
      if (!it) { it = this.make(e, look); this.items.set(e.id, it); root.addChild(it.node); }
      this.place(it, e, s, tok);
      // fading: in, out, and an instant effect's burst
      let a = e.alpha !== undefined && e.alpha < 1 ? Math.max(0.05, e.alpha) : 1;
      if (out.has(e.id)) { it.outAt ??= now; a *= Math.max(0, 1 - (now - it.outAt) / FADE_MS); animating = true; } else it.outAt = null;
      if (!e.lasting && it.drawn) {
        const t = Math.min(1, (now - e.started) / DRAWN_MS);
        a *= t < 0.18 ? t / 0.18 : t < 0.55 ? 1 : Math.max(0, 1 - (t - 0.55) / 0.45);
        const grow = t < 0.55 ? 0.15 + 0.85 * (t / 0.55) : 1;
        for (const sp of it.sprites) sp.scale.set(e.shape === 'cone' || e.shape === 'line' ? grow : grow, e.shape === 'cone' || e.shape === 'line' ? 1 : grow);
        animating = true;
      }
      if (Math.abs(it.node.alpha - a) > 0.002) it.node.alpha = a;
      keep.add(e.id);
    }
    for (const id of [...this.items.keys()]) if (!keep.has(id)) this.drop(id);
    if (animating) this.nudge();
    void instantMs;
  }

  private make(e: Effect, look: string): Item {
    const node = new this.kit.Container();
    node.eventMode = 'none';
    const it: Item = { node, look, sprites: [], textures: [], video: null, drawn: !e.file, outAt: null };
    if (e.file) {
      const file = e.file;
      const isVideo = /\.(webm|mp4)$/i.test(file);
      const feet = Number((/(\d+)\s*ft/i.exec(file) ?? [])[1] ?? 0) || 0;
      const learn = (w: number, h: number, ms: number) => { if (w > 0 && h > 0) artInfo.set(file, { aspect: w / h, feet, duration: ms }); };
      if (isVideo) {
        const v = createEl('video');
        v.muted = true; v.autoplay = true; v.playsInline = true; v.loop = e.lasting; v.preload = 'auto'; v.crossOrigin = 'anonymous';
        v.addEventListener('loadedmetadata', () => learn(v.videoWidth, v.videoHeight, v.duration * 1000));
        v.addEventListener('loadeddata', () => { if (it.video === v && !it.textures.length) this.textureOf(it, v); }, { once: true });
        void blobUrl(this.read, file).then((u) => { if (u && it.video === v) { v.src = u; void v.play().catch(() => undefined); } });
        // each new frame: Atlas draws its canvas again
        const frames = (v as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number }).requestVideoFrameCallback?.bind(v);
        const onFrame = () => { if (!it.video) return; this.nudge(); if (frames) frames(onFrame); };
        if (frames) frames(onFrame); else v.addEventListener('timeupdate', () => this.nudge());
        it.video = v;
      } else {
        const im = createEl('img');
        im.addEventListener('load', () => { learn(im.naturalWidth, im.naturalHeight, 0); if (this.items.get(e.id) === it && !it.textures.length) this.textureOf(it, im); });
        void blobUrl(this.read, file).then((u) => { if (u) im.src = u; });
      }
    }
    return it;
  }

  /** Where an effect's sprites go: its box, its art fitted (a wall's copies along it). */
  private place(it: Item, e: Effect, s: Scale, tok: TokenAt | null): void {
    const info = e.file ? artInfo.get(e.file) : undefined;
    const tex = it.textures[0];
    if (e.file && !tex) return;                                     // its animation still loading
    if (e.shape === 'wall') {
      if (tex && e.file) this.placeWallArt(it, e, s, tok, tex, info);
      else this.placeDrawnWall(it, e, s, tok);
      return;
    }
    const b = boxOf(e, s, tok, info ? { aspect: info.aspect, feet: info.feet } : null);
    it.node.x = b.cx; it.node.y = b.cy; it.node.rotation = b.rot;
    if (!tex) {
      // drawn: made at its size (again when the size changes)
      const key = `${Math.round(b.w)}x${Math.round(b.h)}`;
      const sp0 = it.sprites[0] as (PSprite & { sfxKey?: string }) | undefined;
      if (!sp0 || sp0.sfxKey !== key) {
        for (const sp of it.sprites) { it.node.removeChild(sp); sp.destroy({ texture: true, textureSource: true }); }
        const canvas = drawnCanvas(e, b.w, b.h);
        const sp = new this.kit.Sprite(this.kit.texture(canvas)) as PSprite & { sfxKey?: string };
        sp.anchor.set(0.5); sp.sfxKey = key;
        // the picture has room round it for the glow: the shape itself is the box
        const padK = Math.max(b.w, b.h) * 0.08;
        sp.width = b.w + padK * 2; sp.height = b.h + padK * 2;
        it.node.addChild(sp); it.sprites = [sp];
      }
      return;
    }
    if (!it.sprites.length) { const sp = new this.kit.Sprite(tex); sp.anchor.set(0.5); it.node.addChild(sp); it.sprites = [sp]; }
    const sp = it.sprites[0];
    if (!sp) return;
    // art with room round its picture: the picture fills the area (a cone to its full length)
    const fo = (e.shape === 'cone' || e.shape === 'line') ? fitOf(this.world.trim(e.file ?? ''), e.shape) : null;
    if (fo) {
      sp.width = b.w * fo.w / 100; sp.height = b.h * fo.h / 100;
      sp.x = (fo.l + fo.w / 2) / 100 * b.w - b.w / 2; sp.y = (fo.t + fo.h / 2) / 100 * b.h - b.h / 2;
    } else { sp.width = b.w; sp.height = b.h; sp.x = 0; sp.y = 0; }
  }

  /** A wall's art: copies along each stretch, overlapping (a ring's art once round it). */
  private placeWallArt(it: Item, e: Effect, s: Scale, tok: TokenAt | null, tex: PTexture, info?: { aspect: number }): void {
    let pieces = wallPieces(e, s, tok, true);
    const pts = wallPoints(e, tok);
    const ringArt = !!e.closed && /(ring|circle|sphere)/i.test(e.file ?? '') && pts.length > 2;
    if (ringArt) {
      const cx = pts.reduce((t, p) => t + p.x, 0) / pts.length, cy = pts.reduce((t, p) => t + p.y, 0) / pts.length;
      const r = Math.max(...pts.map((p) => Math.hypot(p.x - cx, p.y - cy)));
      const d = 2 * r + (pieces[0]?.h ?? 0);
      pieces = [{ cx, cy, w: d, h: d, rot: 0 }];
    }
    const OVER = 0.18;
    const want: { cx: number; cy: number; w: number; h: number; rot: number }[] = [];
    const last = pieces.length - 1;
    pieces.forEach((b0, i) => {
      let b = b0;
      if (!ringArt) {
        const ext = b.h * 0.15;
        const es = i > 0 || e.closed ? ext : 0, ee = i < last || e.closed ? ext : 0;
        const c = Math.cos(b.rot), si = Math.sin(b.rot), shift = (ee - es) / 2;
        b = { cx: b.cx + c * shift, cy: b.cy + si * shift, w: b.w + es + ee, h: b.h, rot: b.rot };
      }
      const tile = info && info.aspect > 0 ? b.h * info.aspect : b.w;
      const n = ringArt || !(info && info.aspect > 0) ? 1 : Math.max(1, Math.round((b.w - OVER * tile) / ((1 - OVER) * tile)));
      const len = n > 1 ? b.w / (n - (n - 1) * OVER) : b.w;
      const c = Math.cos(b.rot), si = Math.sin(b.rot);
      for (let k = 0; k < n; k++) {
        const along = -b.w / 2 + len / 2 + k * (1 - OVER) * len;
        want.push({ cx: b.cx + c * along, cy: b.cy + si * along, w: len, h: b.h, rot: b.rot });
      }
    });
    while (it.sprites.length < want.length) { const sp = new this.kit.Sprite(tex); sp.anchor.set(0.5); it.node.addChild(sp); it.sprites.push(sp); }
    while (it.sprites.length > want.length) { const sp = it.sprites.pop(); if (sp) { it.node.removeChild(sp); sp.destroy(); } }
    it.node.x = 0; it.node.y = 0; it.node.rotation = 0;
    want.forEach((w, i) => { const sp = it.sprites[i]; if (!sp) return; sp.x = w.cx; sp.y = w.cy; sp.rotation = w.rot; sp.width = w.w; sp.height = w.h; });
  }

  /** A wall drawn in its colours: one picture of the whole wall (made again when it changes). */
  private placeDrawnWall(it: Item, e: Effect, s: Scale, tok: TokenAt | null): void {
    const pts = wallPoints(e, tok);
    const thick = wallThickness(e, s, false);
    const key = JSON.stringify(pts.map((p) => [Math.round(p.x), Math.round(p.y)])) + thick.toFixed(1);
    const sp0 = it.sprites[0] as (PSprite & { sfxKey?: string }) | undefined;
    if (sp0 && sp0.sfxKey === key) return;
    for (const sp of it.sprites) { it.node.removeChild(sp); sp.destroy({ texture: true, textureSource: true }); }
    const { canvas, box } = drawnWall(e, pts, thick);
    const sp = new this.kit.Sprite(this.kit.texture(canvas)) as PSprite & { sfxKey?: string };
    sp.anchor.set(0.5); sp.sfxKey = key;
    sp.x = box.cx; sp.y = box.cy; sp.width = box.w; sp.height = box.h;
    it.node.x = 0; it.node.y = 0; it.node.rotation = 0;
    it.node.addChild(sp); it.sprites = [sp];
  }

  /** Drops an effect (made again when next painted). */
  drop(id: string): void {
    const it = this.items.get(id); if (!it) return;
    this.items.delete(id);
    if (it.video) { const v = it.video; it.video = null; v.pause(); v.removeAttribute('src'); v.load(); }
    const drawn = it.drawn || !it.textures.length;
    it.node.parent?.removeChild(it.node);
    it.node.destroy({ children: true, texture: drawn, textureSource: drawn });
    for (const t of it.textures) t.destroy(true);
  }

  /** Everything off the map. */
  stop(): void {
    for (const id of [...this.items.keys()]) this.drop(id);
    if (this.root) { this.root.parent?.removeChild(this.root); this.root.destroy({ children: true }); this.root = null; }
  }
}
