// Where an animation's picture really is in its frame. Much art (JB2A's cones and rays among it) leaves empty,
// see-through room around what it shows, so stretched frame-to-area the effect stops short of where it should
// reach. A few frames are looked at once, the part that is ever visible is kept, and that part is what is
// fitted to the area from then on.

/**
 * The visible part of a frame, as fractions of its width and height: left, right, top, bottom; and (measured since
 * 1.8.4) how far from the frame's middle the body of the picture reaches at its biggest, as a fraction of half its
 * shorter side (a burst's edge, not its stray sparks).
 */
export type Trim = [number, number, number, number] | [number, number, number, number, number];
/** Whether a trim was measured with its reach (older ones weren't). */
export const hasReach = (t: Trim | null | undefined): boolean => !!t && t.length > 4;

const SIDE = 160;           // the frames are looked at this big (their longer side)
const SOLID = 40;           // of 255: less see-through than this counts as picture

/** The visible part of `data` (an image or a video file's bytes); null when it can't be read. */
export async function measureArt(data: ArrayBuffer, path: string): Promise<Trim | null> {
  const ext = (/\.([a-z0-9]+)$/i.exec(path)?.[1] ?? '').toLowerCase();
  const type = ext === 'webm' ? 'video/webm' : ext === 'mp4' ? 'video/mp4' : ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : '';
  if (!type) return null;
  const url = URL.createObjectURL(new Blob([data], { type }));
  try {
    const canvas = createEl('canvas');
    const g = canvas.getContext('2d', { willReadFrequently: true });
    if (!g) return null;
    let box: [number, number, number, number] | null = null;
    let reach = 0;
    const look = (src: CanvasImageSource, w: number, h: number) => {
      const k = SIDE / Math.max(w, h);
      const cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
      canvas.width = cw; canvas.height = ch;
      g.clearRect(0, 0, cw, ch); g.drawImage(src, 0, 0, cw, ch);
      const px = g.getImageData(0, 0, cw, ch).data;
      let x0 = cw, x1 = -1, y0 = ch, y1 = -1;
      const half = Math.min(cw, ch) / 2, dists: number[] = [];
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
        if (px[(y * cw + x) * 4 + 3] > SOLID) {
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
          dists.push(Math.hypot(x + 0.5 - cw / 2, y + 0.5 - ch / 2) / half);
        }
      }
      if (x1 < 0) return;
      // the body of the picture: as far out as nearly all of it (stray sparks beyond don't count)
      if (dists.length > 20) { dists.sort((a, b) => a - b); reach = Math.max(reach, dists[Math.floor(dists.length * 0.97)] ?? 0); }
      const t: Trim = [x0 / cw, (x1 + 1) / cw, y0 / ch, (y1 + 1) / ch];
      box = box ? [Math.min(box[0], t[0]), Math.max(box[1], t[1]), Math.min(box[2], t[2]), Math.max(box[3], t[3])] : t;
    };
    if (type.startsWith('video/')) {
      const v = createEl('video');
      v.muted = true; v.preload = 'auto'; v.src = url;
      await within(new Promise<void>((ok, no) => { v.onloadeddata = () => ok(); v.onerror = () => no(new Error('unreadable')); }), 8000);
      const d = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 1;
      // frames through the whole animation: a ray grows, a cone sweeps; the picture is everywhere it ever is
      for (let i = 0; i < 9; i++) {
        const at = d * (0.04 + (0.92 * i) / 8);
        await within(new Promise<void>((ok) => { v.onseeked = () => ok(); v.currentTime = at; }), 4000);
        look(v, v.videoWidth, v.videoHeight);
      }
      v.removeAttribute('src'); v.load();
    } else {
      const im = createEl('img');
      im.src = url;
      await within(im.decode(), 8000);
      look(im, im.naturalWidth, im.naturalHeight);
    }
    return box ? [box[0], box[1], box[2], box[3], Math.round(reach * 1000) / 1000] : null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const within = <T>(p: Promise<T>, ms: number): Promise<T> => Promise.race([p, new Promise<T>((_, no) => window.setTimeout(() => no(new Error('slow')), ms))]);

/**
 * JB2A's rays and bolts ("…_30ft_1600x400"): drawn on a grid of 200 px to a 5-ft square, the shot starting 200 px
 * in from the frame's left and ending 200 px from its right (a ray, its impact past the target's middle) or at the
 * right edge. Where it starts (px from the left) and how long it is (px), or null for other art.
 */
export function rangedLayout(w: number, ft: number): { start: number; span: number } | null {
  if (!(ft > 0) || !(w > 0)) return null;
  const span = ft * 40, pad = w - span;
  return Math.abs(pad - 400) <= 40 || Math.abs(pad - 200) <= 40 ? { start: 200, span } : null;
}

/**
 * How to lay the art out so its visible part fills the area: the media's left, top, width and height as
 * percentages of the area. Cones are fitted both ways (their spread to the cone's); rays and lines only along
 * their length (their thickness stays the art's). Null: nothing worth changing.
 */
export function fitOf(trim: Trim | null | undefined, shape: string): { l: number; t: number; w: number; h: number } | null {
  if (!trim) return null;
  if (shape === 'radius' || shape === 'emanation') {
    // a burst (Fireball) whose picture stops short of its frame: grown till its body reaches the area's edge
    const r = trim[4];
    if (!r || !(r > 0.2) || r > 0.93) return null;
    const k = Math.min(1.6, 1 / r);
    return { l: 50 - 50 * k, t: 50 - 50 * k, w: 100 * k, h: 100 * k };
  }
  if (shape !== 'cone' && shape !== 'line') return null;
  const [x0, x1, y0, y1] = trim;
  const along = Math.max(0.05, x1 - x0), across = shape === 'cone' ? Math.max(0.05, y1 - y0) : 1;
  const top = shape === 'cone' ? y0 : 0;
  if (along > 0.97 && across > 0.97) return null;
  return { l: (-x0 / along) * 100, t: (-top / across) * 100, w: 100 / along, h: 100 / across };
}
