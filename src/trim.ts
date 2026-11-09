// Where an animation's picture really is in its frame. Much art (JB2A's cones and rays among it) leaves empty,
// see-through room around what it shows, so stretched frame-to-area the effect stops short of where it should
// reach. A few frames are looked at once, the part that is ever visible is kept, and that part is what is
// fitted to the area from then on.

/** The visible part of a frame, as fractions of its width and height: left, right, top, bottom. */
export type Trim = [number, number, number, number];

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
    let box: Trim | null = null;
    const look = (src: CanvasImageSource, w: number, h: number) => {
      const k = SIDE / Math.max(w, h);
      const cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
      canvas.width = cw; canvas.height = ch;
      g.clearRect(0, 0, cw, ch); g.drawImage(src, 0, 0, cw, ch);
      const px = g.getImageData(0, 0, cw, ch).data;
      let x0 = cw, x1 = -1, y0 = ch, y1 = -1;
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
        if (px[(y * cw + x) * 4 + 3] > SOLID) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
      if (x1 < 0) return;
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
    return box;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const within = <T>(p: Promise<T>, ms: number): Promise<T> => Promise.race([p, new Promise<T>((_, no) => window.setTimeout(() => no(new Error('slow')), ms))]);

/**
 * How to lay the art out so its visible part fills the area: the media's left, top, width and height as
 * percentages of the area. Cones are fitted both ways (their spread to the cone's); rays and lines only along
 * their length (their thickness stays the art's). Null: nothing worth changing.
 */
export function fitOf(trim: Trim | null | undefined, shape: string): { l: number; t: number; w: number; h: number } | null {
  if (!trim || (shape !== 'cone' && shape !== 'line')) return null;
  const [x0, x1, y0, y1] = trim;
  const along = Math.max(0.05, x1 - x0), across = shape === 'cone' ? Math.max(0.05, y1 - y0) : 1;
  const top = shape === 'cone' ? y0 : 0;
  if (along > 0.97 && across > 0.97) return null;
  return { l: (-x0 / along) * 100, t: (-top / across) * 100, w: 100 / along, h: 100 / across };
}
