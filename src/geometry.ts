// Where an effect sits on the map, in world units (Atlas's map pixels): a box (centre, width, height, turn).
import type { Shape, WallBlocks } from './areas';

export interface Point { x: number; y: number }

/** One effect on a map. */
export interface Effect {
  id: string;
  /** The map file it is on (Atlas's `mapPath`). */
  map: string;
  /** The spell's name, or the effect's. */
  name: string;
  shape: Shape;
  /** Feet: radius (radius, emanation), side (cube), length (cone, line). */
  size: number;
  /** Line width, feet; a wall's thickness. */
  width?: number;
  /** A cone's angle at its point, degrees (missing: 53.13°, as wide at its end as it is long). */
  angle?: number;
  /** A wall's corners, from `at` (world units; in the token's own turn when it turns with one). */
  points?: Point[];
  /** The wall closes back on itself (a ring). */
  closed?: boolean;
  /** What its real Atlas walls stop ('none' or missing: drawn only). */
  blocks?: WallBlocks;
  /** Those Atlas walls' ids on the map. */
  wallIds?: string[];
  /** On a creature (Shield, Bless): drawn round its token and over it, not under it. */
  on?: boolean;
  /** Drawn as its edge only, dashed, over a faint fill (the players' view of where the DM is aiming). */
  outline?: boolean;
  /** Centre (radius / cube at a point) or origin (cone, line, cube from the caster). */
  at: Point;
  /** Direction from the origin (radians), for cones, lines and cubes from the caster. */
  dir?: number;
  /** A token it follows (emanations, areas around the caster, a beholder's eye). */
  token?: string;
  /** Where it sits from that token's centre (world units; in the token's own turn when `turn`). */
  offset?: Point;
  /** Turns with the token: `dir` and `offset` are then measured from the token's rotation. */
  turn?: boolean;
  /** The light it gives off, or the magical darkness it spreads (lasting effects): a real Atlas light. */
  light?: import('./lights').EffectLight;
  /** That Atlas light's id on the map (older versions: one light). */
  lightId?: string;
  /** Its Atlas lights' ids on the map (a wall has one per stretch). */
  lightIds?: string[];
  /** Turn of a sphere, an aura or a cube at a point (radians): its animation turned. */
  spin?: number;
  /** The animation file (vault path); none: drawn by the add-on in `colour`. */
  file?: string;
  /** Drawn: the colour at its heart (and the whole of it, without `colour2`). */
  colour: string;
  /** Drawn: the colour at its edge. */
  colour2?: string;
  /** Drawn: how see-through (0.1–1; 1 or missing: as drawn). */
  alpha?: number;
  lasting: boolean;
  /** When it was cast (ms). */
  started: number;
  /** The conditions it gives the creatures inside it (names, as the collection's conditions are called). */
  conditions?: string[];
  /** The creature it comes from (a cone, a line, an aura): never caught in its own spell. */
  caster?: string;
  /** A bolt shot at one creature (Fire Bolt): no one is caught in it. */
  bolt?: boolean;
  /** The initiative round it has been counted from (the round it was cast in, or the fight's first). */
  round?: number;
  /** Its area among Atlas's own (a kept measurement's id): Atlas draws, lights and counts it. */
  measure?: string;
  /** Atlas's look for that area (fire, frost, lightning, mist, radiance, shadow); none: the plain wash. */
  look?: string;
  /** How it's drawn where Atlas keeps areas: `area` Atlas's area only (no animation), `animation` the add-on's only (no area); missing: both. */
  draw?: 'area' | 'animation';
  /** Its Atlas area's light: `atlas` the one Atlas gives its look, `none`; missing: the spell's own. */
  areaLight?: 'atlas' | 'none';
  /** Its Atlas area goes through walls (they stop it otherwise). */
  throughWalls?: boolean;
  /** Its Atlas area is the GM's alone (players see it otherwise). */
  hidden?: boolean;
  /** Its Atlas area's colour, given in Atlas (else its look's own). */
  areaColour?: string;
  /** A cone that ends in an arc (as Atlas draws cones unless the game's rules make them flat). */
  coneRound?: boolean;
}

/** The usual cone (5e's): as wide at its end as it is long. */
export const CONE_ANGLE = 53.13;
/** A cone's width at its far end, from its length and its angle (degrees). */
export const coneWidth = (len: number, angle?: number): number => 2 * len * Math.tan(((Math.min(170, Math.max(1, angle ?? CONE_ANGLE)) / 2) * Math.PI) / 180);

export interface Box { cx: number; cy: number; w: number; h: number; rot: number }

const halfAngle = (angle?: number): number => ((Math.min(170, Math.max(1, angle ?? CONE_ANGLE)) / 2) * Math.PI) / 180;
/** A round-ended cone's width (its arc's ends), from its length and angle. */
export const roundConeWidth = (len: number, angle?: number): number => 2 * len * Math.sin(halfAngle(angle));
/**
 * A cone's outline in its box's own frame (the box's middle at 0,0, its point at -w/2,0, pointing along +x): a
 * triangle, or (round) its point and an arc as far from it as it is long, as Atlas draws a cone.
 */
export function coneLocal(e: Pick<Effect, 'angle' | 'coneRound'>, w: number, h: number, n = 24): Point[] {
  if (!e.coneRound) return [{ x: -w / 2, y: 0 }, { x: w / 2, y: -h / 2 }, { x: w / 2, y: h / 2 }];
  const half = halfAngle(e.angle);
  const pts: Point[] = [{ x: -w / 2, y: 0 }];
  for (let i = 0; i <= n; i++) { const a = -half + (2 * half * i) / n; pts.push({ x: -w / 2 + w * Math.cos(a), y: w * Math.sin(a) * (h / 2) / Math.max(1e-9, w * Math.sin(half)) }); }
  return pts;
}
/** The same outline as percentages of its box (for SVG polygons and clip paths). */
export const conePercent = (e: Pick<Effect, 'angle' | 'coneRound'>, pad = 0): Point[] => coneLocal(e, 1, 1).map((p) => ({ x: (p.x + 0.5) * 100, y: 50 + p.y * (100 + 2 * pad) }));

/** What the map says about sizes: the grid's cell in world units and how many feet one cell is. */
export interface Scale { cell: number; feetPerCell: number }

export const pxPerFoot = (s: Scale): number => (s.cell > 0 ? s.cell : 70) / (s.feetPerCell > 0 ? s.feetPerCell : 5);

/**
 * The effect's box in the world. `tokenAt` is the followed token's centre and radius (world units) now;
 * `art` is the animation's own shape where it has one: its width / height, and for a line the feet it was made
 * for (JB2A's "60ft" rays), so a longer line stretches it but keeps its thickness.
 */
export interface TokenAt { /** Its id in Atlas. */ id?: string; x: number; y: number; r: number; /** The token's rotation, radians (Atlas: degrees, clockwise). */ rot?: number; /** Picked in Atlas (its handles are showing). */ sel?: boolean; /** Off the map (Atlas keeps it aside). */ off?: boolean }

const turnBy = (p: Point, a: number): Point => ({ x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) });

/** Where the effect is and which way it points now: its own place, or its token's place, offset and turn. */
export function placeOf(e: Effect, tokenAt?: TokenAt | null): { at: Point; dir: number | undefined } {
  if (!e.token || !tokenAt) return { at: e.at, dir: e.dir };
  const rot = e.turn ? tokenAt.rot ?? 0 : 0;
  const off = e.offset ? turnBy(e.offset, rot) : { x: 0, y: 0 };
  return { at: { x: tokenAt.x + off.x, y: tokenAt.y + off.y }, dir: e.dir === undefined ? undefined : e.dir + rot };
}

/** Fixes an effect to a token where it is now (it keeps its place and direction); `turn`: it turns with the token. */
export function attachTo(e: Effect, tokenId: string, tokenAt: TokenAt, turn: boolean, current?: TokenAt | null): void {
  const now = placeOf(e, current ?? null);
  const rot = turn ? tokenAt.rot ?? 0 : 0;
  // a wall's corners: from the world's turn into the token's
  const was = e.token && e.turn ? current?.rot ?? 0 : 0;
  if (e.points) e.points = e.points.map((p) => turnBy(p, was - rot));
  const off = turnBy({ x: now.at.x - tokenAt.x, y: now.at.y - tokenAt.y }, -rot);
  e.token = tokenId;
  e.turn = turn || undefined;
  if (!e.turn) delete e.turn;
  if (Math.hypot(off.x, off.y) > 0.5) e.offset = off; else delete e.offset;
  if (now.dir !== undefined) e.dir = now.dir - rot;
  e.at = now.at;
}

/** Frees an effect from its token, where it is now. */
export function detach(e: Effect, tokenAt: TokenAt | null): void {
  const now = placeOf(e, tokenAt);
  if (e.points && e.token && e.turn) e.points = e.points.map((p) => turnBy(p, tokenAt?.rot ?? 0));
  e.at = now.at;
  if (now.dir !== undefined) e.dir = now.dir;
  delete e.token; delete e.offset; delete e.turn;
}

/** An effect on a creature: drawn round its token and over it (an aura that would otherwise hide under it). */
export const onCreature = (e: Effect): boolean => !!e.token && e.shape === 'emanation' && (!!e.on || !(e.size > 0));

export function boxOf(e: Effect, s: Scale, tokenAt?: TokenAt | null, art?: { aspect: number; feet: number } | null): Box {
  const ppf = pxPerFoot(s);
  const place = placeOf(e, tokenAt);
  const at = place.at;
  const dir = place.dir ?? 0;
  const spin = (e.spin ?? 0) + (e.token && e.turn ? tokenAt?.rot ?? 0 : 0);
  switch (e.shape) {
    case 'radius': {
      const d = 2 * e.size * ppf;
      return { cx: at.x, cy: at.y, w: d, h: d, rot: spin };
    }
    case 'emanation': {
      // "extends N feet from the creature in every direction": from the token's edge (an effect on a creature
      // reaches a little past it, so it shows round it)
      const r = tokenAt?.r ?? s.cell / 2;
      const d = 2 * (onCreature(e) ? r + Math.max(e.size * ppf, r * 0.3) : e.size * ppf + r);
      return { cx: at.x, cy: at.y, w: d, h: d, rot: spin };
    }
    case 'cube': {
      const side = e.size * ppf;
      if (e.dir === undefined) return { cx: at.x, cy: at.y, w: side, h: side, rot: spin };
      // from the caster: the cube's near face touches the caster's edge, straight ahead
      const r = tokenAt?.r ?? s.cell / 2;
      const off = r + side / 2;
      return { cx: at.x + Math.cos(dir) * off, cy: at.y + Math.sin(dir) * off, w: side, h: side, rot: dir };
    }
    case 'cone': {
      // the cone's point at the origin, as wide at its end as its angle makes it
      const len = e.size * ppf;
      return { cx: at.x + Math.cos(dir) * len / 2, cy: at.y + Math.sin(dir) * len / 2, w: len, h: e.coneRound ? roundConeWidth(len, e.angle) : coneWidth(len, e.angle), rot: dir };
    }
    case 'wall': {
      // all of it: its corners and its thickness
      const pts = wallPoints(e, tokenAt);
      const pad = wallThickness(e, s, !!art) / 2;
      const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
      const x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad, y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad;
      return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0, rot: 0 };
    }
    case 'line': {
      const len = e.size * ppf;
      let h = (e.width ?? s.feetPerCell) * ppf;
      if (art && art.aspect > 0) {
        // art made for N feet: its height in feet stays (a 60 ft ray stretched to 100 ft is as thick as before)
        const madeFor = art.feet > 0 ? art.feet : e.size;
        h = (madeFor / art.aspect) * ppf;
      }
      return { cx: at.x + Math.cos(dir) * len / 2, cy: at.y + Math.sin(dir) * len / 2, w: len, h, rot: dir };
    }
  }
}

// ── walls: a path of corners (or a ring), each stretch drawn as its own piece ──

/** A wall's corners in the world now. */
export function wallPoints(e: Effect, tokenAt?: TokenAt | null): Point[] {
  const at = placeOf(e, tokenAt).at;
  const rot = e.token && e.turn ? tokenAt?.rot ?? 0 : 0;
  return (e.points?.length ? e.points : [{ x: 0, y: 0 }]).map((p) => { const q = turnBy(p, rot); return { x: at.x + q.x, y: at.y + q.y }; });
}

/** How thick a wall is drawn (world units): its own thickness, but never too thin to see or grab. */
export function wallThickness(e: Pick<Effect, 'width'>, s: Scale, art: boolean): number {
  return Math.max(e.width ?? s.feetPerCell / 5, art ? s.feetPerCell : s.feetPerCell / 2) * pxPerFoot(s);
}

/** A wall's stretches as boxes (centre, length, thickness, turn). */
export function wallPieces(e: Effect, s: Scale, tokenAt?: TokenAt | null, art = false): Box[] {
  const pts = wallPoints(e, tokenAt);
  const th = wallThickness(e, s, art);
  const out: Box[] = [];
  const n = e.closed && pts.length > 2 ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 0.5) continue;
    out.push({ cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, w: len, h: th, rot: Math.atan2(b.y - a.y, b.x - a.x) });
  }
  return out;
}

/** The corners of a ring wall `diameter` feet across, around (0, 0): as round as a wall of straight pieces gets. */
export function ringPoints(diameter: number, s: Scale, n = 16): Point[] {
  const r = (diameter / 2) * pxPerFoot(s);
  return Array.from({ length: n }, (_, i) => ({ x: r * Math.cos((i / n) * 2 * Math.PI), y: r * Math.sin((i / n) * 2 * Math.PI) }));
}

/** A path's length (world units). */
export const pathLength = (pts: readonly Point[]): number => pts.slice(1).reduce((t, p, i) => t + Math.hypot(p.x - pts[i].x, p.y - pts[i].y), 0);

/** `next` cut short so the path from `pts` stays within `max` world units. */
export function within(pts: readonly Point[], next: Point, max: number): Point {
  const last = pts[pts.length - 1]; if (!last) return next;
  const left = max - pathLength(pts);
  const d = Math.hypot(next.x - last.x, next.y - last.y);
  if (d <= left || d === 0) return next;
  const k = Math.max(0, left) / d;
  return { x: last.x + (next.x - last.x) * k, y: last.y + (next.y - last.y) * k };
}

// ── handles: an effect picked on the map gets a frame with handles to stretch, turn and reshape it ──

export interface Handle { id: string; x: number; y: number; cursor: string }

/** Whether it turns about its origin (a cone, a line, a cube from the caster) rather than spinning about its middle. */
export const aims = (e: Pick<Effect, 'shape' | 'dir'>): boolean => e.dir !== undefined && (e.shape === 'cone' || e.shape === 'line' || e.shape === 'cube');

/** What the picked effect shows (Atlas's look for a picked token): its outline, its controls, a size badge. */
export interface Controls {
  outline: { circle?: { cx: number; cy: number; r: number }; poly?: Point[]; closed?: boolean };
  handles: Handle[];
  /** The size badge (feet), with − and + beside it. */
  badge?: { x: number; y: number; text: string };
}

/**
 * The outline and controls of a picked effect, in world units; `px` is one screen pixel in world units, so the
 * controls keep their size and distance on screen at any zoom. Spheres, auras and cubes: a rotate disc above,
 * ‹ › on either side to drag the size, the size badge beside. Cones, lines (aimed ones): › at the far end for the
 * length, the rotate disc past it. Walls: a dot on each corner.
 */
export function controlsOf(e: Effect, s: Scale, tokenAt: TokenAt | null, b: Box, px: number): Controls {
  const c = Math.cos(b.rot), si = Math.sin(b.rot);
  const at = (lx: number, ly: number): Point => ({ x: b.cx + lx * c - ly * si, y: b.cy + lx * si + ly * c });
  const hw = b.w / 2, hh = b.h / 2;
  const h: Handle[] = [];
  const put = (id: string, p: Point, cursor: string) => h.push({ id, x: p.x, y: p.y, cursor });
  const size = (n: number) => `${Math.round(n * 10) / 10}`;
  if (e.shape === 'wall') {
    const pts = wallPoints(e, tokenAt);
    pts.forEach((p, i) => put('p' + i, p, 'move'));
    return { outline: { poly: pts, closed: !!e.closed }, handles: h };
  }
  if (e.shape === 'radius' || e.shape === 'emanation') {
    const r = hw;
    put('turn', { x: b.cx, y: b.cy - r - 24 * px }, 'grab');
    put('chev-l', { x: b.cx - r - 14 * px, y: b.cy }, 'ew-resize');
    put('chev-r', { x: b.cx + r + 14 * px, y: b.cy }, 'ew-resize');
    return { outline: { circle: { cx: b.cx, cy: b.cy, r } }, handles: h, badge: { x: b.cx + r + 50 * px, y: b.cy, text: size(e.size) } };
  }
  if (aims(e)) {
    const poly = e.shape === 'cone' ? coneLocal(e, b.w, b.h).map((q) => at(q.x, q.y)) : [at(-hw, -hh), at(hw, -hh), at(hw, hh), at(-hw, hh)];
    put('len', at(hw + 14 * px, 0), 'ew-resize');
    put('turn', at(hw + 46 * px, 0), 'grab');
    const side = at(hw + 14 * px, hh + 30 * px);
    return { outline: { poly, closed: true }, handles: h, badge: { x: side.x, y: side.y, text: size(e.size) } };
  }
  // a cube at a point
  const poly = [at(-hw, -hh), at(hw, -hh), at(hw, hh), at(-hw, hh)];
  const xs = poly.map((p) => p.x), ys = poly.map((p) => p.y);
  const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys);
  put('turn', { x: b.cx, y: top - 24 * px }, 'grab');
  put('chev-l', { x: left - 14 * px, y: b.cy }, 'ew-resize');
  put('chev-r', { x: right + 14 * px, y: b.cy }, 'ew-resize');
  void s;
  return { outline: { poly, closed: true }, handles: h, badge: { x: right + 50 * px, y: b.cy, text: size(e.size) } };
}

/** The size badge's − and +: `by` squares less or more, `step` game units each (never under one square; an aura on a creature: from 0). */
export function stepSize(e: Effect, by: number, step = 5): void {
  const min = e.shape === 'emanation' ? 0 : step;
  e.size = Math.max(min, Math.round((e.size + by * step) / step) * step);
}

/**
 * A handle dragged to world point `p`: the effect changes (size, length, width, turn, a wall's corner).
 * `snap`: sizes in steps of one square, turns in 15° steps, wall corners on grid corners (`corner`).
 */
export function dragHandle(e: Effect, id: string, p: Point, s: Scale, tokenAt: TokenAt | null, b: Box, snap: boolean, corner: (p: Point) => Point, px = 0): void {
  const ppf = pxPerFoot(s);
  const sq = s.feetPerCell > 0 ? s.feetPerCell : 5;
  const feet = (px: number) => { const f = px / ppf; return Math.max(snap ? sq : sq / 5, snap ? Math.round(f / sq) * sq : Math.round(f * 10 / sq) * sq / 10); };
  const turnStep = (a: number) => (snap ? Math.round(a / (Math.PI / 12)) * (Math.PI / 12) : a);
  const tokRot = e.token && e.turn ? tokenAt?.rot ?? 0 : 0;
  const place = placeOf(e, tokenAt);
  // the pointer in the frame's own turn, from its middle
  const dx = p.x - b.cx, dy = p.y - b.cy, c = Math.cos(-b.rot), si = Math.sin(-b.rot);
  const lx = dx * c - dy * si, ly = dx * si + dy * c;
  if (id.startsWith('p') && e.shape === 'wall') {
    const i = Number(id.slice(1));
    const pts = wallPoints(e, tokenAt);
    if (!pts[i]) return;
    pts[i] = snap ? corner(p) : p;
    e.points = pts.map((q) => turnBy({ x: q.x - place.at.x, y: q.y - place.at.y }, -tokRot));
    if (e.closed) delete e.closed;                                // a ring reshaped is a wall of its own shape
    return;
  }
  if (id === 'turn') {
    // aimed ones turn about their origin (the handle sits past their far end); the rest spin about their middle
    if (aims(e)) e.dir = turnStep(dirTo(place.at, p)) - tokRot;
    else e.spin = turnStep(Math.atan2(p.y - b.cy, p.x - b.cx) + Math.PI / 2) - tokRot;
    return;
  }
  if (id === 'far' && aims(e)) {
    const r = e.shape === 'cube' ? tokenAt?.r ?? s.cell / 2 : 0;
    e.size = feet(Math.hypot(p.x - place.at.x, p.y - place.at.y) - r);
    e.dir = turnStep(dirTo(place.at, p)) - tokRot;
    return;
  }
  if ((id === 'n' || id === 's') && e.shape === 'line') { e.width = feet(2 * Math.abs(ly)); return; }
  // ‹ ›: the size, from how far the pointer is from the middle (less the chevron's own distance from the edge)
  if (id === 'chev-l' || id === 'chev-r') {
    const half = Math.abs(p.x - b.cx) - 14 * px;
    if (e.shape === 'cube') e.size = feet(2 * half);
    else if (e.shape === 'emanation') { const f = (half - (tokenAt?.r ?? s.cell / 2)) / ppf; e.size = Math.max(0, snap ? Math.round(f / sq) * sq : Math.round(f * 10 / sq) * sq / 10); }
    else e.size = feet(half);
    return;
  }
  // › at the far end of a cone or line: its length, along the way it points
  if (id === 'len' && aims(e)) {
    const d = place.dir ?? 0;
    const along = (p.x - place.at.x) * Math.cos(d) + (p.y - place.at.y) * Math.sin(d) - 14 * px;
    const r = e.shape === 'cube' ? tokenAt?.r ?? s.cell / 2 : 0;
    e.size = feet(along - r);
    return;
  }
  // a sphere, an aura or a cube: stretched from its middle
  const half = id.length === 2 ? Math.max(Math.abs(lx), Math.abs(ly)) : id === 'n' || id === 's' ? Math.abs(ly) : Math.abs(lx);
  if (e.shape === 'cube') e.size = feet(2 * half);
  else if (e.shape === 'emanation') e.size = feet(half - (tokenAt?.r ?? s.cell / 2));
  else e.size = feet(half);
}

/** The direction from a to b (radians). */
export const dirTo = (a: Point, b: Point): number => Math.atan2(b.y - a.y, b.x - a.x);

/** The nearest grid corner to a point (spheres and cubes are centred on corners in 5e), or the point without a grid. */
export function snapCorner(p: Point, cell: number, offset: Point = { x: 0, y: 0 }): Point {
  if (!(cell > 0)) return p;
  return { x: Math.round((p.x - offset.x) / cell) * cell + offset.x, y: Math.round((p.y - offset.y) / cell) * cell + offset.y };
}

/** Whether the world point `p` is inside the effect's shape (its box `b`): circle, square, cone or line. */
export function hitEffect(e: Pick<Effect, 'shape' | 'angle' | 'coneRound'>, b: Box, p: Point, pieces?: readonly Box[]): boolean {
  if (e.shape === 'wall' && pieces) return pieces.some((q) => hitEffect({ shape: 'line' }, q, p));
  const dx = p.x - b.cx, dy = p.y - b.cy;
  const c = Math.cos(-b.rot), s = Math.sin(-b.rot);
  const lx = dx * c - dy * s, ly = dx * s + dy * c;            // in the box's own frame
  switch (e.shape) {
    case 'radius':
    case 'emanation':
      return Math.hypot(dx, dy) <= b.w / 2;
    case 'cone': {
      if (e.coneRound) { const ax = lx + b.w / 2; return Math.hypot(ax, ly) <= b.w && Math.abs(Math.atan2(ly, ax)) <= halfAngle(e.angle); }
      if (lx < -b.w / 2 || lx > b.w / 2) return false;
      const along = (lx + b.w / 2) / b.w;                         // 0 at the point, 1 at the far end
      return Math.abs(ly) <= along * b.h / 2;
    }
    default:
      return Math.abs(lx) <= b.w / 2 && Math.abs(ly) <= b.h / 2;
  }
}
