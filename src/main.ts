// Atlas Spell Effects: animated spell areas on Atlas VTT maps (a bridge until Atlas has its own).
// Cast from the command palette or the ribbon: pick a spell (your spell list says its area), pick its animation
// (JB2A or your own files; or one the add-on draws), click the caster / aim / click where it lands. It plays on
// your map and on the player window (the TV) at the right place and size; lasting ones stay until you end them.
import { Plugin, Modal, Menu, Notice, PluginSettingTab, Setting, setIcon, TFile, type App } from 'obsidian';
import { BaseReader, basesReady } from './bases';
import { jb2aFiles, fetchJb2a, fetchAll } from './jb2a';
import { measureArt, type Trim } from './trim';
import { kitOf, PixiPainter, forgetBlobs } from './pixi';
import { call, field, type Tab, type AtlasView, type AtlasViewport, type AtlasState, type CanvasNode, type PlayersView, type Measurement } from './atlas';
import { FolderSuggest, BaseSuggest } from './suggest';
import { SpellNames, StatblockLinker, type SpellLink } from './statblocks';
import { areaOf, targetOf, describe, type Area, type Shape, type SpellEntry, type WallBlocks } from './areas';
import { indexFiles, indexFile, matchesFor, coloursOf, search, type EffectFile } from './library';
import { isStored, storedFrom, writeDefaults, baseFile, noteName, type StoredSpell } from './storage';
import { looksLikeSpell, spellFromNote } from './notes';
import { lightOf, placedLights, adoptLook, lightKey, LIGHT_COLOUR, type EffectLight } from './lights';

import { boxOf, dirTo, hitEffect, snapCorner, placeOf, pxPerFoot, attachTo, detach, wallPieces, wallPoints, ringPoints, pathLength, within, controlsOf, stepSize, dragHandle, aims, CONE_ANGLE, type Box, type Effect, type Point, type Scale, type TokenAt } from './geometry';
import { Painter, artInfo, instantMs, FADE_MS, paintHandles, drawnSample, type Surface, type World, type Mapping } from './overlay';

const ATLAS_VIEW = 'atlas-vtt';
const PLAYER_VIEW = 'atlas-vtt-local-player';
const PLAYER_CANVAS = 'atlas-player-canvas';

const uid = () => 'fx' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** A preset: a spell (or an effect of your own) as you like to cast it, under a name of its own. */
export interface Preset { id: string; name: string; of: string; area: Area; file?: string; colour: string; colour2?: string; alpha?: number; attach?: boolean; light?: EffectLight | null }
interface Remembered { angle?: number; target?: 'on' | 'bolt'; colour2?: string; alpha?: number; file?: string; colour?: string; shape?: Shape; size?: number; width?: number; from?: 'caster' | 'point'; lasting?: boolean; light?: EffectLight | null; ring?: number; round?: boolean; blocks?: WallBlocks }
interface Settings {
  folders: string;                 // vault folders with effect files, comma-separated; '' = any folder named like JB2A or "Spell Effects"
  remember: Record<string, Remembered>;
  lasting: Effect[];               // lasting effects, kept between sessions
  snap: boolean;
  storage: string;                 // the folder for new spell notes (effects of your own)
  bases: string[];                 // .base files whose notes are spells
  presets: Preset[];               // your presets, in the order you made them
  jb2aFolder: string;              // where JB2A animations are downloaded to
  jb2aOffer: boolean;              // offer every JB2A animation (downloaded when first used)
  orphanLights: { map: string; id: string; wall?: boolean }[];   // lights of ended effects on maps that weren't open: removed when they are
  noteSpells: boolean;             // offer the vault's spell notes (notes whose properties say they are spells)
  artTrim: Record<string, Trim | 0>;   // where each animation's picture is in its frame (0: looked, nothing to trim)
  coneAngle: number;               // a cone's angle at its point when a spell doesn't say (5e: 53.13°, as wide as it is long)
}
const DEFAULTS: Settings = { folders: '', remember: {}, lasting: [], snap: true, storage: 'Spell Storage', bases: [], presets: [], jb2aFolder: 'JB2A_DnD5e', jb2aOffer: true, noteSpells: true, orphanLights: [], coneAngle: CONE_ANGLE, artTrim: {} };

/** A spell to pick in the cast window: one with saved defaults, or a spell note (from a Base or found in the vault). */
export interface Choice { key: string; name: string; source: 'stored' | 'note'; entry?: SpellEntry; stored?: StoredSpell; notePath?: string }


/** What is being cast: the area and look, before it is placed. */
interface Pending { name: string; key: string; area: Area; file?: string; colour: string; colour2?: string; alpha?: number; attach?: boolean; light?: EffectLight }

export default class AtlasSpellEffects extends Plugin {
  settings: Settings = { ...DEFAULTS };
  /** Waits before looking again (spells, the vault's files, spell Bases). */
  private timers: { rs?: number; ri?: number; rb?: number } = {};
  files: EffectFile[] = [];
  effects: Effect[] = [];
  private painters = new Map<object, Painter>();          // by view or player document
  private loop = 0;
  private placing: { tab: Tab; pending: Pending; caster: { x: number; y: number; token?: string; r: number } | null; preview: Effect | null; stop: () => void; hint: HTMLElement } | null = null;
  private saveTimer: number | null = null;
  last: Pending | null = null;
  stored: StoredSpell[] = [];
  noteChoices: Choice[] = [];
  private readers: BaseReader[] = [];
  /** Each chosen Base's notes, and how reading it went. */
  baseNotes = new Map<string, string[]>();
  baseState = new Map<string, 'ok' | 'missing' | 'no-bases'>();
  /** "Download everything" while it runs. */
  dl: { done: number; total: number; failed: number; stop: boolean } | null = null;
  dlListener: (() => void) | null = null;

  async onload(): Promise<void> {
    const loaded = ((await this.loadData()) ?? {}) as Partial<Settings> & Record<string, unknown>;
    this.settings = { ...DEFAULTS, ...loaded };
    const firstBases = !('bases' in loaded);
    basesReady(this);
    // an older version's spell list from GitHub: gone (spells come from your vault)
    const old = this.settings as unknown as Record<string, unknown>;
    if ('repo' in old || 'spells' in old) { for (const k of ['repo', 'branch', 'spellPath', 'spells']) delete old[k]; void this.save(); }
    this.effects = (this.settings.lasting ?? []).filter((e) => e && e.id && e.map);
    this.addSettingTab(new EffectSettings(this.app, this));
    this.addRibbonIcon('sparkles', 'Cast a spell effect', () => this.openCast());
    this.addCommand({ id: 'cast', name: 'Cast a spell effect…', callback: () => this.openCast() });
    this.addCommand({ id: 'cast-again', name: 'Cast the last effect again', callback: () => (this.last ? this.place(this.last) : this.openCast()) });
    this.addCommand({ id: 'preset', name: 'Cast a preset…', callback: () => new PresetPicker(this.app, this).open() });
    this.addCommand({ id: 'end', name: 'End a lasting effect…', callback: () => new EndModal(this.app, this).open() });
    this.addCommand({ id: 'end-all', name: 'End every lasting effect on this map', callback: () => this.endAllHere() });
    this.addCommand({ id: 'snap', name: 'Snap effects to the grid on or off', callback: () => { void this.toggleSnap(); } });
    this.addCommand({ id: 'reload', name: 'Look again for spell notes and effect files', callback: () => { this.indexVault(); this.indexSpells(); } });
    this.app.workspace.onLayoutReady(() => {
      // from an older version: its Spell Storage folder's Base becomes the first spell Base
      if (firstBases) { const b = `${this.storageFolder()}/${this.storageFolder().split('/').pop()}.base`; if (this.app.vault.getAbstractFileByPath(b)) { this.settings.bases = [b]; void this.save(); } }
      this.indexVault(); this.indexSpells(); void this.startBases(); this.linkStatblocks(); this.wake();
    });
    this.registerEvent(this.app.vault.on('modify', (f) => { if (this.settings.bases.includes(f.path)) void this.startBases(); }));
    const respell = () => { window.clearTimeout(this.timers.rs); this.timers.rs = window.setTimeout(() => this.indexSpells(), 800); };
    this.registerEvent(this.app.metadataCache.on('changed', respell));
    this.registerEvent(this.app.metadataCache.on('resolved', respell));
    const reindex = () => { window.clearTimeout(this.timers.ri); this.timers.ri = window.setTimeout(() => this.indexVault(), 1500); };
    this.registerEvent(this.app.vault.on('create', reindex));
    this.registerEvent(this.app.vault.on('delete', reindex));
    this.registerEvent(this.app.vault.on('rename', reindex));
    this.registerEvent(this.app.workspace.on('layout-change', () => this.wake()));
    this.registerInterval(window.setInterval(() => { this.wake(); this.bars(); this.linkStatblocks(); }, 2000));
    this.app.workspace.onLayoutReady(() => this.bars());
    this.registerEvent(this.app.workspace.on('layout-change', () => window.setTimeout(() => this.bars(), 300)));
  }

  // ── moving effects: drag one like a token (Shift-drag turns a cone, line or cube), right-click to end it ──
  private dragDocs = new WeakSet<Document>();
  private dragging: { tab: Tab; id: string; start: Point; startX: number; startY: number; orig: Effect; moved: boolean; alt?: boolean; turned?: boolean; handle?: string; group?: Effect[]; before: string } | null = null;
  /** The effects picked on the map (outlined on the DM's view; one alone has its controls). */
  selected: { ids: string[]; tab: Tab } | null = null;
  /** Picks one effect (or none); `add`: adds it to those picked, or takes it out again. */
  select(fx: Effect | null, tab?: Tab, add = false): void {
    if (!fx || !tab) { this.selected = null; this.wake(); return; }
    if (add && this.selected && this.selected.tab.view === tab.view) {
      const ids = this.selected.ids.includes(fx.id) ? this.selected.ids.filter((i) => i !== fx.id) : [...this.selected.ids, fx.id];
      this.selected = ids.length ? { ids, tab } : null;
    } else this.selected = { ids: [fx.id], tab };
    this.wake();
  }
  isPicked(id: string): boolean { return !!this.selected?.ids.includes(id); }
  /** Effects inside the box (or lasso) Atlas drew: picked too, as the tokens in it are. */
  private marquee: { tab: Tab; pts: Point[]; x: number; y: number; add: boolean } | null = null;
  private cursorSet: HTMLCanvasElement | null = null;
  private swallowClick = false;

  /** The effect's box on a tab now (following its token, with its art's shape). */
  boxFor(e: Effect, t: Tab): Box {
    const info = e.file ? artInfo.get(e.file) : undefined;
    return boxOf(e, this.scaleOf(t), e.token ? this.tokenOf(t, e.token) : null, info ? { aspect: info.aspect, feet: info.feet } : null);
  }

  /** The topmost effect under a world point on a tab (the last cast is on top). */
  effectAt(t: Tab, p: Point): Effect | null {
    const map = this.mapOf(t);
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      if (e.map !== map || (e.token && !this.tokenOf(t, e.token))) continue;
      const pieces = e.shape === 'wall' ? wallPieces(e, this.scaleOf(t), e.token ? this.tokenOf(t, e.token) : null, !!e.file) : undefined;
      if (hitEffect(e, this.boxFor(e, t), p, pieces)) return e;
    }
    return null;
  }

  private hookDrag(doc: Document): void {
    if (this.dragDocs.has(doc)) return;
    this.dragDocs.add(doc);
    const tabAt = (ev: MouseEvent): { t: Tab; p: Point } | null => {
      for (const t of this.atlasTabs()) {
        if (t.canvas.ownerDocument !== doc || t.canvas.offsetParent === null) continue;
        const r = t.canvas.getBoundingClientRect();
        if (ev.clientX < r.left || ev.clientY < r.top || ev.clientX > r.right || ev.clientY > r.bottom) continue;
        // only presses on the map itself (or the effects layer over it), not on Atlas's toolbars and panels
        const under = doc.elementFromPoint(ev.clientX, ev.clientY);
        if (under !== t.canvas && !(under as HTMLElement | null)?.closest?.('.sfx-layer')) continue;
        const p = call<Point>(t.viewport, 'toWorld', ev.clientX - r.left, ev.clientY - r.top);
        if (p && Number.isFinite(p.x)) return { t, p: { x: p.x, y: p.y } };
      }
      return null;
    };
    const stopAll = (ev: Event) => { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation(); };
    const down = (ev: PointerEvent) => {
      if (this.placing || ev.button !== 0) return;
      const at = tabAt(ev); if (!at) return;
      // the picked effect's controls: the size badge's − and +, or a control to drag (turn, size, a wall corner)
      const target = ev.target as HTMLElement | null;
      const sel = this.selected?.ids.length === 1 ? this.effects.find((e) => e.id === this.selected!.ids[0]) : null;
      const step = target?.closest?.('[data-step]') as HTMLElement | null;
      if (step && sel) { stopAll(ev); const before = this.snapshot(); stepSize(sel, Number(step.dataset.step)); this.commit(before); this.changed(); return; }
      const handle = target?.closest?.('.sfx-ctl') as HTMLElement | null;
      if (handle && sel) {
        stopAll(ev);
        this.dragging = { tab: at.t, id: sel.id, start: at.p, startX: ev.clientX, startY: ev.clientY, orig: JSON.parse(JSON.stringify(sel)) as Effect, moved: false, handle: handle.dataset.handle ?? '', before: this.snapshot() };
        return;
      }
      if (this.tokenAt(at.t, at.p)) { if (this.selected && !ev.shiftKey) this.select(null); return; }   // a token wins: Atlas moves it
      const fx = this.effects.length ? this.effectAt(at.t, at.p) : null;
      if (!fx) {
        // empty map: let go of the picked ones (Shift keeps them); watch the box Atlas draws, to pick effects in it
        if (this.selected && !ev.shiftKey) this.select(null);
        const tool = at.t.store?.getState?.()?.activeTool;
        if (this.effects.length && (tool === 'select' || tool === 'move')) this.marquee = { tab: at.t, pts: [at.p], x: ev.clientX, y: ev.clientY, add: ev.shiftKey };
        return;
      }
      stopAll(ev);
      // dragging one of several picked: they all move
      const group = this.isPicked(fx.id) && this.selected!.ids.length > 1 ? this.effects.filter((e) => this.isPicked(e.id) && e.id !== fx.id).map((e) => JSON.parse(JSON.stringify(e))) : undefined;
      this.dragging = { tab: at.t, id: fx.id, start: at.p, startX: ev.clientX, startY: ev.clientY, orig: JSON.parse(JSON.stringify(fx)) as Effect, moved: false, before: this.snapshot(), ...(group ? { group } : {}) };
    };
    const move = (ev: PointerEvent) => {
      const d = this.dragging;
      if (!d && this.marquee) {
        const mq = this.marquee, r = mq.tab.canvas.getBoundingClientRect();
        const w = call<Point>(mq.tab.viewport, 'toWorld', ev.clientX - r.left, ev.clientY - r.top);
        if (w && Number.isFinite(w.x)) mq.pts.push({ x: w.x, y: w.y });
      }
      if (!d) {
        // Ctrl / ⌘ over a token: Atlas opens its statblock, which then knows its creature
        if (ev.ctrlKey || ev.metaKey) { const at = tabAt(ev); if (at) this.trackHover(at.t, at.p); }
        // the pointer over an effect (not a token): a move cursor, as over a token
        if (this.placing || !this.effects.length) return;
        const at = tabAt(ev);
        const over = !!at && !this.tokenAt(at.t, at.p) && !!this.effectAt(at.t, at.p);
        if (over && at) { if (!at.t.canvas.hasClass('sfx-cursor-move')) { at.t.canvas.addClass('sfx-cursor-move'); this.cursorSet = at.t.canvas; } }
        else if (this.cursorSet) { this.cursorSet.removeClass('sfx-cursor-move'); this.cursorSet = null; }
        return;
      }
      stopAll(ev);
      if (!d.moved && Math.hypot(ev.clientX - d.startX, ev.clientY - d.startY) < 4) return;
      d.moved = true;
      const r = d.tab.canvas.getBoundingClientRect();
      const w = call<Point>(d.tab.viewport, 'toWorld', ev.clientX - r.left, ev.clientY - r.top);
      const fx = this.effects.find((e) => e.id === d.id);
      if (!w || !fx) return;
      if (d.handle) {
        const tok = fx.token ? this.tokenOf(d.tab, fx.token) : null;
        const px = 1 / Math.max(1e-6, d.tab.viewport?.scale?.x ?? 1);
        dragHandle(fx, d.handle, { x: w.x, y: w.y }, this.scaleOf(d.tab), tok, this.boxFor(fx, d.tab), this.snapOn(ev), (q) => this.snapPoint(d.tab, q, ev), px);
        this.wake();
        return;
      }
      const o = d.orig;
      const tok = o.token ? this.tokenOf(d.tab, o.token) : null;
      const place = placeOf(o, tok);
      if (ev.shiftKey && o.dir !== undefined) {
        // Shift: turn it about its origin, towards the pointer (still on its token, if it has one)
        const rot = o.token && o.turn ? tok?.rot ?? 0 : 0;
        let a = dirTo(place.at, w);
        if (this.snapOn(ev)) a = Math.round(a / (Math.PI / 12)) * (Math.PI / 12);   // 15° steps
        fx.dir = a - rot;
        d.turned = true;
      } else {
        // moved off its token, it stays where it is put
        fx.at = { x: place.at.x + (w.x - d.start.x), y: place.at.y + (w.y - d.start.y) };
        if (place.dir !== undefined) fx.dir = place.dir;
        delete fx.token; delete fx.offset; delete fx.turn;
        // the others picked go the same way (those on a token stay with it)
        for (const g of d.group ?? []) {
          const e = this.effects.find((x) => x.id === g.id); if (!e || g.token) continue;
          e.at = { x: g.at.x + (w.x - d.start.x), y: g.at.y + (w.y - d.start.y) };
        }
      }
      d.alt = ev.altKey;
      this.wake();
    };
    const up = (ev: PointerEvent) => {
      const mq = this.marquee; this.marquee = null;
      if (mq && !this.dragging && Math.hypot(ev.clientX - mq.x, ev.clientY - mq.y) > 6) {
        // the box (or lasso) Atlas drew: the effects whose middle is in it are picked too
        const lasso = mq.tab.store?.getState?.()?.selectionMode === 'lasso' && mq.pts.length > 2;
        const a = mq.pts[0], b = mq.pts[mq.pts.length - 1];
        const inside = (p: Point) => lasso ? inPolygon(p, mq.pts) : p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x) && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y);
        const map = this.mapOf(mq.tab);
        const ids = this.effects.filter((e) => e.map === map && (!e.token || this.tokenOf(mq.tab, e.token)) && inside(this.middleOf(e, mq.tab))).map((e) => e.id);
        const keep = mq.add && this.selected && this.selected.tab.view === mq.tab.view ? this.selected.ids : [];
        const all = [...new Set([...keep, ...ids])];
        this.selected = all.length ? { ids: all, tab: mq.tab } : null;
        this.wake();
      }
      const d = this.dragging; if (!d) return;
      stopAll(ev);
      this.dragging = null;
      this.swallowClick = true; window.setTimeout(() => { this.swallowClick = false; }, 0);
      const fx = this.effects.find((e) => e.id === d.id);
      if (!fx) return;
      if (!d.moved) { if (!d.handle) this.select(fx, d.tab, ev.shiftKey); return; }   // a click: pick it (Shift: add it)
      if (d.handle) { this.commit(d.before); this.changed(); return; }
      // moved (not turned), off a token: spheres, cubes and the points of cones and lines land on grid corners
      if (!d.turned && !fx.token && fx.shape !== 'emanation' && !(fx.shape === 'wall' && fx.closed)) {
        const was = fx.at;
        fx.at = this.snapPoint(d.tab, fx.at, { altKey: d.alt ?? ev.altKey });
        // the others picked keep their places relative to it
        for (const g of d.group ?? []) { const e = this.effects.find((x) => x.id === g.id); if (e && !g.token) e.at = { x: e.at.x + fx.at.x - was.x, y: e.at.y + fx.at.y - was.y }; }
      }
      this.commit(d.before);
      if (fx.lasting) this.saveSoon();
    };
    const swallowClick = (ev: MouseEvent) => { if (this.dragging || this.swallowClick) { this.swallowClick = false; stopAll(ev); } };
    const menu = (ev: MouseEvent) => {
      if (this.placing || !this.effects.length) return;
      const at = tabAt(ev); if (!at || this.tokenAt(at.t, at.p)) return;
      const fx = this.effectAt(at.t, at.p); if (!fx) return;
      stopAll(ev);
      const m = new Menu();
      m.addItem((i) => i.setTitle(`Edit ${fx.name}…`).setIcon('pencil').onClick(() => new EditModal(this.app, this, fx.id, at.t).open()));
      m.addItem((i) => i.setTitle(`End ${fx.name}`).setIcon('x').onClick(() => this.end(fx.id)));
      m.showAtMouseEvent(ev);
    };
    const dbl = (ev: MouseEvent) => {
      if (this.placing || !this.effects.length) return;
      const at = tabAt(ev); if (!at || this.tokenAt(at.t, at.p)) return;
      const fx = this.effectAt(at.t, at.p); if (!fx) return;
      stopAll(ev);
      new EditModal(this.app, this, fx.id, at.t).open();
    };
    const keys = (ev: KeyboardEvent) => {
      if (!this.selected || this.placing) return;
      const t = ev.target as HTMLElement | null;
      if (t?.closest?.('input, textarea, [contenteditable=true], .modal')) return;
      if (ev.key === 'Escape') { this.select(null); stopAll(ev); }
      else if (ev.key === 'Delete' || ev.key === 'Backspace') { const ids = this.selected.ids; this.select(null); this.endMany(ids); stopAll(ev); }
    };
    // Ctrl+Z / Ctrl+Y (Ctrl+Shift+Z): heard on the window before Atlas hears them; the add-on's step if it's the latest
    const history = (ev: KeyboardEvent) => {
      if (!(ev.ctrlKey || ev.metaKey) || ev.altKey) return;
      const k = ev.key.toLowerCase();
      const redo = k === 'y' || (k === 'z' && ev.shiftKey);
      if (k !== 'z' && k !== 'y') return;
      const t = ev.target as HTMLElement | null;
      if (t?.closest?.('input, textarea, select, [contenteditable=true], .modal, .cm-editor')) return;
      const tab = this.atlasTab(); if (!tab || tab.canvas.ownerDocument !== doc) return;
      const act = doc.activeElement as HTMLElement | null;
      if (act && act !== doc.body && !(tab.view?.containerEl as HTMLElement | undefined)?.contains(act)) return;
      if (this.undoOrRedo(redo)) stopAll(ev);
    };
    // Atlas's own Undo and Redo buttons, the same way
    const buttons = (ev: MouseEvent) => {
      // Atlas's toolbar buttons carry Lucide's undo / redo arrow (their name is hidden text, in the user's language)
      const b = (ev.target as HTMLElement | null)?.closest?.('button') as HTMLElement | null;
      if (!b) return;
      const icon = b.querySelector('svg')?.getAttribute('class') ?? '';
      const label = (b.getAttribute('aria-label') ?? b.querySelector('.sr-only')?.textContent ?? '').toLowerCase();
      const kind = /lucide-undo/.test(icon) || /^undo\b/.test(label) ? 'undo' : /lucide-redo/.test(icon) || /^redo\b/.test(label) ? 'redo' : null;
      if (!kind) return;
      const tab = this.atlasTab(); if (!tab || !(tab.view?.containerEl as HTMLElement | undefined)?.contains(b)) return;
      if (this.undoOrRedo(kind === 'redo')) stopAll(ev);
    };
    const win = doc.defaultView;
    win?.addEventListener('keydown', history, { capture: true });
    doc.addEventListener('click', buttons, { capture: true });
    this.register(() => { win?.removeEventListener('keydown', history, { capture: true }); doc.removeEventListener('click', buttons, { capture: true }); });
    for (const t of this.atlasTabs()) this.watchAtlasHistory(t);
    const opts = { capture: true } as AddEventListenerOptions;
    doc.addEventListener('keydown', keys, opts);
    doc.addEventListener('dblclick', dbl, opts);
    doc.addEventListener('pointerdown', down, opts);
    doc.addEventListener('pointermove', move, opts);
    doc.addEventListener('pointerup', up, opts);
    doc.addEventListener('click', swallowClick, opts);
    doc.addEventListener('contextmenu', menu, opts);
    this.register(() => {
      doc.removeEventListener('keydown', keys, opts);
      doc.removeEventListener('dblclick', dbl, opts);
      doc.removeEventListener('pointerdown', down, opts);
      doc.removeEventListener('pointermove', move, opts);
      doc.removeEventListener('pointerup', up, opts);
      doc.removeEventListener('click', swallowClick, opts);
      doc.removeEventListener('contextmenu', menu, opts);
      if (this.cursorSet) this.cursorSet.removeClass('sfx-cursor-move');
    });
  }

  // ── a tool in Atlas's main toolbar: ✨ casts, its arrow opens Cast again / Lasting effects ──
  /** Puts the tool into every Atlas tab's toolbar (again, when Atlas has redrawn it), and brings it up to date. */
  bars(): void {
    for (const t of this.atlasTabs()) {
      this.hookDrag(t.canvas.ownerDocument);
      const root: HTMLElement | null = t.view.containerEl ?? t.canvas.parentElement;
      if (!root) continue;
      const toolbar = root.querySelector<HTMLElement>('.atlas-main-toolbar');
      let tool = root.querySelector<HTMLElement>('.sfx-tool');
      if (tool && toolbar && tool.parentElement !== toolbar) { tool.remove(); tool = null; }
      if (!tool) tool = this.makeTool(root.ownerDocument, toolbar, root);
      // Atlas's controls come and go: the tool stays last, before the bar's end controls
      if (toolbar) {
        const endEl = toolbar.querySelector(':scope > .atlas-toolbar-end');
        if (endEl ? tool.nextElementSibling !== endEl : toolbar.lastElementChild !== tool) toolbar.insertBefore(tool, endEl);
      }
      this.updateTool(tool, t);
    }
  }

  private makeTool(doc: Document, toolbar: HTMLElement | null, root: HTMLElement): HTMLElement {
    // made in the toolbar (or the tab), then put in its place
    const item = (toolbar ?? root).createDiv({ cls: 'atlas-toolbar-item sfx-tool' });
    const group = item.createDiv({ cls: 'atlas-tool-button' });
    const cast = group.createEl('button', { cls: 'btn btn--toolbar btn--icon clickable-icon sfx-cast' });
    try { setIcon(cast, 'sparkles'); } catch { cast.textContent = '✨'; }
    cast.createSpan({ cls: 'sfx-badge' });
    cast.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); if (this.placing) this.placing.stop(); else this.openCast(); });
    const more = group.createEl('button', { cls: 'btn btn--toolbar atlas-tool-button-chevron clickable-icon sfx-more' });
    more.setAttribute('aria-label', 'Spell effects: more');
    try { setIcon(more, 'chevron-down'); } catch { more.textContent = '▾'; }
    more.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this.openToolMenu(e); });
    group.append(cast, more);
    if (toolbar) {
      toolbar.insertBefore(item, toolbar.querySelector(':scope > .atlas-toolbar-end'));
    } else {
      // no main toolbar found (another Atlas version): a little bar of its own at the top right of the map
      item.addClass('sfx-floating');
      if (getComputedStyle(root).position === 'static') root.addClass('sfx-relative');
      root.appendChild(item);
    }
    return item;
  }

  /** The arrow's menu: cast again, the lasting effects on this map, end them. */
  openToolMenu(e: MouseEvent): void {
    const menu = new Menu();
    menu.addItem((i) => i.setTitle('Cast a spell effect…').setIcon('sparkles').onClick(() => this.openCast()));
    if (this.last) { const l = this.last; menu.addItem((i) => i.setTitle(`Cast ${l.name} again`).setIcon('repeat').onClick(() => this.place(l))); }
    if (this.settings.presets.length) {
      menu.addSeparator();
      for (const pr of this.settings.presets) menu.addItem((i) => i.setTitle(pr.name).setIcon('zap').onClick(() => this.castPreset(pr)));
    }
    menu.addSeparator();
    menu.addItem((i) => { i.setTitle('Snap to grid (Alt: the other way)').setIcon('grid').onClick(() => { void this.toggleSnap(); }); i.setChecked?.(this.settings.snap); });
    const here = this.lastingHere();
    if (here.length) {
      menu.addSeparator();
      // each told apart from the others (pointing at one outlines it on the map)
      for (const fx of here) menu.addItem((i) => {
        const l = this.labelOf(fx, here);
        i.setTitle(`End ${l.name} (${l.detail})`).setIcon('x').onClick(() => { this.showOnMap(null); this.end(fx.id); });
        const dom = (i as unknown as { dom?: HTMLElement }).dom;
        dom?.addEventListener('mouseenter', () => this.showOnMap(fx)); dom?.addEventListener('mouseleave', () => this.showOnMap(null));
      });
      if (here.length > 1) menu.addItem((i) => i.setTitle('End them all').setIcon('trash-2').onClick(() => this.endAllHere()));
      menu.addItem((i) => i.setTitle('Lasting effects…').setIcon('list').onClick(() => new EndModal(this.app, this).open()));
    }
    menu.onHide(() => this.showOnMap(null));
    menu.showAtMouseEvent(e);
  }

  /** A preset straight onto the map (its animation fetched first, if it is a JB2A one not downloaded yet). */
  async castPreset(pr: Preset): Promise<void> {
    if (!this.atlasTab()) { new Notice('Atlas Spell Effects: open an Atlas map first.'); return; }
    const ok = await this.ensureFile(pr.file);
    this.indexVault();
    this.place({ name: pr.of || pr.name, key: 'preset:' + pr.id, area: { ...pr.area }, ...(pr.file && ok ? { file: pr.file } : {}), colour: pr.colour, ...(pr.colour2 ? { colour2: pr.colour2 } : {}), ...(pr.alpha ? { alpha: pr.alpha } : {}), ...(pr.attach ? { attach: true } : {}), ...(pr.light ? { light: { ...pr.light } } : {}) });
  }

  private updateTool(tool: HTMLElement, t: Tab): void {
    const cast = tool.querySelector<HTMLButtonElement>('.sfx-cast');
    const badge = tool.querySelector<HTMLElement>('.sfx-badge');
    const placingHere = !!this.placing && this.placing.tab.view === t.view;
    const map = this.mapOf(t);
    const n = this.effects.filter((e) => e.lasting && e.map === map).length;
    cast?.classList.toggle('is-active', placingHere);
    cast?.setAttribute('aria-label', placingHere ? 'Stop placing the effect' : 'Cast a spell effect' + (n ? ` (${n} lasting on this map)` : ''));
    if (badge) badge.textContent = n ? String(n) : '';
  }

  onunload(): void {
    this.placing?.stop();
    if (this.loop) window.cancelAnimationFrame(this.loop);
    for (const p of this.painters.values()) p.stop();
    this.painters.clear();
    for (const p of this.pixiPainters.values()) p.stop();
    this.pixiPainters.clear();
    forgetBlobs();
    for (const d of this.docs()) d.querySelectorAll('.sfx-layer,.sfx-tool').forEach((el) => el.remove());
    for (const r of this.readers) r.stop();
    if (this.dl) this.dl.stop = true;
    for (const l of this.linkers.values()) l.stop();
    this.linkers.clear();
  }

  // ── spells in Atlas's statblocks ──
  private linkers = new Map<Document, StatblockLinker>();
  private names: SpellNames | null = null;
  /** The token whose statblock Atlas opened (the one under the pointer as it opened). */
  private hoverTok: { tab: Tab; id: string; at: number } | null = null;
  private windowTok = new WeakMap<Element, { tab: Tab; id: string }>();
  /** Spell names changed (spells read, saved, presets): looked for again. */
  namesChanged(): void { this.names = null; for (const l of this.linkers.values()) l.soon(); }

  /** The names this add-on can cast: spells with an area (or saved defaults), and presets of spells it doesn't list. */
  spellNames(): SpellNames {
    if (this.names) return this.names;
    const links: SpellLink[] = [];
    const seen = new Set<string>();
    for (const c of this.choices()) {
      const ok = !!c.stored || (!!c.entry && !!(areaOf(c.entry) ?? targetOf(c.entry)));
      if (ok && !seen.has(c.name.toLowerCase())) { links.push({ key: c.key, name: c.name }); seen.add(c.name.toLowerCase()); }
    }
    for (const pr of this.settings.presets) if (pr.of && !seen.has(pr.of.toLowerCase())) { links.push({ key: 'preset:' + pr.id, name: pr.of }); seen.add(pr.of.toLowerCase()); }
    return (this.names = new SpellNames(links));
  }

  /** Every open window's statblocks are read (the main one, and windows popped out). */
  linkStatblocks(): void {
    const docs = new Set<Document>([document, ...this.docs()]);
    for (const d of docs) {
      if (this.linkers.has(d) || !d.body) continue;
      const l = new StatblockLinker(d, () => this.spellNames(), (link, how) => void this.castFromStatblock(link, how));
      l.start(); this.linkers.set(d, l);
    }
    for (const [d, l] of this.linkers) if (!docs.has(d) || !d.defaultView) { l.stop(); this.linkers.delete(d); }
  }

  /** Notes the token under the pointer on a map, so a statblock Atlas opens for it knows it. */
  trackHover(t: Tab, p: Point): void {
    const tok = this.tokenAt(t, p);
    if (tok) this.hoverTok = { tab: t, id: tok.id, at: Date.now() };
  }
  /** The token a statblock belongs to: one opened over the map from a token (Ctrl / ⌘ + hover). */
  private tokenOfStatblock(sb: HTMLElement): { tab: Tab; id: string } | null {
    const win = sb.closest('.atlas-statblock-preview-window');
    if (!win) {
      // a statblock elsewhere (Atlas's side panel, a note): the one token selected on the map, if there is one
      const t = this.atlasTab(); const st = t?.store.getState?.();
      const sel = (st?.selectedIds ?? []).filter((id: string) => st?.objects?.tokens?.[id]);
      return t && sel.length === 1 ? { tab: t, id: sel[0] } : null;
    }
    let t = this.windowTok.get(win);
    if (!t && this.hoverTok && Date.now() - this.hoverTok.at < 5000) { t = { tab: this.hoverTok.tab, id: this.hoverTok.id }; this.windowTok.set(win, t); }
    return t ?? null;
  }

  /** A spell clicked in a statblock: cast it (its creature as the caster), or Shift: open it in the cast window. */
  async castFromStatblock(link: SpellLink, how: { shift: boolean; statblock: HTMLElement }): Promise<void> {
    const tok = this.tokenOfStatblock(how.statblock);
    const pr = link.key.startsWith('preset:') ? this.settings.presets.find((x) => 'preset:' + x.id === link.key) : null;
    const c = pr ? null : this.choices().find((x) => x.key === link.key) ?? null;
    if (!pr && !c) return;
    const m = new CastModal(this.app, this);
    if (pr) m.pickPreset(pr); else await m.pick(c);
    if (how.shift) { m.casterToken = tok?.id; m.open(); return; }
    const p = await m.pending();
    if (!this.atlasTab()) { new Notice('Atlas Spell Effects: open an Atlas map first.'); return; }
    this.place(p, tok && this.mapOf(tok.tab) === this.mapOf(this.atlasTab()!) ? tok.id : undefined);
  }

  // ── spell Bases ──
  /** Reads every chosen Base (again), live: its notes are spells. */
  async startBases(): Promise<void> {
    for (const r of this.readers) r.stop();
    this.readers = []; this.baseNotes.clear(); this.baseState.clear();
    const respell = () => { window.clearTimeout(this.timers.rb); this.timers.rb = window.setTimeout(() => this.indexSpells(), 300); };
    for (const path of this.settings.bases) {
      const r = new BaseReader(this.app, path, (paths) => { this.baseNotes.set(path, paths); respell(); });
      this.readers.push(r);
      this.baseState.set(path, await r.start());
    }
    respell();
  }

  async save(): Promise<void> {
    this.names = null;                                             // presets may have changed
    this.settings.lasting = this.effects.filter((e) => e.lasting);
    await this.saveData(this.settings);
  }
  private saveSoon(): void { if (this.saveTimer) window.clearTimeout(this.saveTimer); this.saveTimer = window.setTimeout(() => { this.saveTimer = null; void this.save(); }, 600); }

  // ── the spell list and the effect files ──
  storageFolder(): string { return (this.settings.storage || 'Spell Storage').trim().replace(/^\/+|\/+$/g, '') || 'Spell Storage'; }

  /** A link in a note's property as a vault path: the file it finds, or a path to a JB2A file not downloaded yet. */
  resolver(from: string): (link: string) => string | null {
    const mc = this.app.metadataCache;
    return (link: string) => mc.getFirstLinkpathDest(link, from)?.path ?? (this.app.vault.getAbstractFileByPath(link) || this.files.some((f) => f.path === link) ? link : null);
  }

  /** The spells: notes with saved effect defaults (anywhere), the chosen Bases' notes, and (if wanted) other spell notes. */
  indexSpells(): void {
    const mc = this.app.metadataCache;
    const inBases = new Set([...this.baseNotes.values()].flat());
    const stored: StoredSpell[] = [];
    const notes: Choice[] = [];
    for (const f of this.app.vault.getMarkdownFiles()) {
      const cache = mc.getFileCache(f);
      const fm = (cache?.frontmatter ?? null) as Record<string, unknown> | null;
      if (isStored(fm)) {
        stored.push(storedFrom(f.path, fm ?? {}, this.resolver(f.path)));
      } else if (inBases.has(f.path) || (this.settings.noteSpells && looksLikeSpell(fm, (cache?.tags ?? []).map((t) => t.tag)))) {
        const name = String(fm?.['name'] ?? f.basename);
        notes.push({ key: 'note:' + f.path, name, source: 'note', notePath: f.path });
      }
    }
    stored.sort((a, b) => a.name.localeCompare(b.name));
    this.stored = stored;
    this.noteChoices = notes;
    this.namesChanged();
    void this.readNotes(notes);
  }

  /** Reads the spell notes' text, so the cast window knows which have an area (and their light) before one is picked. */
  private async readNotes(notes: Choice[]): Promise<void> {
    for (const c of notes) { if (this.noteChoices !== notes) return; await this.noteEntry(c); }
    this.namesChanged();
  }
  private storedChoices = new Map<string, Choice>();

  /** Every spell the cast window offers: stored ones first, then spell notes (one per name). */
  choices(): Choice[] {
    const seen = new Set<string>();
    const out: Choice[] = [];
    const add = (c: Choice) => { const k = c.name.trim().toLowerCase(); if (seen.has(k)) return; seen.add(k); out.push(c); };
    const byName = new Map(this.noteChoices.filter((n) => n.entry).map((n) => [n.name.trim().toLowerCase(), n.entry!]));
    for (const st of this.stored) {
      const c = (this.storedChoices.get(st.path)?.stored === st ? this.storedChoices.get(st.path) : null) ?? { key: 'stored:' + st.path, name: st.name, source: 'stored' as const, stored: st, notePath: st.path };
      const entry = c.entry ?? byName.get(st.name.trim().toLowerCase()); if (entry) c.entry = entry;
      this.storedChoices.set(st.path, c); add(c);
    }
    for (const n of this.noteChoices) add(n);
    return out;
  }

  /** A spell note's text, read when it is picked. */
  async noteEntry(c: Choice): Promise<SpellEntry | null> {
    if (c.entry) return c.entry;
    const f = c.notePath ? this.app.vault.getAbstractFileByPath(c.notePath) : null;
    if (!(f instanceof TFile)) return null;
    const fm = (this.app.metadataCache.getFileCache(f)?.frontmatter ?? null) as Record<string, unknown> | null;
    c.entry = spellFromNote(f.path, fm, await this.app.vault.cachedRead(f));
    return c.entry;
  }

  /** Saves a spell's defaults onto its own note's properties (a note in the folder for your own effects, for one without). */
  async storeSpell(c: { name: string; stored?: StoredSpell; entry?: SpellEntry; notePath?: string }, d: { area: Area; file?: string | undefined; colour?: string | undefined; colour2?: string | undefined; alpha?: number | undefined; attach?: boolean | undefined; light?: EffectLight | null | undefined }): Promise<string> {
    const vault = this.app.vault;
    let file: TFile | null = null;
    // the spell's own note (a stored one, or the one its Base or the vault shows)
    for (const p of [c.stored?.path, c.notePath]) { const f = p ? vault.getAbstractFileByPath(p) : null; if (!file && f instanceof TFile) file = f; }
    if (!file) {
      // an effect of your own: a note in the folder for new spell notes, shown by that folder's Base
      const folder = this.storageFolder();
      if (!vault.getAbstractFileByPath(folder)) await vault.createFolder(folder);
      const base = `${folder}/${folder.split('/').pop()}.base`;
      if (!vault.getAbstractFileByPath(base)) await vault.create(base, baseFile(folder));
      if (!this.settings.bases.includes(base)) { this.settings.bases = [...this.settings.bases, base]; await this.save(); void this.startBases(); }
      let path = `${folder}/${noteName(c.name)}.md`;
      for (let i = 2; vault.getAbstractFileByPath(path); i++) path = `${folder}/${noteName(c.name)} ${i}.md`;
      const text = c.entry?.descFull ? `\n${c.entry.descFull.trim()}\n` : '\n';
      file = await vault.create(path, `---\nname: ${JSON.stringify(c.name)}\n---\n${text}`);
    }
    await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => writeDefaults(fm, d));
    // known at once (Obsidian reads the note's properties again in a moment)
    const fm: Record<string, unknown> = { name: c.name };
    writeDefaults(fm, d);
    const st = storedFrom(file.path, fm, this.resolver(file.path));
    this.stored = [...this.stored.filter((x) => x.path !== file.path), st].sort((a, b) => a.name.localeCompare(b.name));
    return file.path;
  }

  folders(): string[] { return this.settings.folders.split(',').map((f) => f.trim().replace(/^\/+|\/+$/g, '')).filter(Boolean); }
  jb2aRoot(): string { return (this.settings.jb2aFolder || 'JB2A_DnD5e').trim().replace(/^\/+|\/+$/g, '') || 'JB2A_DnD5e'; }
  indexVault(): void {
    const want = this.folders();
    const root = this.jb2aRoot() + '/';
    const paths = this.app.vault.getFiles().map((f) => f.path).filter((p) => {
      if (p.startsWith(root)) return true;
      if (want.length) return want.some((w) => p === w || p.startsWith(w + '/'));
      return /(^|\/)[^/]*jb2a[^/]*\//i.test(p) || /(^|\/)spell effects\//i.test(p);
    });
    const files = indexFiles(paths);
    if (this.settings.jb2aOffer) {
      // every JB2A animation not in the vault yet (in any folder): offered, fetched when it is first used
      const have = new Set(paths.map((p) => { const i = p.indexOf('Library/'); return i >= 0 ? p.slice(i) : p; }));
      for (const j of jb2aFiles()) {
        if (have.has(j.rel)) continue;
        const f = indexFile(root + j.rel); if (!f) continue;
        f.remote = j.rel; if (j.thumb) f.thumb = j.thumb;
        files.push(f);
      }
    }
    this.files = files;
  }

  /** Makes sure an animation is in the vault (a JB2A one is fetched the first time); false when it can't be. */
  async ensureFile(path: string | undefined): Promise<boolean> {
    if (!path) return true;
    const f = this.files.find((x) => x.path === path);
    if (!f?.remote) return true;
    const n = new Notice(`Atlas Spell Effects: getting ${f.name.replace(/_/g, ' ')} from JB2A…`, 0);
    try {
      await fetchJb2a(this.app, this.jb2aRoot(), f.remote);
      delete f.remote;
      return true;
    } catch (e) {
      new Notice('Atlas Spell Effects: could not get that animation from JB2A (' + (e instanceof Error ? e.message : String(e)) + '). Drawn instead.', 8000);
      return false;
    } finally { n.hide(); }
  }

  /** Fetches every JB2A animation not in the vault yet (a few at a time; Stop ends it). */
  async downloadEverything(): Promise<void> {
    if (this.dl) return;
    this.dl = { done: 0, total: 0, failed: 0, stop: false };
    const dl = this.dl;
    const tell = () => this.dlListener?.();
    try {
      const r = await fetchAll(this.app, this.jb2aRoot(), (done, total, failed) => { dl.done = done; dl.total = total; dl.failed = failed; tell(); }, () => dl.stop);
      new Notice(`Atlas Spell Effects: ${dl.stop ? 'stopped after' : 'downloaded'} ${r.done} JB2A animations${r.failed ? `, ${r.failed} failed (Download everything again to retry them)` : ''}.`, 10000);
    } finally { this.dl = null; this.indexVault(); tell(); }
  }

  // ── Atlas ──
  atlasTabs(): Tab[] {
    const out: Tab[] = [];
    for (const leaf of this.app.workspace.getLeavesOfType(ATLAS_VIEW)) {
      const view = leaf.view as AtlasView;
      const rs = call(view?.serviceManager, 'getRendererService');
      const renderer = call(rs, 'getRenderer'), viewport = call<AtlasViewport>(rs, 'getViewport');
      const canvas = field(call(renderer, 'getAppInstance'), 'canvas');
      if (!view?.atlasStore || !renderer || !viewport || !(canvas instanceof HTMLCanvasElement)) continue;
      out.push({ leaf, view, store: view.atlasStore, renderer, viewport, canvas });
    }
    return out;
  }

  /** The Atlas tab you're working in: the active one, else the one showing. */
  atlasTab(): Tab | null {
    const all = this.atlasTabs();
    const active = this.app.workspace.getMostRecentLeaf?.();
    return all.find((t) => t.leaf === active) ?? all.find((t) => t.canvas.offsetParent !== null) ?? all[0] ?? null;
  }

  mapOf(t: Tab): string { return String(t.store.getState()?.mapPath ?? ''); }

  scaleOf(t: Tab): Scale {
    const gridSize = field(call(t.renderer, 'getGridOptions'), 'size');
    const cell = (typeof gridSize === 'number' ? gridSize : undefined) ?? t.store.getState()?.grid?.size ?? 70;
    // the map's measurement (units, feet per cell), as Atlas's drag ruler reads it
    const m = call<Measurement>(field(call(t.renderer, 'getTokenRenderer'), 'dragRuler'), 'settingsProvider');
    let feet = 5;
    const dist = m?.unitDistance;
    if (typeof dist === 'number' && Number.isFinite(dist) && dist > 0) {
      feet = m?.unitType === 'meters' ? dist / 0.3 : m?.unitType === 'yards' ? dist * 3 : dist;
    }
    return { cell, feetPerCell: feet };
  }

  tokenOf(t: Tab, id: string): TokenAt | null {
    const tok = t.store.getState()?.objects?.tokens?.[id];
    if (!tok || !Number.isFinite(tok.x) || !Number.isFinite(tok.y)) return null;
    const cell = this.scaleOf(t).cell;
    return { x: tok.x, y: tok.y, r: ((typeof tok.size === 'number' && tok.size > 0 ? tok.size : 1) * cell) / 2, rot: ((Number(tok.rotation) || 0) * Math.PI) / 180 };
  }

  tokenName(t: Tab, id: string): string { const tok = t.store.getState()?.objects?.tokens?.[id]; return String(tok?.name || tok?.label || 'a token'); }

  /** Snapping to the grid: the setting, turned round while Alt is held. */
  snapOn(ev?: { altKey?: boolean } | null): boolean { return this.settings.snap !== !!ev?.altKey; }

  /** A point on the grid's corners when snapping is on. */
  snapPoint(t: Tab, p: Point, ev?: { altKey?: boolean } | null): Point {
    if (!this.snapOn(ev)) return p;
    const g = t.store.getState()?.grid ?? {};
    return snapCorner(p, this.scaleOf(t).cell, { x: g.offsetX ?? 0, y: g.offsetY ?? 0 });
  }

  async toggleSnap(): Promise<void> { this.settings.snap = !this.settings.snap; await this.save(); new Notice(`Atlas Spell Effects: snap to grid ${this.settings.snap ? 'on' : 'off'} (hold Alt for the other)`); }

  tokenAt(t: Tab, p: Point): { id: string; x: number; y: number; r: number } | null {
    const tokens = t.store.getState()?.objects?.tokens ?? {};
    let best: { id: string; x: number; y: number; r: number; d: number } | null = null;
    for (const [id, tok] of Object.entries(tokens)) {
      if (!Number.isFinite(tok?.x) || tok.offMap) continue;
      const at = this.tokenOf(t, id); if (!at) continue;
      const d = Math.hypot(at.x - p.x, at.y - p.y);
      if (d <= at.r && (!best || d < best.d)) best = { id, ...at, d };
    }
    return best;
  }

  docs(): Document[] {
    const out = new Set<Document>([document]);
    for (const l of this.app.workspace.getLeavesOfType(PLAYER_VIEW)) { out.add(l.view.containerEl.ownerDocument); }
    for (const t of this.atlasTabs()) out.add(t.canvas.ownerDocument);
    return [...out];
  }

  /** Animations looked at, or being looked at, for where their picture is (see trim.ts). */
  private trimming = new Set<string>();
  private trimQueue: string[] = [];
  /** Where an animation's picture is in its frame: known, or looked at soon (one at a time). */
  trimOf(path: string): Trim | null {
    const known = this.settings.artTrim[path];
    if (known !== undefined) return known || null;
    if (!this.trimming.has(path)) {
      this.trimming.add(path); this.trimQueue.push(path);
      if (this.trimQueue.length === 1) void this.nextTrim();
    }
    return null;
  }
  private async nextTrim(): Promise<void> {
    const path = this.trimQueue[0]; if (!path) return;
    let got: Trim | null = null;
    const f = this.app.vault.getAbstractFileByPath(path);
    if (f instanceof TFile) { try { got = await measureArt(await this.app.vault.readBinary(f), path); } catch { got = null; } }
    this.settings.artTrim[path] = got ?? 0;
    this.saveSoon();
    this.wake();
    this.trimQueue.shift();
    if (this.trimQueue.length) void this.nextTrim();
  }

  private world(): World {
    return {
      trim: (path) => this.trimOf(path),
      scale: (map) => { const t = this.atlasTabs().find((x) => this.mapOf(x) === map); return t ? this.scaleOf(t) : null; },
      token: (map, id) => { const t = this.atlasTabs().find((x) => this.mapOf(x) === map); return t ? this.tokenOf(t, id) : null; },
      url: (path) => { const f = this.app.vault.getAbstractFileByPath(path); return f instanceof TFile ? this.app.vault.getResourcePath(f) : null; },
      tokens: (map, players) => {
        const t = this.atlasTabs().find((x) => this.mapOf(x) === map); if (!t) return [];
        const all = t.store.getState()?.objects?.tokens ?? {};
        const picked = new Set<string>(t.store.getState()?.selectedIds ?? []);
        const out: TokenAt[] = [];
        for (const [id, tok] of Object.entries(all)) {
          // the players see through to every token Atlas shows them (not hidden ones: a hole would give them away;
          // one out of their sight Atlas's own lighting and fog still hide, under the hole)
          if (players && (tok?.isHidden || tok?.offMap)) continue;
          const at = this.tokenOf(t, id); if (at) out.push(players ? at : { ...at, sel: picked.has(id), ...(tok.offMap ? { off: true } : {}) });
        }
        return out;
      },
    };
  }

  /** The layer over a DM tab's map canvas. */
  private tabSurface(t: Tab): Surface {
    return {
      doc: t.canvas.ownerDocument,
      layer: () => {
        const parent = t.canvas.parentElement; if (!parent || t.canvas.offsetParent === null) return null;
        let el = parent.querySelector<HTMLElement>(':scope > .sfx-layer');
        if (!el) {
          el = parent.createDiv({ cls: 'sfx-layer' });
          if (getComputedStyle(parent).position === 'static') parent.addClass('sfx-relative');
          t.canvas.insertAdjacentElement('afterend', el);
        }
        const k = `${t.canvas.offsetLeft}|${t.canvas.offsetTop}|${t.canvas.clientWidth}|${t.canvas.clientHeight}`;
        if (el.dataset.at !== k) { el.dataset.at = k; el.setCssStyles({ position: 'absolute', left: t.canvas.offsetLeft + 'px', top: t.canvas.offsetTop + 'px', width: t.canvas.clientWidth + 'px', height: t.canvas.clientHeight + 'px', transform: 'none' }); }
        return el;
      },
      mapping: (): Mapping | null => {
        const vp = t.viewport;
        const scale = vp?.scale?.x;
        const toScreen = vp?.toScreen?.bind(vp);
        if (!toScreen || !scale || !(scale > 0)) return null;
        return { toLocal: (x, y) => { const p = toScreen(x, y); return { x: p.x, y: p.y }; }, scale };
      },
      shows: (map) => this.mapOf(t) === map,
    };
  }

  /** The layer over the player window's canvas, turned with the TV; it follows what players see (their own view too). */
  private playerSurface(doc: Document): Surface {
    // what the players see, worked out once a frame (asked for by every effect drawn)
    let at = -1, seen: { t: Tab; pv: PlayersView } | null = null;
    const live = () => {
      if (at === this.frameNo) return seen;
      at = this.frameNo; seen = null;
      for (const t of this.atlasTabs()) { const pv = call<PlayersView>(t.renderer, 'playersView'); if (pv?.view) { seen = { t, pv }; break; } }
      return seen;
    };
    return {
      doc,
      layer: () => {
        const c = doc.getElementById(PLAYER_CANVAS) as HTMLCanvasElement | null; if (!c || !live()) return null;
        let el = doc.body.querySelector<HTMLElement>(':scope > .sfx-layer');
        // plain DOM only here: the player window may not have Obsidian's element helpers
        if (!el) el = doc.body.createDiv({ cls: 'sfx-layer sfx-tv' });
        const k = `${c.offsetWidth}|${c.offsetHeight}`;
        if (el.dataset.at !== k) { el.dataset.at = k; el.style.width = `${c.offsetWidth}px`; el.style.height = `${c.offsetHeight}px`; }
        return el;
      },
      mapping: (): Mapping | null => {
        const c = doc.getElementById(PLAYER_CANVAS) as HTMLCanvasElement | null; const l = live();
        const v = l?.pv.view;
        if (!c || !v) return null;
        const vw = v.right - v.left, vh = v.bottom - v.top;
        const bw = c.width, bh = c.height, boxW = c.offsetWidth, boxH = c.offsetHeight;
        if (!(vw > 0 && vh > 0 && bw > 0 && bh > 0)) return null;
        const s = Math.max(boxW / bw, boxH / bh);                 // object-fit: cover
        return { toLocal: (x, y) => ({ x: ((x - v.left) / vw * bw - bw / 2) * s + boxW / 2, y: ((y - v.top) / vh * bh - bh / 2) * s + boxH / 2 }), scale: bw / vw * s };
      },
      shows: (map) => { const l = live(); return !!l && this.mapOf(l.t) === map; },
      players: true,
    };
  }

  /** Starts the drawing loop when there is something to draw. */
  /**
   * The loop runs only while something changes (the camera, an effect, a token, the TV's view) and for a moment
   * after; then it sleeps until woken (Atlas changed, the map was panned or zoomed, an effect was touched). A
   * loop that never sleeps keeps the browser drawing every frame next to Atlas, which slows Atlas down.
   */
  wake(): void {
    this.still = 0;
    this.hook();
    if (this.loop) return;
    if (!this.effects.length && !this.placing) { this.clearPainters(); return; }
    const step = () => {
      this.loop = 0;
      this.frame();
      const busy = !!this.placing || !!this.dragging || this.lightMoving.size > 0 || this.effects.some((e) => !e.lasting);
      if (!this.effects.length && !this.placing) { this.clearPainters(); return; }
      // one loop only: a wake() during the frame has already asked for the next one
      if (!this.loop && (busy || this.still < 20)) this.loop = window.requestAnimationFrame(step);
    };
    this.loop = window.requestAnimationFrame(step);
  }
  /** Frames in a row with nothing changed. */
  private still = 0;
  private lastSig = '';
  private hooked = new WeakSet<object>();
  /** Wakes the loop on what moves things: Atlas's store, its camera, the TV window's pointer and wheel. */
  private hook(): void {
    const wake = () => this.wake();
    for (const t of this.atlasTabs()) {
      this.watchAtlasHistory(t);
      if (t.store && !this.hooked.has(t.store) && typeof t.store.subscribe === 'function') { this.hooked.add(t.store); this.register(t.store.subscribe(wake)); }
      const vp = t.viewport;
      if (vp && !this.hooked.has(vp) && typeof vp.on === 'function') {
        this.hooked.add(vp);
        for (const ev of ['moved', 'zoomed', 'moved-end', 'zoomed-end']) vp.on(ev, wake);
        this.register(() => { for (const ev of ['moved', 'zoomed', 'moved-end', 'zoomed-end']) vp.off?.(ev, wake); });
      }
    }
    for (const d of this.docs()) {
      if (this.hooked.has(d)) continue;
      this.hooked.add(d);
      const o = { capture: true, passive: true } as AddEventListenerOptions;
      for (const ev of ['pointermove', 'pointerdown', 'pointerup', 'wheel', 'keydown']) d.addEventListener(ev, wake, o);
      d.defaultView?.addEventListener('resize', wake);
      this.register(() => { for (const ev of ['pointermove', 'pointerdown', 'pointerup', 'wheel', 'keydown']) d.removeEventListener(ev, wake, o); d.defaultView?.removeEventListener('resize', wake); });
    }
  }
  /** Everything a frame draws from: when it is the same as last frame's, the loop can go to sleep. */
  private signature(): string {
    const parts: unknown[] = [this.effects, this.placing?.preview ?? null, this.selected?.ids ?? [], artInfo.size];
    for (const t of this.atlasTabs()) {
      const vp = t.viewport;
      parts.push(vp?.x, vp?.y, vp?.scale?.x, t.canvas?.clientWidth, t.canvas?.clientHeight, this.idOf(t.store?.getState?.()?.objects?.tokens));
      const pv = call<PlayersView>(t.renderer, 'playersView');
      if (pv?.view) parts.push(pv.view.left, pv.view.top, pv.view.right, pv.view.bottom);
    }
    return JSON.stringify(parts);
  }
  private ids = new WeakMap<object, number>(); private nextId = 1;
  private idOf(o: unknown): number { if (!o || typeof o !== 'object') return 0; let n = this.ids.get(o); if (!n) { n = this.nextId++; this.ids.set(o, n); } return n; }

  private clearPainters(): void { for (const p of this.painters.values()) p.stop(); for (const p of this.pixiPainters.values()) p.stop(); }

  /** One frame: instant effects run out, every surface is drawn. */
  frameNo = 0;
  frame(now = Date.now()): void {
    this.frameNo++;
    const sig = this.signature();
    if (sig === this.lastSig) this.still++; else { this.still = 0; this.lastSig = sig; }
    const out = new Set<string>();
    const before = this.effects.length;
    this.effects = this.effects.filter((e) => {
      if (e.lasting) return true;
      const ms = instantMs(e);
      if (now - e.started >= ms) return false;
      if (now - e.started >= ms - FADE_MS) out.add(e.id);
      return true;
    });
    if (this.effects.length !== before) this.saveSoon();
    const world = this.world();
    const live = new Set<object>();
    // in Atlas's own canvas, under the tokens, where it can be; else over it (the overlay)
    let inCanvas = false;
    for (const t of this.atlasTabs()) {
      const kit = this.noCanvas.has(t.viewport) ? null : kitOf(t.viewport);
      let mine = this.effects;
      if (kit) {
        let pp = this.pixiPainters.get(t.view);
        // Atlas's canvas went wrong for effects once: drawn over it from then on (as before)
        const giveUp = (e: unknown) => { this.noCanvas.add(t.viewport); this.pixiPainters.get(t.view)?.stop(); this.pixiPainters.delete(t.view); console.error('Atlas Spell Effects: drawing in Atlas’s canvas went wrong; drawing over it instead', e); this.wake(); };
        if (pp && !pp.cuts && kit.Graphics) { pp.stop(); this.pixiPainters.delete(t.view); pp = undefined; }   // now it can go over the lighting
        if (!pp) { pp = new PixiPainter(kit, t.viewport, t.renderer, world, (path) => this.readFile(path), () => this.wake(), giveUp); this.pixiPainters.set(t.view, pp); }
        const px = pp, map = this.mapOf(t);
        let fine = true;
        try { px.paint(this.effects, now, out, map); } catch (e) { fine = false; giveUp(e); }
        if (fine) { inCanvas = true; mine = this.effects.filter((e) => !PixiPainter.wants(e)); }
      }
      let p = this.painters.get(t.view); if (!p) { p = new Painter(this.tabSurface(t), world); this.painters.set(t.view, p); }
      const pl = this.placing;
      const dom = p, list = mine; this.safely('drawing over the map', () => dom.paint(list, now, out, pl && pl.tab.view === t.view ? pl.preview : null)); live.add(t.view);
    }
    for (const [k, p] of this.pixiPainters) if (!live.has(k)) { p.stop(); this.pixiPainters.delete(k); }
    // the TV is a copy of Atlas's canvas: effects in it reach the TV that way
    if (!inCanvas) for (const l of this.app.workspace.getLeavesOfType(PLAYER_VIEW)) {
      const doc = l.view.containerEl.ownerDocument;
      let p = this.painters.get(doc); if (!p) { p = new Painter(this.playerSurface(doc), world); this.painters.set(doc, p); }
      const pp = p; this.safely('drawing on the TV', () => pp.paint(this.effects, now, out, null)); live.add(doc);
    }
    for (const [k, p] of this.painters) if (!live.has(k)) { p.stop(); this.painters.delete(k); }
    // each on its own: one going wrong never stops the others (lights and walls are kept in step whatever happens)
    this.safely('selection', () => this.paintSelection());
    this.safely('lights', () => this.syncLights());
    this.safely('markers', () => this.hideMarkers());
    this.safely('walls', () => this.syncWalls());
  }

  /** The effects drawn in each Atlas tab's canvas. */
  private pixiPainters = new Map<object, PixiPainter>();
  /** Atlas canvases that wouldn't take effects (they are drawn over these). */
  private noCanvas = new WeakSet<object>();

  /** A vault file's bytes (null: not there). */
  async readFile(path: string): Promise<ArrayBuffer | null> {
    const f = this.app.vault.getAbstractFileByPath(path);
    return f instanceof TFile ? this.app.vault.readBinary(f) : null;
  }

  /** Runs one part of a frame; a failure is reported once (in the console) instead of stopping the rest. */
  private failed = new Set<string>();
  private safely(what: string, f: () => void): void {
    try { f(); }
    catch (e) {
      if (this.failed.has(what)) return;
      this.failed.add(what);
      console.error(`Atlas Spell Effects: ${what} went wrong`, e);
      new Notice(`Atlas Spell Effects: ${what} went wrong (${e instanceof Error ? e.message : String(e)}). The rest carries on.`, 12000);
    }
  }

  /** The picked effects' outlines (and one alone's controls), on the DM's view of their map. */
  private paintSelection(): void {
    const sel = this.selected;
    if (sel) { const ids = sel.ids.filter((id) => this.effects.some((e) => e.id === id)); if (ids.length !== sel.ids.length) this.selected = ids.length ? { ids, tab: sel.tab } : null; }
    const now = this.selected;
    for (const t of this.atlasTabs()) {
      const p = this.painters.get(t.view); if (!p) continue;
      const layer = p.surface.layer(), m = layer ? p.surface.mapping() : null;
      if (!now || now.tab.view !== t.view || !m) { paintHandles(layer, m, null); continue; }
      const sc = this.scaleOf(t);
      const list = this.effects.filter((e) => now.ids.includes(e.id) && e.map === this.mapOf(t)).flatMap((e) => {
        const tok = e.token ? this.tokenOf(t, e.token) : null;
        if (e.token && !tok) return [];
        return [controlsOf(e, sc, tok, this.boxFor(e, t), 1 / m.scale)];
      });
      paintHandles(layer, m, list);
    }
  }

  /** An effect's middle (where a box picks it): its centre, or a cone or line's middle. */
  middleOf(e: Effect, t: Tab): Point { const b = this.boxFor(e, t); return { x: b.cx, y: b.cy }; }

  // ── lights and darkness: real Atlas lights, kept with their effects ──
  private lightKeys = new Map<string, string>();      // effect id -> the light last written to Atlas
  private lightAt = new Map<string, number>();        // effect id -> when it was last written (moving ones: a few times a second)
  private mapSeen = new Map<string, number>();        // map -> when it was first seen open

  /** Atlas's write for a light, outside the undo history (Ctrl+Z is for the DM's own changes). */
  private untracked(t: Tab, fn: () => void): void {
    const h = t.store?.temporal?.getState?.();
    if (h && typeof h.untracked === 'function') h.untracked(fn); else fn();
  }

  /** Brings each effect's Atlas light up to date: made, moved, changed, removed. */
  syncLights(now = Date.now()): void {
    let saved = false;
    for (const t of this.atlasTabs()) {
      const st = t.store.getState?.(); if (!st || typeof st.addLight !== 'function') continue;
      const map = this.mapOf(t);
      const lights = st.objects?.lights ?? {};
      if (!this.mapSeen.has(map)) this.mapSeen.set(map, now);
      const seen = this.mapSeen.get(map)!;
      // lights of effects ended while this map was closed
      const orphans = this.settings.orphanLights.filter((o) => o.map === map);
      if (orphans.length) {
        for (const o of orphans) {
          if (o.wall) { if (st.objects?.walls?.[o.id]) this.untracked(t, () => st.deleteWall(o.id)); }
          else if (lights[o.id]) this.untracked(t, () => st.deleteLight(o.id));
        }
        this.settings.orphanLights = this.settings.orphanLights.filter((o) => o.map !== map); saved = true;
      }
      for (const e of this.effects) {
        if (e.map !== map) continue;
        // an older version's single light id: one of a list now
        if (e.lightId) { e.lightIds = [e.lightId]; delete e.lightId; }
        const ids = e.lightIds ?? [];
        const wants = !!e.light && e.lasting;
        if (!wants) {
          if (ids.length) { const have = ids.filter((id) => lights[id]); if (have.length) this.untracked(t, () => { for (const id of have) st.deleteLight(id); }); delete e.lightIds; this.lightKeys.delete(e.id); saved = true; }
          continue;
        }
        const tok = e.token ? this.tokenOf(t, e.token) : null;
        if (e.token && !tok) continue;
        // changed in Atlas's own light editor: kept with the spell (and on all of a wall's lights)
        const wrote = this.lightWritten.get(e.id)?.[0]?.emission as Record<string, unknown> | undefined;
        const now0 = ids.length ? lights[ids[0]]?.emission : undefined;
        if (wrote && now0 && ids.length === (this.lightWritten.get(e.id)?.length ?? -1) && adoptLook(e.light!, wrote, now0, e.shape === 'cone')) saved = true;
        const sc = this.scaleOf(t);
        const pls = placedLights(e, e.light!, this.boxFor(e, t), tok, pxPerFoot(sc), e.shape === 'wall' ? wallPieces(e, sc, tok, false) : []);
        const key = JSON.stringify(pls.map(lightKey));
        const inputs = pls.map((pl) => ({ x: pl.x, y: pl.y, rotation: pl.rotation, area: pl.area, emission: pl.emission }));
        const have = ids.filter((id) => lights[id]);
        if (ids.length && have.length === ids.length && ids.length === inputs.length) {
          // unchanged, and Atlas's lights still where they were put (dragged off by hand: put back)
          if (this.lightKeys.get(e.id) === key && have.every((id, n) => Math.abs(lights[id].x - inputs[n].x) < 0.5 && Math.abs(lights[id].y - inputs[n].y) < 0.5)) { this.lightMoving.delete(e.id); continue; }
          // A point light (darkness too) moves live, as Atlas's own do: only its place is written, and Atlas
          // traces a moving light cheaply until it rests. A light over a whole area (a line, a cube, a wall) is
          // worked out again in full by Atlas at every change, so it is written once it stands still a moment.
          const heavy = pls.some((pl) => !!pl.area);
          if (heavy) {
            if (this.dragging?.id === e.id) { this.wake(); continue; }
            const mv = this.lightMoving.get(e.id);
            if (!mv || mv.key !== key) { this.lightMoving.set(e.id, { key, since: now }); this.wake(); continue; }
            if (now - mv.since < 180) { this.wake(); continue; }
            this.lightMoving.delete(e.id);
          } else if (now - (this.lightAt.get(e.id) ?? 0) < 33) { this.wake(); continue; }
          // only what changed: a light that moves keeps its look
          const was = this.lightWritten.get(e.id) ?? [];
          const changes = inputs.map((input, n) => {
            const w = was[n];
            const change: Record<string, unknown> = { x: input.x, y: input.y };
            if (!w || JSON.stringify(w.rotation) !== JSON.stringify(input.rotation)) change['rotation'] = input.rotation;
            if (!w || JSON.stringify(w.area) !== JSON.stringify(input.area)) change['area'] = input.area;
            if (!w || JSON.stringify(w.emission) !== JSON.stringify(input.emission)) change['emission'] = input.emission;
            return { id: ids[n], change };
          });
          this.untracked(t, () => this.updateLights(t, changes));
        } else if (ids.length && !have.length && this.lightKeys.has(e.id)) {
          continue;                                              // removed in Atlas (deleted or undone): left so
        } else {
          // none yet, a different number (a wall reshaped), or a kept effect whose lights aren't there: made (again),
          // once the map has had a moment to load its own
          if (ids.length && !have.length && now - seen < 2500) { this.wake(); continue; }
          if (this.dragging?.id === e.id && ids.length) { this.wake(); continue; }
          const made: string[] = [];
          this.untracked(t, () => {
            for (const id of have) st.deleteLight(id);
            for (const input of inputs) {
              const { rotation, area, ...rest } = input;
              const id = st.addLight({ ...rest, ...(rotation !== undefined ? { rotation } : {}), ...(area ? { area } : {}) });
              if (id) made.push(id);
            }
          });
          if (!made.length) continue;
          e.lightIds = made; saved = true;
        }
        this.lightKeys.set(e.id, key); this.lightAt.set(e.id, now); this.lightWritten.set(e.id, inputs);
      }
    }
    if (saved) this.saveSoon();
  }
  /**
   * Several of Atlas's lights changed at once: one change to its map, so Atlas works its lighting out once, not
   * once a light. (Atlas's store takes a change as a draft to edit; a store that doesn't is written light by light.)
   */
  private updateLights(t: Tab, changes: { id: string; change: Record<string, unknown> }[]): void {
    const st = t.store.getState();
    if (changes.length < 2 || typeof t.store.setState !== 'function') { for (const c of changes) st.updateLight(c.id, c.change); return; }
    t.store.setState?.((d: AtlasState) => {
      for (const { id, change } of changes) {
        const l = d?.objects?.lights?.[id]; if (!l) continue;
        for (const [k, v] of Object.entries(change)) { if (v === undefined) delete l[k]; else l[k] = v; }
      }
    });
  }

  /** Atlas's markers for the lights of spells are hidden: the spell is what shows where it is. */
  private markerLayers = new WeakMap<object, CanvasNode | number>();
  hideMarkers(): void {
    for (const t of this.atlasTabs()) {
      const had = this.markerLayers.get(t.viewport);
      let layer: CanvasNode | null = typeof had === 'object' && !had.destroyed && had.parent ? had : null;
      if (!layer) {
        // looked for not long ago and not there: looked for again in a while
        if (typeof had === 'number' && Date.now() - had < 2000) continue;
        const look = (c: CanvasNode | null | undefined, depth: number): CanvasNode | null => {
          for (const ch of c?.children ?? []) { if (ch?.label === 'light-markers') return ch; if (depth > 0) { const f = look(ch, depth - 1); if (f) return f; } }
          return null;
        };
        layer = look(t.viewport, 3) ?? look(t.viewport?.parent, 3);
        if (!layer) { this.markerLayers.set(t.viewport, Date.now()); continue; }
        this.markerLayers.set(t.viewport, layer);
      }
      const lights = t.store.getState()?.objects?.lights ?? {};
      const ours = new Set<string>();
      const map = this.mapOf(t);
      for (const e of this.effects) if (e.map === map) for (const id of e.lightIds ?? []) { const l = lights[id]; if (l) ours.add(`${Math.round(l.x)},${Math.round(l.y)}`); }
      for (const m of layer.children ?? []) {
        const p = m?.position; if (!p) continue;
        const mine = ours.has(`${Math.round(p.x)},${Math.round(p.y)}`);
        if (mine && m.visible) { m.visible = false; m.sfxHidden = true; }
        else if (!mine && m.sfxHidden) { m.visible = true; m.sfxHidden = false; }
      }
    }
  }

  /** A light whose effect is moving: where it is now, and since when (it is written once it stays put). */
  private lightMoving = new Map<string, { key: string; since: number }>();
  /** What was last written for each light. */
  private lightWritten = new Map<string, { x: number; y: number; rotation?: number | undefined; area?: { x: number; y: number }[] | undefined; emission: unknown }[]>();

  private wallKeys = new Map<string, string>();       // effect id -> the walls last written to Atlas

  /** A wall effect's real Atlas walls: made, moved (once it is put down), changed, removed. */
  syncWalls(now = Date.now()): void {
    let saved = false;
    for (const t of this.atlasTabs()) {
      const st = t.store.getState?.(); if (!st || typeof st.addWall !== 'function') continue;
      const map = this.mapOf(t);
      const walls = st.objects?.walls ?? {};
      const seen = this.mapSeen.get(map) ?? now;
      for (const e of this.effects) {
        if (e.map !== map) continue;
        // a wall that blocks; or magical darkness, which nothing sees into, out of or through (light included)
        const dark = this.darkEdge(e, t);
        const wants = dark ? true : e.shape === 'wall' && e.lasting && !!e.blocks && e.blocks !== 'none';
        const have = (e.wallIds ?? []).filter((id) => walls[id]);
        if (!wants) {
          if (e.wallIds) { if (have.length) this.untracked(t, () => st.deleteWalls(have)); delete e.wallIds; this.wallKeys.delete(e.id); saved = true; }
          continue;
        }
        if (this.dragging?.id === e.id) continue;                   // while it is dragged: once it lands
        const tok = e.token ? this.tokenOf(t, e.token) : null;
        if (e.token && !tok) continue;
        const pts = dark ?? wallPoints(e, tok);
        const closed = dark ? true : !!e.closed;
        const blocks = dark ? 'sight' : e.blocks;
        const key = JSON.stringify([pts.map((p) => [Math.round(p.x), Math.round(p.y)]), closed, blocks]);
        if (e.wallIds?.length && have.length) {
          if (this.wallKeys.get(e.id) === key) { this.lightMoving.delete('w' + e.id); continue; }
          // moving (on a moving token): made again once it stands still a moment
          const mv = this.lightMoving.get('w' + e.id);
          if (!mv || mv.key !== key) { this.lightMoving.set('w' + e.id, { key, since: now }); this.wake(); continue; }
          if (now - mv.since < 180) { this.wake(); continue; }
          this.lightMoving.delete('w' + e.id);
          this.untracked(t, () => st.deleteWalls(have));
        } else if (e.wallIds?.length && this.wallKeys.has(e.id)) {
          continue;                                                  // removed in Atlas (deleted or undone): left so
        } else if (e.wallIds?.length && now - seen < 2500) { this.wake(); continue; }
        const ids: string[] = [];
        const n = closed && pts.length > 2 ? pts.length : pts.length - 1;
        this.untracked(t, () => {
          for (let i = 0; i < n; i++) {
            const p1 = pts[i], p2 = pts[(i + 1) % pts.length];
            if (Math.hypot(p2.x - p1.x, p2.y - p1.y) < 0.5) continue;
            const id = st.addWall({ type: 'solid', p1: { x: p1.x, y: p1.y }, p2: { x: p2.x, y: p2.y }, ...(blocks === 'sight' || blocks === 'movement' ? { blocks } : {}), chainId: 'sfx-' + e.id });
            if (id) ids.push(id);
          }
        });
        e.wallIds = ids; saved = true;
        this.wallKeys.set(e.id, key); this.lightAt.set('w' + e.id, now);
      }
    }
    if (saved) this.saveSoon();
  }

  /**
   * Magical darkness's edge, as corners of a closed ring of sight-blocking Atlas walls (null: not darkness that
   * lasts). Tokens can't see into it, out of it or across it, and light doesn't pass through it; they can still walk in.
   */
  darkEdge(e: Effect, t: Tab): Point[] | null {
    if (e.id === 'preview' || !e.lasting || e.light?.mode !== 'darkness' || e.shape === 'wall') return null;
    if (e.token && !this.tokenOf(t, e.token)) return null;
    const b = this.boxFor(e, t);
    const turn = (x: number, y: number): Point => ({ x: b.cx + x * Math.cos(b.rot) - y * Math.sin(b.rot), y: b.cy + x * Math.sin(b.rot) + y * Math.cos(b.rot) });
    const hw = b.w / 2, hh = b.h / 2;
    if (e.shape === 'radius' || e.shape === 'emanation') {
      // just outside the circle (the walls' straight pieces stay outside what is dark), one piece per ~5 ft
      const n = Math.max(12, Math.min(48, Math.round((Math.PI * b.w) / Math.max(1, this.scaleOf(t).cell))));
      const r = hw / Math.cos(Math.PI / n);
      return Array.from({ length: n }, (_, i) => ({ x: b.cx + r * Math.cos((2 * Math.PI * i) / n), y: b.cy + r * Math.sin((2 * Math.PI * i) / n) }));
    }
    if (e.shape === 'cone') return [turn(-hw, 0), turn(hw, -hh), turn(hw, hh)];
    return [turn(-hw, -hh), turn(hw, -hh), turn(hw, hh), turn(-hw, hh)];
  }

  /** An ended effect's light goes (now, or when its map is next open). */
  private dropLight(e: Effect): void {
    const t = this.atlasTabs().find((x) => this.mapOf(x) === e.map);
    const st = t?.store.getState?.();
    if (e.wallIds?.length) {
      const have = e.wallIds.filter((id) => st?.objects?.walls?.[id]);
      if (t && st && have.length) this.untracked(t, () => st.deleteWalls(have));
      else if (!t) for (const id of e.wallIds) this.settings.orphanLights.push({ map: e.map, id, wall: true });
      this.wallKeys.delete(e.id);
    }
    const ids = e.lightIds ?? (e.lightId ? [e.lightId] : []);
    if (!ids.length) return;
    const have = ids.filter((id) => st?.objects?.lights?.[id]);
    if (t && st && have.length) this.untracked(t, () => { for (const id of have) st.deleteLight(id); });
    else if (!t) for (const id of ids) this.settings.orphanLights.push({ map: e.map, id });
    this.lightKeys.delete(e.id);
  }

  // ── casting ──
  openCast(): void {
    if (!this.atlasTab()) { new Notice('Atlas Spell Effects: open an Atlas map first.'); return; }
    new CastModal(this.app, this).open();
  }

  remember(key: string, r: Remembered): void { this.settings.remember[key] = r; this.saveSoon(); }

  /** Click the caster / aim / click the spot on the Atlas map, then it plays. */
  place(pending: Pending, casterToken?: string): void {
    const tab = this.atlasTab();
    if (!tab) { new Notice('Atlas Spell Effects: open an Atlas map first.'); return; }
    this.placing?.stop();
    this.last = pending;
    if (pending.area.shape === 'wall') { this.drawWall(tab, pending); return; }
    if (pending.area.target) { this.castAt(tab, pending, casterToken); return; }
    const a = pending.area;
    const doc = tab.canvas.ownerDocument;
    const hint = (tab.canvas.parentElement ?? doc.body).createDiv({ cls: 'sfx-hint' });
    const needsCaster = a.from === 'caster';
    const aims = a.shape === 'cone' || a.shape === 'line' || (a.shape === 'cube' && a.from === 'caster');
    const say = () => { hint.textContent = `${pending.name}: ` + (needsCaster && !this.placing?.caster ? 'click the caster (a token, or a spot)' : aims ? 'aim and click' : 'click where it goes') + '   ·   Esc to stop'; };
    const toWorld = (e: PointerEvent | MouseEvent): Point | null => {
      const r = tab.canvas.getBoundingClientRect();
      if (e.clientX < r.left || e.clientY < r.top || e.clientX > r.right || e.clientY > r.bottom) return null;
      const p = call<Point>(tab.viewport, 'toWorld', e.clientX - r.left, e.clientY - r.top);
      return p && Number.isFinite(p.x) ? { x: p.x, y: p.y } : null;
    };
    let alt = false;
    const effectAt = (p: Point, id: string): Effect | null => {
      const map = this.mapOf(tab); const sc = this.scaleOf(tab);
      const base = { id, map, name: pending.name, shape: a.shape, size: a.size, ...(a.width ? { width: a.width } : {}), ...(a.shape === 'cone' ? { angle: a.angle ?? this.settings.coneAngle } : {}), colour: pending.colour, ...(pending.colour2 ? { colour2: pending.colour2 } : {}), ...(pending.alpha ? { alpha: pending.alpha } : {}), lasting: a.lasting, started: Date.now(), ...(pending.file ? { file: pending.file } : {}), ...(pending.light && id !== 'preview' ? { light: { ...pending.light } } : {}) };
      const c = this.placing?.caster;
      if (needsCaster && !c) {
        // before the caster is chosen: show the area on whatever is under the pointer
        const tok = this.tokenAt(tab, p);
        return { ...base, at: tok ? { x: tok.x, y: tok.y } : p, ...(aims ? { dir: 0 } : {}) };
      }
      if (aims && c) return { ...base, at: { x: c.x, y: c.y }, dir: dirTo(c, p), ...(c.token && (pending.attach || a.shape === 'cube') ? { token: c.token } : {}) };
      if (needsCaster && c) return { ...base, at: { x: c.x, y: c.y }, ...(c.token ? { token: c.token } : {}) };
      void sc;
      const at = a.shape === 'radius' || a.shape === 'cube' ? this.snapPoint(tab, p, { altKey: alt }) : p;
      return { ...base, at };
    };
    const move = (e: PointerEvent) => {
      alt = e.altKey;
      const p = toWorld(e); if (!p || !this.placing) return;
      this.placing.preview = effectAt(p, 'preview');
    };
    const down = (e: PointerEvent) => {
      const p = toWorld(e); if (!p || !this.placing) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      if (e.button === 2) { this.placing.stop(); return; }
      if (e.button !== 0) return;
      alt = e.altKey;
      if (needsCaster && !this.placing.caster) {
        const tok = this.tokenAt(tab, p);
        const q = tok ? p : this.snapPoint(tab, p, e);                 // a spot on empty ground lands on a grid corner
        this.placing.caster = tok ? { x: tok.x, y: tok.y, token: tok.id, r: tok.r } : { x: q.x, y: q.y, r: 0 };
        if (aims) { say(); this.placing.preview = effectAt(p, 'preview'); return; }
      }
      const fx = effectAt(p, uid()); this.placing.stop();
      if (fx) this.cast(fx);
    };
    const swallow = (e: Event) => { const pe = e as PointerEvent; if (toWorld(pe)) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); } };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); this.placing?.stop(); } };
    const opts = { capture: true } as AddEventListenerOptions;
    doc.addEventListener('pointermove', move, opts);
    doc.addEventListener('pointerdown', down, opts);
    doc.addEventListener('pointerup', swallow, opts);
    doc.addEventListener('click', swallow, opts);
    doc.addEventListener('contextmenu', swallow, opts);
    doc.addEventListener('keydown', key, opts);
    const stop = () => {
      doc.removeEventListener('pointermove', move, opts);
      doc.removeEventListener('pointerdown', down, opts);
      doc.removeEventListener('pointerup', swallow, opts);
      doc.removeEventListener('click', swallow, opts);
      doc.removeEventListener('contextmenu', swallow, opts);
      doc.removeEventListener('keydown', key, opts);
      hint.remove();
      if (this.placing?.tab === tab) this.placing = null;
    };
    this.placing = { tab, pending, caster: null, preview: null, stop: () => { stop(); this.bars(); }, hint };
    // cast from a creature's statblock: that creature is the caster already
    const ct = casterToken && needsCaster ? this.tokenOf(tab, casterToken) : null;
    if (ct) {
      this.placing.caster = { x: ct.x, y: ct.y, token: casterToken!, r: ct.r };
      if (!aims) { const fx = effectAt({ x: ct.x, y: ct.y }, uid()); this.placing.stop(); if (fx) this.cast(fx); return; }
    }
    this.bars();
    say();
    this.wake();
  }

  /**
   * Cast at creatures: click each target token (or a spot). `on`: the effect plays on it (and stays on it, for a
   * spell that lasts); `bolt`: it shoots from the caster (clicked first, or the statblock's creature) to it.
   * Keep clicking for more targets; Esc, Enter or a right-click when done.
   */
  private castAt(tab: Tab, pending: Pending, casterToken?: string): void {
    const a = pending.area;
    const bolt = a.target === 'bolt';
    const doc = tab.canvas.ownerDocument;
    const hint = (tab.canvas.parentElement ?? doc.body).createDiv({ cls: 'sfx-hint' });
    const ct = casterToken ? this.tokenOf(tab, casterToken) : null;
    let caster: { x: number; y: number } | null = ct ? { x: ct.x, y: ct.y } : null;
    let count = 0;
    const toWorld = (e: PointerEvent | MouseEvent): Point | null => {
      const r = tab.canvas.getBoundingClientRect();
      if (e.clientX < r.left || e.clientY < r.top || e.clientX > r.right || e.clientY > r.bottom) return null;
      const p = call<Point>(tab.viewport, 'toWorld', e.clientX - r.left, e.clientY - r.top);
      return p && Number.isFinite(p.x) ? { x: p.x, y: p.y } : null;
    };
    const say = () => {
      hint.textContent = `${pending.name}: ` + (bolt && !caster ? 'click the caster (a token, or a spot)   ·   Esc to stop'
        : count ? 'click another target, or Esc / right-click when done' : 'click a target (a creature, or a spot)   ·   Esc to stop');
    };
    const effect = (id: string, p: Point): Effect | null => {
      const tok = this.tokenAt(tab, p);
      const base = { id, map: this.mapOf(tab), name: pending.name, colour: pending.colour, ...(pending.colour2 ? { colour2: pending.colour2 } : {}), ...(pending.alpha ? { alpha: pending.alpha } : {}), started: Date.now(), ...(pending.file ? { file: pending.file } : {}) };
      if (bolt) {
        if (!caster) return null;
        const to = tok ? { x: tok.x, y: tok.y } : p;
        const len = Math.hypot(to.x - caster.x, to.y - caster.y) / pxPerFoot(this.scaleOf(tab));
        if (len < 1) return null;
        return { ...base, shape: 'line', size: Math.round(len * 10) / 10, width: a.width ?? 5, at: { x: caster.x, y: caster.y }, dir: dirTo(caster, to), lasting: false };
      }
      return { ...base, shape: 'emanation', size: a.size, at: tok ? { x: tok.x, y: tok.y } : p, ...(tok ? { token: tok.id } : {}), lasting: a.lasting, ...(pending.light && id !== 'preview' ? { light: { ...pending.light } } : {}) };
    };
    const move = (e: PointerEvent) => { const p = toWorld(e); if (!p || !this.placing) return; this.placing.preview = effect('preview', p); this.wake(); };
    const down = (e: PointerEvent) => {
      const p = toWorld(e); if (!p || !this.placing) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      if (e.button === 2) { this.placing.stop(); return; }
      if (e.button !== 0) return;
      if (bolt && !caster) {
        const tok = this.tokenAt(tab, p);
        caster = tok ? { x: tok.x, y: tok.y } : this.snapPoint(tab, p, e);
        say(); return;
      }
      const fx = effect(uid(), p);
      if (fx) { this.cast(fx); count++; }
      say();
    };
    const swallow = (e: Event) => { if (toWorld(e as PointerEvent)) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); } };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); this.placing?.stop(); } };
    const opts = { capture: true } as AddEventListenerOptions;
    const evs: [string, EventListener][] = [['pointermove', move as EventListener], ['pointerdown', down as EventListener], ['pointerup', swallow], ['click', swallow], ['contextmenu', swallow], ['keydown', key as EventListener]];
    for (const [k, f] of evs) doc.addEventListener(k, f, opts);
    const stop = () => {
      for (const [k, f] of evs) doc.removeEventListener(k, f, opts);
      hint.remove();
      if (this.placing?.tab === tab) this.placing = null;
    };
    this.placing = { tab, pending, caster: null, preview: null, stop: () => { stop(); this.bars(); this.wake(); }, hint };
    this.bars();
    say();
    this.wake();
  }

  /**
   * A wall: click its corners one after another (on grid corners when snapping), up to the spell's length;
   * Enter, a double-click or a right-click finishes it. A ring: click its centre.
   */
  private drawWall(tab: Tab, pending: Pending): void {
    const a = pending.area;
    const doc = tab.canvas.ownerDocument;
    const hint = (tab.canvas.parentElement ?? doc.body).createDiv({ cls: 'sfx-hint' });
    const round = !!a.round && (a.ring ?? 0) > 0;
    const ppf = () => pxPerFoot(this.scaleOf(tab));
    const max = () => a.size * ppf();
    const pts: Point[] = [];
    let next: Point | null = null;
    const toWorld = (e: PointerEvent | MouseEvent): Point | null => {
      const r = tab.canvas.getBoundingClientRect();
      if (e.clientX < r.left || e.clientY < r.top || e.clientX > r.right || e.clientY > r.bottom) return null;
      const p = call<Point>(tab.viewport, 'toWorld', e.clientX - r.left, e.clientY - r.top);
      return p && Number.isFinite(p.x) ? { x: p.x, y: p.y } : null;
    };
    const wall = (id: string, path: Point[], closed: boolean): Effect => ({
      id, map: this.mapOf(tab), name: pending.name, shape: 'wall', size: closed ? a.ring ?? a.size : a.size, width: a.width ?? 1,
      at: path[0], points: path.map((p) => ({ x: p.x - path[0].x, y: p.y - path[0].y })), ...(closed ? { closed: true } : {}),
      ...(a.blocks && a.blocks !== 'none' && id !== 'preview' ? { blocks: a.blocks } : {}),
      colour: pending.colour, ...(pending.colour2 ? { colour2: pending.colour2 } : {}), ...(pending.alpha ? { alpha: pending.alpha } : {}), lasting: a.lasting, started: Date.now(), ...(pending.file ? { file: pending.file } : {}),
      ...(pending.light && id !== 'preview' ? { light: { ...pending.light } } : {}),
    });
    const ring = (id: string, c: Point): Effect => wall(id, ringPoints(a.ring!, this.scaleOf(tab)).map((p) => ({ x: c.x + p.x, y: c.y + p.y })), true);
    const say = () => {
      const used = Math.round(pathLength(next ? [...pts, next] : pts) / ppf());
      hint.textContent = `${pending.name}: ` + (round ? 'click the ring’s centre'
        : !pts.length ? `click where the wall starts (up to ${a.size} ft)`
        : `click the next corner · ${used} of ${a.size} ft · Enter, double-click or right-click to finish · Backspace takes a corner back`) + '   ·   Esc to stop';
    };
    const show = () => {
      if (!this.placing) return;
      if (round) this.placing.preview = next ? ring('preview', next) : null;
      else this.placing.preview = pts.length && next ? wall('preview', [...pts, next], false) : null;
      say(); this.wake();
    };
    const finish = () => {
      const path = pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) > 0.5);
      this.placing?.stop();
      if (path.length >= 2) this.cast(wall(uid(), path, false));
    };
    const aim = (e: PointerEvent | MouseEvent, p: Point): Point => {
      const q = this.snapPoint(tab, p, e);
      return round || !pts.length ? q : within(pts, q, max());
    };
    const move = (e: PointerEvent) => { const p = toWorld(e); if (!p || !this.placing) return; next = aim(e, p); show(); };
    const down = (e: PointerEvent) => {
      const p = toWorld(e); if (!p || !this.placing) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      if (e.button === 2) { if (pts.length >= 2) finish(); else this.placing.stop(); return; }
      if (e.button !== 0) return;
      const q = aim(e, p);
      if (round) { this.placing.stop(); this.cast(ring(uid(), q)); return; }
      const last = pts[pts.length - 1];
      if (last && Math.hypot(q.x - last.x, q.y - last.y) < 1) { finish(); return; }   // the same spot again: a double-click
      pts.push(q); next = q;
      if (pathLength(pts) >= max() - 0.5) { finish(); return; }                       // as long as the spell allows
      show();
    };
    const swallow = (e: Event) => { if (toWorld(e as PointerEvent)) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); } };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); this.placing?.stop(); }
      else if (e.key === 'Enter') { e.preventDefault(); finish(); }
      else if (e.key === 'Backspace' && pts.length) { e.preventDefault(); pts.pop(); show(); }
    };
    const opts = { capture: true } as AddEventListenerOptions;
    const evs: [string, EventListener][] = [['pointermove', move as EventListener], ['pointerdown', down as EventListener], ['pointerup', swallow], ['click', swallow], ['dblclick', swallow], ['contextmenu', swallow], ['keydown', key as EventListener]];
    for (const [k, f] of evs) doc.addEventListener(k, f, opts);
    const stop = () => {
      for (const [k, f] of evs) doc.removeEventListener(k, f, opts);
      hint.remove();
      if (this.placing?.tab === tab) this.placing = null;
    };
    this.placing = { tab, pending, caster: null, preview: null, stop: () => { stop(); this.bars(); this.wake(); }, hint };
    this.bars();
    say();
    this.wake();
  }

  /** An effect was changed: draw it again, keep it (lasting ones), and bring the toolbar up to date. */
  changed(): void { this.saveSoon(); this.wake(); window.setTimeout(() => this.bars(), 0); }

  /** An effect's look changed (another animation or colour): its elements are made again. */
  refresh(id: string): void { for (const p of this.painters.values()) p.forget(id); this.wake(); }

  /** Click a token on the map (Esc stops); `done` gets its id. */
  pickToken(tab: Tab, prompt: string, done: (id: string) => void): void {
    this.placing?.stop();
    const doc = tab.canvas.ownerDocument;
    const hint = (tab.canvas.parentElement ?? doc.body).createDiv({ cls: 'sfx-hint', text: prompt + '   ·   Esc to stop' });
    const opts = { capture: true } as AddEventListenerOptions;
    const stop = () => { doc.removeEventListener('pointerdown', down, opts); doc.removeEventListener('keydown', key, opts); doc.removeEventListener('click', eat, opts); hint.remove(); };
    const eat = (e: Event) => { const r = tab.canvas.getBoundingClientRect(); const pe = e as MouseEvent; if (pe.clientX >= r.left && pe.clientX <= r.right && pe.clientY >= r.top && pe.clientY <= r.bottom) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); } };
    const down = (e: PointerEvent) => {
      const r = tab.canvas.getBoundingClientRect();
      if (e.clientX < r.left || e.clientY < r.top || e.clientX > r.right || e.clientY > r.bottom) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      const w = call<Point>(tab.viewport, 'toWorld', e.clientX - r.left, e.clientY - r.top);
      const tok = w ? this.tokenAt(tab, { x: w.x, y: w.y }) : null;
      if (!tok) { hint.textContent = 'That is not a token. ' + prompt + '   ·   Esc to stop'; return; }
      stop(); window.setTimeout(() => doc.removeEventListener('click', eat, opts), 0); doc.addEventListener('click', eat, opts);
      done(tok.id);
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); stop(); } };
    doc.addEventListener('pointerdown', down, opts); doc.addEventListener('keydown', key, opts); doc.addEventListener('click', eat, opts);
  }

  cast(e: Effect): void {
    window.setTimeout(() => this.bars(), 0);
    const before = this.snapshot();
    this.effects.push(e);
    if (e.lasting) { this.commit(before); this.saveSoon(); }
    this.wake();
  }

  end(id: string): void { this.endMany([id]); }

  /** Ends these effects (one undo step). */
  endMany(ids: string[]): void {
    window.setTimeout(() => this.bars(), 0);
    const before = this.snapshot();
    for (const e of this.effects) if (ids.includes(e.id)) this.dropLight(e);
    this.effects = this.effects.filter((e) => !ids.includes(e.id));
    this.commit(before);
    this.saveSoon(); this.wake();
  }

  // ── undo and redo: the add-on's own steps, taken in turn with Atlas's (whichever was last) ──
  private undoSteps: { at: number; before: string; after: string }[] = [];
  private redoSteps: { at: number; before: string; after: string }[] = [];
  private travelling = false;
  /** When each of Atlas's undo (and redo) steps was made, per map view: to tell whose step is the latest. */
  private atlasTimes = new WeakMap<object, { past: number[]; future: number[]; p: number; f: number }>();

  /** The lasting effects as they are (what undo puts back); the Atlas lights and walls they keep are left out. */
  snapshot(): string {
    return JSON.stringify(this.effects.filter((e) => e.lasting).map((e) => { const { lightId, lightIds, wallIds, ...rest } = e; void lightId; void lightIds; void wallIds; return rest; }));
  }
  /** Something was done since `before`: an undo step, if it changed anything. */
  commit(before: string): void {
    if (this.travelling) return;
    const after = this.snapshot();
    if (after === before) return;
    this.undoSteps.push({ at: Date.now(), before, after });
    if (this.undoSteps.length > 100) this.undoSteps.shift();
    this.redoSteps = [];
  }
  /** Puts the lasting effects back as a snapshot has them (their lights and walls follow). */
  private restore(snap: string): void {
    const want = JSON.parse(snap) as Effect[];
    const now = new Map(this.effects.filter((e) => e.lasting).map((e) => [e.id, e]));
    const keep = new Set(want.map((e) => e.id));
    for (const e of now.values()) if (!keep.has(e.id)) this.dropLight(e);
    const back = want.map((w) => {
      const had = now.get(w.id);
      return { ...w, ...(had?.lightIds ? { lightIds: had.lightIds } : {}), ...(had?.wallIds ? { wallIds: had.wallIds } : {}) } as Effect;
    });
    for (const e of back) { if (!now.has(e.id)) { this.lightKeys.delete(e.id); this.wallKeys.delete(e.id); } for (const p of this.painters.values()) p.forget(e.id); }
    this.effects = [...this.effects.filter((e) => !e.lasting), ...back];
    if (this.selected) { const ids = this.selected.ids.filter((id) => keep.has(id)); this.selected = ids.length ? { ids, tab: this.selected.tab } : null; }
    this.saveSoon(); this.wake(); window.setTimeout(() => this.bars(), 0);
  }
  undo(): boolean {
    const s = this.undoSteps.pop(); if (!s) return false;
    this.travelling = true; try { this.restore(s.before); } finally { this.travelling = false; }
    this.redoSteps.push({ ...s, at: Date.now() });
    return true;
  }
  redo(): boolean {
    const s = this.redoSteps.pop(); if (!s) return false;
    this.travelling = true; try { this.restore(s.after); } finally { this.travelling = false; }
    this.undoSteps.push({ ...s, at: Date.now() });
    return true;
  }
  /** Notes when Atlas makes, undoes and redoes its steps (its history store's stacks growing and shrinking). */
  private watchAtlasHistory(t: Tab): void {
    const h = t.store?.temporal;
    if (!h || typeof h.subscribe !== 'function' || this.atlasTimes.has(h)) return;
    const st = h.getState?.() ?? {};
    const rec = { past: [] as number[], future: [] as number[], p: st.pastStates?.length ?? 0, f: st.futureStates?.length ?? 0 };
    this.atlasTimes.set(h, rec);
    this.register(h.subscribe((s) => {
      const p = s?.pastStates?.length ?? 0, f = s?.futureStates?.length ?? 0, now = Date.now();
      for (let i = rec.p; i < p; i++) rec.past.push(now);
      for (let i = p; i < rec.p; i++) rec.past.pop();
      for (let i = rec.f; i < f; i++) rec.future.push(now);
      for (let i = f; i < rec.f; i++) rec.future.pop();
      rec.p = p; rec.f = f;
    }));
  }
  /** Ctrl+Z (or Atlas's Undo button): the add-on's step when it is the latest, else Atlas's own. True: done here. */
  undoOrRedo(redo: boolean): boolean {
    const t = this.atlasTab(); if (!t) return false;
    this.watchAtlasHistory(t);
    const times = t.store?.temporal ? this.atlasTimes.get(t.store.temporal) : undefined;
    const theirs = (redo ? times?.future : times?.past)?.at(-1) ?? -1;
    const atlasHas = redo ? (t.store?.temporal?.getState?.()?.futureStates?.length ?? 0) > 0 : (t.store?.temporal?.getState?.()?.pastStates?.length ?? 0) > 0;
    const mine = (redo ? this.redoSteps : this.undoSteps).at(-1);
    if (!mine) return false;
    if (atlasHas && theirs > mine.at) return false;               // Atlas's step is the more recent: Atlas takes it
    return redo ? this.redo() : this.undo();
  }

  endAllHere(): void {
    const t = this.atlasTab(); if (!t) return;
    const map = this.mapOf(t);
    const n = this.effects.filter((e) => e.map === map && e.lasting).length;
    const before = this.snapshot();
    for (const e of this.effects) if (e.map === map && e.lasting) this.dropLight(e);
    this.effects = this.effects.filter((e) => e.map !== map || !e.lasting);
    this.commit(before);
    this.saveSoon(); this.wake(); this.bars();
    new Notice(`Atlas Spell Effects: ended ${n} lasting effect${n === 1 ? '' : 's'}`);
  }

  /**
   * How to tell an effect from others: its name (numbered when several share it, oldest first) and what sets it
   * apart: its size, whom it is on or which token it is nearest, how long ago it was cast.
   */
  labelOf(fx: Effect, among: Effect[]): { name: string; detail: string } {
    const same = among.filter((e) => e.name === fx.name).sort((a, b) => a.started - b.started);
    const name = same.length > 1 ? `${fx.name} #${same.indexOf(fx) + 1}` : fx.name;
    const t = this.atlasTabs().find((x) => this.mapOf(x) === fx.map);
    const bits: string[] = [fx.shape === 'wall' ? 'wall' : describe({ shape: fx.shape, size: fx.size, ...(fx.width ? { width: fx.width } : {}), from: 'point', lasting: true })];
    if (t) {
      if (fx.token) bits.push(`on ${this.tokenName(t, fx.token)}`);
      else {
        // the nearest token, and how far: "10 ft from Bandit"
        const b = this.boxFor(fx, t); const ppf = pxPerFoot(this.scaleOf(t));
        let best: { id: string; d: number } | null = null;
        for (const id of Object.keys(t.store.getState()?.objects?.tokens ?? {})) {
          const tok = this.tokenOf(t, id); if (!tok) continue;
          const d = Math.max(0, Math.hypot(tok.x - b.cx, tok.y - b.cy) - tok.r);
          if (!best || d < best.d) best = { id, d };
        }
        if (best) { const ft = Math.round(best.d / ppf / 5) * 5; bits.push(ft <= 5 ? `by ${this.tokenName(t, best.id)}` : `${ft} ft from ${this.tokenName(t, best.id)}`); }
      }
    }
    const min = Math.round((Date.now() - fx.started) / 60000);
    bits.push(min < 1 ? 'just now' : min < 60 ? `${min} min ago` : `${Math.round(min / 60)} h ago`);
    return { name, detail: bits.join(' · ') };
  }

  /** Opens Atlas's own editor (its popover, with its range rings) on an effect's light. */
  editAtlasLight(fx: Effect): void {
    const t = this.atlasTabs().find((x) => this.mapOf(x) === fx.map);
    const id = fx.lightIds?.find((l) => t?.store.getState()?.objects?.lights?.[l]);
    if (!t || !id) { new Notice('This spell’s light isn’t on the map yet.'); return; }
    const st = t.store.getState();
    if (typeof st.openLightPopover === 'function') st.openLightPopover(id);
    else new Notice('This version of Atlas can’t open its light editor from here.');
  }

  /** Outlines an effect on its map while the pointer is over its name (a menu or the end window); `null`: as it was. */
  private shownBefore: { ids: string[]; tab: Tab } | null | undefined;
  showOnMap(fx: Effect | null): void {
    if (fx) {
      const t = this.atlasTabs().find((x) => this.mapOf(x) === fx.map); if (!t) return;
      if (this.shownBefore === undefined) this.shownBefore = this.selected;
      this.selected = { ids: [fx.id], tab: t };
    } else if (this.shownBefore !== undefined) {
      this.selected = this.shownBefore && this.shownBefore.ids.some((id) => this.effects.some((e) => e.id === id)) ? this.shownBefore : null;
      this.shownBefore = undefined;
    }
    this.wake();
  }

  lastingHere(): Effect[] { const t = this.atlasTab(); const map = t ? this.mapOf(t) : ''; return this.effects.filter((e) => e.lasting && e.map === map); }
}



const SHAPE_LABEL: Record<Shape, string> = { radius: 'Sphere', emanation: 'Around caster', cone: 'Cone', cube: 'Cube', line: 'Line', wall: 'Wall' };

/** What the animation-and-colour picker shows, and how it hands back a choice. */
interface LookCtx {
  app: App; plugin: AtlasSpellEffects; name: string; shape: Shape; size: number; file: string | undefined; colour: string; fileQuery: string;
  colour2?: string | undefined; alpha?: number | undefined; angle?: number | undefined;
  set(change: { file?: string | undefined; colour?: string; colour2?: string | undefined; alpha?: number | undefined; fileQuery?: string }, rerender: boolean): void;
}

/**
 * The animation (pictures to pick from, a search for any) in `anim`, and its colour and opacity in `colour`:
 * shared by the cast and edit windows. The first picture is always the drawn effect, in its shape and colours.
 */
function lookPicker(anim: HTMLElement, colourEl: HTMLElement, c: LookCtx): void {
  const P = c.plugin;
  const ah = anim.createDiv({ cls: 'sfx-section-head' });
  ah.createSpan({ cls: 'sfx-label', text: 'Animation' });
  const fq = ah.createEl('input', { type: 'search', placeholder: 'Search all animations…', value: c.fileQuery, cls: 'sfx-push' });
  fq.onchange = () => c.set({ fileQuery: fq.value }, true);
  const tiles = anim.createDiv({ cls: 'sfx-grid' });
  // first: drawn by the add-on, as it will look
  const drawn = tiles.createDiv({ cls: 'sfx-tile sfx-tile-drawn' + (!c.file ? ' is-on' : '') });
  drawn.title = 'Drawn by the add-on in your colours: no animation file';
  const dt = drawn.createDiv({ cls: 'sfx-thumb' });
  const sample = drawnSample(dt, c.shape, c.colour, c.colour2, c.alpha, c.angle);
  dt.createSpan({ cls: 'sfx-badge', text: 'Custom' });
  drawn.createSpan({ cls: 'sfx-tile-name', text: 'Drawn' });
  drawn.onclick = () => c.set({ file: undefined }, true);
  const cur = c.file ? P.files.find((x) => x.path === c.file) : undefined;
  const found = c.fileQuery ? search(c.fileQuery, P.files, 36).map((file) => ({ file })) : matchesFor(c.name, c.shape, P.files, 23);
  if (cur && !found.some((m) => m.file.family === cur.family)) found.unshift({ file: cur });
  for (const m of found) {
    const t = tiles.createDiv({ cls: 'sfx-tile' + (cur && cur.family === m.file.family ? ' is-on' : '') });
    t.title = m.file.path;
    const tf = c.app.vault.getAbstractFileByPath(m.file.path);
    const url = tf instanceof TFile ? c.app.vault.getResourcePath(tf) : '';
    const th = t.createDiv({ cls: 'sfx-thumb' });
    if (m.file.remote) {
      // not downloaded yet: JB2A's still preview, and a mark that it comes when used
      t.title = m.file.path + '\nFrom JB2A: downloaded when you use it';
      if (m.file.thumb) { const i = th.createEl('img'); i.src = m.file.thumb; i.loading = 'lazy'; i.onerror = () => i.remove(); }
      const dl = th.createSpan({ cls: 'sfx-dl' }); setIcon(dl, 'download');
    } else if (m.file.video) {
      const v = th.createEl('video'); v.muted = true; v.loop = true; v.preload = 'metadata'; v.src = url + '#t=0.6';
      t.onmouseenter = () => { void v.play()?.catch?.(() => undefined); }; t.onmouseleave = () => v.pause();
    } else { const i = th.createEl('img'); i.src = url; }
    t.createSpan({ cls: 'sfx-tile-name', text: m.file.name.replace(/_\d+x\d+$/, '').replace(/_/g, ' ') });
    t.onclick = () => c.set({ file: m.file.path }, true);
  }
  if (!found.length && c.fileQuery) anim.createDiv({ cls: 'sfx-empty', text: 'No animation by that name.' });

  // colour and opacity
  const row = colourEl.createDiv({ cls: 'sfx-fields sfx-flush sfx-colours' });
  if (cur) {
    row.createSpan({ cls: 'sfx-label sfx-flush', text: 'Colour' });
    const sw = row.createDiv({ cls: 'sfx-swatches' });
    const cols = coloursOf(cur, P.files, c.size);
    for (const k of cols) { const b = sw.createEl('button', { text: k.colour, cls: k.file.path === c.file ? 'is-on' : '' }); b.onclick = () => c.set({ file: k.file.path }, true); }
    if (cols.length <= 1) sw.createSpan({ cls: 'sfx-muted', text: 'This animation comes in one colour' });
  } else {
    // drawn: a colour at its heart and one at its edge (or one colour for both)
    const sw = row.createDiv({ cls: 'sfx-swatches' });
    sw.createSpan({ cls: 'sfx-label sfx-flush', text: 'Inner' });
    const k = sw.createEl('input', { type: 'color', value: c.colour }); k.title = 'The colour at its heart';
    sw.createSpan({ cls: 'sfx-label sfx-flush', text: 'Outer' });
    const k2 = sw.createEl('input', { type: 'color', value: c.colour2 ?? c.colour }); k2.title = 'The colour at its edge';
    k2.disabled = !c.colour2;
    const ml = sw.createEl('label', { cls: 'sfx-toggle' }); const match = ml.createEl('input', { type: 'checkbox' }); match.checked = !c.colour2; ml.appendText('Outer matches inner');
    k.oninput = () => { sample.style.setProperty('--c', k.value); if (match.checked) { k2.value = k.value; } c.set({ colour: k.value }, false); };
    k2.oninput = () => { sample.style.setProperty('--c2', k2.value); c.set({ colour2: k2.value }, false); };
    match.onchange = () => {
      k2.disabled = match.checked;
      if (match.checked) { k2.value = k.value; sample.style.removeProperty('--c2'); c.set({ colour2: undefined }, false); }
      else { sample.style.setProperty('--c2', k2.value); c.set({ colour2: k2.value }, false); }
    };
  }
  // how see-through, drawn or animated
  const op = row.createDiv({ cls: 'sfx-opacity' });
  op.createSpan({ cls: 'sfx-label sfx-flush', text: 'Opacity' });
  const a = op.createEl('input', { type: 'range', value: String(Math.round((c.alpha ?? 1) * 100)) }); a.min = '10'; a.max = '100'; a.step = '5';
  const av = op.createSpan({ cls: 'sfx-num', text: `${Math.round((c.alpha ?? 1) * 100)}%` });
  a.oninput = () => { av.setText(`${a.value}%`); const v = Number(a.value) / 100; sample.style.setProperty('--sfx-alpha', String(Math.max(0.05, v))); c.set({ alpha: v >= 1 ? undefined : v }, false); };
}

/** What a wall's real Atlas walls stop: nothing (drawn only), sight, movement, or everything. */
function wallsPicker(pane: HTMLElement, blocks: WallBlocks | undefined, lasting: boolean, set: (b: WallBlocks) => void): void {
  const box = pane.createDiv({ cls: 'sfx-walls' });
  box.createDiv({ cls: 'sfx-label', text: 'Atlas walls' });
  const seg = box.createDiv({ cls: 'sfx-seg' });
  const on = blocks ?? 'none';
  const opts: [WallBlocks, string, string][] = [
    ['none', 'None', 'Only drawn: nothing is stopped'],
    ['sight', 'Blocks sight', 'Stops sight (Wall of Fire, Wall of Thorns): tokens can still cross it'],
    ['movement', 'Blocks movement', 'Stops tokens, but sight and light pass (Wall of Force)'],
    ['solid', 'Solid', 'Stops sight, light and tokens (Wall of Stone, Wall of Ice)'],
  ];
  for (const [k, t, tip] of opts) { const b = seg.createEl('button', { text: t, cls: on === k ? 'is-on' : '' }); b.title = tip; b.onclick = () => set(k); }
  if (on !== 'none') {
    const f = box.createDiv({ cls: 'sfx-fields' });
    const n = f.createSpan({ cls: 'sfx-chip', text: lasting ? 'Real Atlas walls along it while it lasts; they go when it ends' : 'Only on lasting effects: tick “Lasts until ended”' });
    if (!lasting) n.addClass('sfx-warn');
  }
}

/** Whether a point is inside a polygon (a lasso). */
function inPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Light or darkness from the area: a real Atlas light while the effect lasts. */
function lightPicker(pane: HTMLElement, light: EffectLight | null, lasting: boolean, set: (l: EffectLight | null) => void): void {
  const box = pane.createDiv({ cls: 'sfx-light' });
  box.createDiv({ cls: 'sfx-label', text: 'Light' });
  const seg = box.createDiv({ cls: 'sfx-seg' });
  const mode = light?.mode ?? 'none';
  const opts: [string, string][] = [['none', 'None'], ['light', 'Gives light'], ['darkness', 'Magical darkness']];
  for (const [k, t] of opts) {
    const b = seg.createEl('button', { text: t, cls: mode === k ? 'is-on' : '' });
    b.onclick = () => set(k === 'none' ? null : k === 'darkness' ? { mode: 'darkness', bright: 0, dim: light?.dim ?? 15 } : { mode: 'light', bright: light?.mode === 'light' ? light.bright : 20, dim: light?.mode === 'light' ? light.dim : 40, ...(light?.colour ? { colour: light.colour } : {}) });
  }
  const f = box.createDiv({ cls: 'sfx-fields' });
  if (light?.mode === 'light') {
    f.createSpan({ text: 'Bright' });
    const b = f.createEl('input', { type: 'number', value: String(light.bright) }); b.min = '0';
    f.createSpan({ text: 'ft, dim to' });
    const d = f.createEl('input', { type: 'number', value: String(light.dim) }); d.min = '0';
    f.createSpan({ text: 'ft' });
    const c = f.createEl('input', { type: 'color', value: light.colour || LIGHT_COLOUR }); c.title = 'The light’s colour';
    const upd = () => { const bv = Math.max(0, Number(b.value) || 0), dv = Math.max(bv, Number(d.value) || 0); light.bright = bv; light.dim = dv || bv; light.colour = c.value; set(light); };
    b.onchange = upd; d.onchange = upd; c.onchange = upd;
  }
  if (light) {
    const n = f.createSpan({ cls: 'sfx-chip', text: !lasting ? 'Only on lasting effects: tick “Lasts until ended”' : light.mode === 'darkness' ? 'Atlas’s magical darkness over the area, while it lasts (needs scene lighting on)' : 'A real Atlas light while it lasts (needs scene lighting on)' });
    if (!lasting) n.addClass('sfx-warn');
  }
}

/** Double-click an effect: change it as it stands on the map (every change shows at once, on the TV too). */
class EditModal extends Modal {
  private fileQuery = '';
  constructor(app: App, private readonly plugin: AtlasSpellEffects, private readonly id: string, private readonly tab: Tab) { super(app); }
  private fx(): Effect | undefined { return this.plugin.effects.find((e) => e.id === this.id); }
  /** The effects as they were when the editor opened: all its changes are one undo step. */
  private before = '';
  private ended = false;
  onOpen(): void {
    this.modalEl.addClass('sfx-modal'); this.modalEl.addClass('sfx-edit');
    this.before = this.plugin.snapshot();
    this.render();
  }
  private changed(rerender = false): void { this.plugin.changed(); if (rerender) this.render(); }
  private render(): void {
    const fx = this.fx(); const el = this.contentEl; el.empty();
    if (!fx) { this.close(); return; }
    const P = this.plugin, t = this.tab;
    this.titleEl.setText('Edit effect');
    const pane = el.createDiv({ cls: 'sfx-pane' });
    const head = pane.createDiv({ cls: 'sfx-head' });
    const name = head.createEl('input', { type: 'text', value: fx.name }); name.oninput = () => { fx.name = name.value || 'Effect'; this.changed(); };
    head.createSpan({ cls: 'sfx-chip', text: SHAPE_LABEL[fx.shape] });
    const body = pane.createDiv({ cls: 'sfx-body' });
    const bottom = pane.createDiv({ cls: 'sfx-bottom' });

    // size and turn
    const sz = body.createDiv(); sz.createDiv({ cls: 'sfx-label', text: 'Size' });
    const f = sz.createDiv({ cls: 'sfx-fields sfx-flush' });
    if (fx.shape === 'wall') {
      const sc = P.scaleOf(t);
      if (fx.closed) {
        f.createSpan({ text: 'Diameter' });
        const dia = f.createEl('input', { type: 'number', value: String(fx.size) }); dia.min = '1';
        // the ring made again at the new size, about the same centre
        dia.oninput = () => {
          const v = Number(dia.value); if (!(v > 0) || !fx.points?.length) return;
          const pts = fx.points; const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length, cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
          const ring = ringPoints(v, sc, pts.length);
          fx.at = { x: fx.at.x + cx + ring[0].x, y: fx.at.y + cy + ring[0].y };
          fx.points = ring.map((p) => ({ x: p.x - ring[0].x, y: p.y - ring[0].y }));
          fx.size = v; this.changed();
        };
        f.createSpan({ text: 'ft' });
      } else {
        f.createSpan({ cls: 'sfx-chip', text: `${Math.round(pathLength(fx.points ?? []) / pxPerFoot(sc))} ft long, ${(fx.points?.length ?? 1) - 1} stretch${(fx.points?.length ?? 1) - 1 === 1 ? '' : 'es'}` });
      }
      f.createSpan({ text: 'Thickness' });
      const th = f.createEl('input', { type: 'number', value: String(fx.width ?? 1) }); th.min = '0.1'; th.step = '0.5';
      th.oninput = () => { const v = Number(th.value); if (v > 0) { fx.width = v; this.changed(); } };
      f.createSpan({ text: 'ft' });
    } else {
    f.createSpan({ text: fx.shape === 'radius' || fx.shape === 'emanation' ? 'Radius' : fx.shape === 'cube' ? 'Side' : 'Length' });
    const size = f.createEl('input', { type: 'number', value: String(fx.size) }); size.min = '1';
    size.oninput = () => { const v = Number(size.value); if (v > 0) { fx.size = v; this.changed(); } };
    f.createSpan({ text: 'ft' });
    }
    if (fx.shape === 'line') {
      f.createSpan({ text: 'Width' }); const w = f.createEl('input', { type: 'number', value: String(fx.width ?? 5) });
      w.oninput = () => { const v = Number(w.value); if (v > 0) { fx.width = v; this.changed(); } }; f.createSpan({ text: 'ft' });
    }
    if (fx.shape === 'cone') {
      f.createSpan({ text: 'Angle' }); const an = f.createEl('input', { type: 'number', value: String(Math.round((fx.angle ?? CONE_ANGLE) * 100) / 100) }); an.min = '1'; an.max = '170';
      an.oninput = () => { const v = Number(an.value); if (v >= 1 && v <= 170) { fx.angle = v; this.changed(); } }; f.createSpan({ text: '°' });
    }
    if (fx.shape !== 'wall') {
      const tok = fx.token ? P.tokenOf(t, fx.token) : null;
      // aimed ones turn about their origin; spheres, auras and cubes at a point spin their animation
      const shown = () => Math.round((((aims(fx) ? placeOf(fx, tok).dir ?? 0 : (fx.spin ?? 0) + (fx.token && fx.turn ? tok?.rot ?? 0 : 0)) * 180) / Math.PI % 360 + 360) % 360);
      f.createSpan({ text: 'Turn' });
      const range = f.createEl('input', { type: 'range', value: String(shown()) }); range.min = '0'; range.max = '359'; range.step = P.settings.snap ? '15' : '1';
      const deg = f.createEl('input', { type: 'number', value: String(shown()) }); deg.step = range.step;
      const set = (v: number) => { const rot = fx.token && fx.turn ? tok?.rot ?? 0 : 0; const a = (v * Math.PI) / 180 - rot; if (aims(fx)) fx.dir = a; else fx.spin = a; this.changed(); };
      range.oninput = () => { deg.value = range.value; set(Number(range.value)); };
      deg.oninput = () => { range.value = deg.value; set(Number(deg.value) || 0); };
      f.createSpan({ text: '°' });
    }
    const lab = f.createEl('label', { cls: 'sfx-toggle' }); const last = lab.createEl('input', { type: 'checkbox' }); last.checked = fx.lasting; lab.appendText('Lasts until ended');
    last.onchange = () => { fx.lasting = last.checked; if (fx.lasting) fx.started = Date.now(); this.changed(true); };

    // its token
    const at = body.createDiv(); at.createDiv({ cls: 'sfx-label', text: 'Token' });
    const af = at.createDiv({ cls: 'sfx-fields sfx-flush' });
    if (fx.token) {
      af.createSpan({ text: `Attached to ${P.tokenName(t, fx.token)}: it moves with them` });
      const tl = af.createEl('label', { cls: 'sfx-toggle' }); const turn = tl.createEl('input', { type: 'checkbox' }); turn.checked = !!fx.turn; tl.appendText('Turns with them');
      turn.onchange = () => { const tok = P.tokenOf(t, fx.token!); if (tok) attachTo(fx, fx.token!, tok, turn.checked, tok); this.changed(true); };
      const free = af.createEl('button', { text: 'Detach' }); free.onclick = () => { detach(fx, P.tokenOf(t, fx.token!)); this.changed(true); };
    } else {
      af.createSpan({ text: 'Not attached' });
      const pick = af.createEl('button', { text: 'Attach to a token…' });
      pick.onclick = () => {
        this.close();
        P.pickToken(t, `Click the token ${fx.name} should follow`, (id) => {
          const tok = P.tokenOf(t, id); const e = this.fx();
          if (tok && e) { attachTo(e, id, tok, e.dir !== undefined, null); P.changed(); }
          new EditModal(this.app, P, this.id, t).open();
        });
      };
    }

    if (fx.shape === 'wall') wallsPicker(body, fx.blocks, fx.lasting, (b) => { if (b === 'none') delete fx.blocks; else fx.blocks = b; this.changed(true); });

    // light or darkness
    lightPicker(body, fx.light ?? null, fx.lasting, (l) => {
      if (l) fx.light = { ...l, ...(fx.light?.look && l.mode === fx.light.mode ? { look: fx.light.look } : {}) }; else delete fx.light;
      this.changed(true);
    });
    // everything else about the light, in Atlas's own light editor (what is set there stays with the spell)
    const lbox = body.querySelector<HTMLElement>('.sfx-light:last-of-type') ?? body.querySelector<HTMLElement>('.sfx-light');
    if (lbox && fx.light && fx.lasting && fx.lightIds?.length) {
      const row = lbox.createDiv({ cls: 'sfx-fields' });
      const more = row.createEl('button', { text: 'More light settings…' });
      more.title = 'Atlas’s own light editor for this spell’s light: colour, beam, intensity, softness, flicker and more';
      more.onclick = () => { this.close(); P.editAtlasLight(fx); };
      if (fx.light.look) {
        row.createSpan({ cls: 'sfx-muted', text: 'Changed in Atlas’s editor' });
        const reset = row.createEl('button', { text: 'Reset' });
        reset.onclick = () => { if (fx.light) delete fx.light.look; this.changed(true); this.render(); };
      }
    }

    // look
    lookPicker(body.createDiv(), bottom, { app: this.app, plugin: P, name: fx.name, shape: fx.shape, angle: fx.angle, size: fx.size, file: fx.file, colour: fx.colour, colour2: fx.colour2, alpha: fx.alpha, fileQuery: this.fileQuery,
      set: (c, re) => {
        if ('colour2' in c) { if (c.colour2) fx.colour2 = c.colour2; else delete fx.colour2; P.refresh(fx.id); }
        if ('alpha' in c) { if (c.alpha !== undefined) fx.alpha = c.alpha; else delete fx.alpha; P.refresh(fx.id); }
        if ('fileQuery' in c) this.fileQuery = c.fileQuery ?? '';
        if ('file' in c) { if (c.file) { fx.file = c.file; void P.ensureFile(c.file).then(() => { P.indexVault(); P.refresh(fx.id); }); } else delete fx.file; P.refresh(fx.id); }
        if (c.colour) { fx.colour = c.colour; P.refresh(fx.id); }
        this.changed(re);
      } });

    // snapping, end, done
    const foot = bottom.createDiv({ cls: 'sfx-foot' });
    const sl = foot.createEl('label', { cls: 'sfx-toggle sfx-saved' }); const snap = sl.createEl('input', { type: 'checkbox' }); snap.checked = P.settings.snap; sl.appendText('Snap to grid');
    snap.onchange = () => { void P.toggleSnap(); this.render(); };
    const end = foot.createEl('button', { text: 'End effect', cls: 'mod-warning' }); end.onclick = () => { this.plugin.commit(this.before); this.ended = true; P.end(fx.id); this.close(); };
    const done = foot.createEl('button', { text: 'Done', cls: 'mod-cta' }); done.onclick = () => this.close();
  }
  onClose(): void { if (!this.ended) this.plugin.commit(this.before); this.contentEl.empty(); }
}

class CastModal extends Modal {
  private choice: Choice | null = null;
  private name = 'Effect';
  private area: Area = { shape: 'radius', size: 20, from: 'point', lasting: false };
  private file: string | undefined;
  private colour = '#ff8a2a';
  private colour2: string | undefined;
  private alpha: number | undefined;
  private attach = false;
  private light: EffectLight | null = null;
  private preset: Preset | null = null;
  /** Cast from a statblock: its creature is the caster. */
  casterToken: string | undefined;
  private query = '';
  private fileQuery = '';
  private saved = '';
  private listScroll = 0;
  /** The list's groups that are folded shut. */
  private folded = new Set<string>();
  constructor(app: App, private readonly plugin: AtlasSpellEffects) { super(app); }

  onOpen(): void {
    this.modalEl.addClass('sfx-modal'); this.modalEl.addClass('sfx-cast');
    this.titleEl.setText('Cast a spell effect');
    if (this.choice || this.preset) { this.render(); return; }      // opened with a spell already picked
    const last = this.plugin.last;
    if (last) { const c = this.plugin.choices().find((x) => x.name === last.name); if (c) void this.pick(c); else this.render(); } else this.render();
  }

  /** A spell picked: its stored defaults, or what its text says (and the best animation for it). */
  /** A preset picked: everything as it was saved. */
  pickPreset(pr: Preset): void {
    this.preset = pr; this.choice = null;
    this.name = pr.of || pr.name; this.area = { ...pr.area }; this.file = pr.file; this.colour = pr.colour; this.colour2 = pr.colour2; this.alpha = pr.alpha;
    this.attach = !!pr.attach; this.light = pr.light ? { ...pr.light } : null;
    this.saved = `Preset “${pr.name}”`;
    this.render();
  }

  async pick(c: Choice | null): Promise<void> {
    this.choice = c; this.saved = ''; this.preset = null;
    const P = this.plugin;
    this.colour2 = undefined; this.alpha = undefined;
    if (c?.stored) {
      const st = c.stored;
      this.name = st.name; this.area = { ...st.area }; this.file = st.file; this.colour = st.colour ?? this.colour; this.attach = !!st.attach;
      this.colour2 = st.colour2; this.alpha = st.alpha;
      this.light = st.light !== undefined ? st.light : lightOf(c.entry ?? null, this.area);
      this.saved = `Saved in ${st.path}`;
    } else if (c) {
      const entry = await P.noteEntry(c);
      const r = entry ? P.settings.remember[entry.key] : undefined;
      const a = entry ? areaOf(entry) ?? targetOf(entry) : null;
      this.name = c.name;
      this.area = { shape: r?.shape ?? a?.shape ?? 'radius', size: r?.size ?? a?.size ?? 20, ...((r?.width ?? a?.width) ? { width: r?.width ?? a?.width } : {}), ...(r?.angle ? { angle: r.angle } : {}), from: r?.from ?? a?.from ?? 'point', lasting: r?.lasting ?? a?.lasting ?? false,
        ...((r?.ring ?? a?.ring) ? { ring: r?.ring ?? a?.ring } : {}), ...(r?.round ? { round: true } : {}), ...((r?.blocks ?? a?.blocks) ? { blocks: r?.blocks ?? a?.blocks } : {}), ...((r ? r.target : a?.target) ? { target: (r ? r.target : a?.target)! } : {}) };
      if (this.area.target === 'on' && !r) this.area.size = a?.size ?? 0;
      this.file = r ? r.file : matchesFor(c.name, this.area.shape, P.files, 1)[0]?.file.path;
      if (r?.colour) this.colour = r.colour;
      this.colour2 = r?.colour2; this.alpha = r?.alpha;
      this.attach = false;
      this.light = r && r.light !== undefined ? r.light : lightOf(entry, this.area);
    } else {
      this.name = 'Effect'; this.light = null;
    }
    this.render();
  }

  private render(): void {
    const el = this.contentEl; el.empty();
    const grid = el.createDiv({ cls: 'sfx-castwin' });
    const sideEl = grid.createDiv({ cls: 'sfx-side' });
    this.renderSide(sideEl);
    this.renderPane(grid.createDiv({ cls: 'sfx-pane' }));
    // the list keeps its place when the window is drawn again
    const list = sideEl.querySelector('.sfx-list');
    if (list) { list.scrollTop = this.listScroll; list.addEventListener('scroll', () => { this.listScroll = list.scrollTop; }); }
  }

  private renderSide(side: HTMLElement): void {
    const P = this.plugin;
    side.createDiv({ cls: 'sfx-side-title', text: 'Cast a spell effect' });
    const sb = side.createDiv({ cls: 'sfx-search' });
    setIcon(sb.createSpan({ cls: 'sfx-search-icon' }), 'search');
    const q = sb.createEl('input', { type: 'search', placeholder: 'Search spells…', value: this.query });
    const list = side.createDiv({ cls: 'sfx-list' });
    const fill = () => {
      list.empty();
      const words = this.query.toLowerCase().split(/\s+/).filter(Boolean);
      const all = P.choices().filter((c) => words.every((w) => c.name.toLowerCase().includes(w)));
      const stored = all.filter((c) => c.source === 'stored');
      // without a search: the spells you stored, then the ones whose text names an area
      const rest = all.filter((c) => c.source !== 'stored' && (words.length || (c.entry && areaOf(c.entry)))).slice(0, 80);
      // a group: a header that folds it (Atlas's library sections), then its rows
      const group = (name: string, count: number): HTMLElement | null => {
        const shut = this.folded.has(name) && !words.length;
        const h = list.createDiv({ cls: 'sfx-group' + (shut ? ' is-shut' : '') });
        setIcon(h.createSpan({ cls: 'sfx-chev' }), 'chevron-down');
        h.createSpan({ text: name });
        h.createSpan({ cls: 'sfx-count', text: String(count) });
        h.onclick = () => { if (this.folded.has(name)) this.folded.delete(name); else this.folded.add(name); fill(); };
        return shut ? null : list.createDiv({ cls: 'sfx-rows' });
      };
      const row = (into: HTMLElement, cls: string, icon: string, name: string, note: string, on: boolean, click: () => void) => {
        const it = into.createDiv({ cls: 'sfx-item ' + cls + (on ? ' is-on' : '') });
        setIcon(it.createSpan({ cls: 'sfx-star' }), icon);
        it.createSpan({ cls: 'sfx-name', text: name });
        it.createEl('small', { text: note });
        it.onclick = click;
      };
      const presets = P.settings.presets.filter((pr) => words.every((w) => pr.name.toLowerCase().includes(w)));
      if (presets.length) { const g = group('Presets', presets.length); if (g) for (const pr of presets) row(g, 'sfx-preset', 'zap', pr.name, describe(pr.area), this.preset?.id === pr.id, () => this.pickPreset(pr)); }
      const item = (g: HTMLElement, c: Choice) => {
        const a = c.stored ? c.stored.area : c.entry ? areaOf(c.entry) : null;
        row(g, c.source === 'stored' ? 'sfx-saved-row' : '', c.source === 'stored' ? 'star' : 'wand-2', c.name, a ? describe(a).replace(' around the caster', a.shape === 'emanation' ? ' around' : '') : c.source === 'note' ? 'note' : '', !this.preset && this.choice?.key === c.key, () => { void this.pick(c); });
      };
      if (stored.length) { const g = group('Saved effects', stored.length); if (g) for (const c of stored) item(g, c); }
      if (rest.length) { const g = group(words.length ? 'Other spells' : 'Spells with an area', rest.length); if (g) for (const c of rest) item(g, c); }
      const own = list.createDiv({ cls: 'sfx-rows' });
      row(own, 'sfx-own', 'plus', 'An effect of your own', '', this.choice === null && !this.preset, () => { void this.pick(null); });
      if (!all.length && words.length) list.createDiv({ cls: 'sfx-empty', text: 'No spell by that name.' });
    };
    q.oninput = () => { this.query = q.value; fill(); };
    fill();
    window.setTimeout(() => q.focus(), 0);
  }

  private renderPane(pane: HTMLElement): void {
    const P = this.plugin;
    // head: name, where it comes from, its card art
    const head = pane.createDiv({ cls: 'sfx-head' });
    const img = this.choice?.stored?.image ? this.app.vault.getAbstractFileByPath(this.choice.stored.image) : null;
    if (img instanceof TFile) { const i = head.createEl('img', { cls: 'sfx-card' }); i.src = this.app.vault.getResourcePath(img); }
    const ht = head.createDiv({ cls: 'sfx-head-text' });
    if (this.choice || this.preset) ht.createEl('h3', { text: this.name });
    else { const n = ht.createEl('input', { type: 'text', value: this.name, placeholder: 'Name' }); n.oninput = () => { this.name = n.value || 'Effect'; }; }
    ht.createSpan({ cls: 'sfx-chip', text: this.preset ? `Preset: ${this.preset.name}` : this.choice?.source === 'stored' ? 'Saved defaults' : this.choice?.source === 'note' ? 'Spell note' : 'Your own effect' });

    // the settings scroll; the colour and the buttons stay in view below them
    const body = pane.createDiv({ cls: 'sfx-body' });
    const bottom = pane.createDiv({ cls: 'sfx-bottom' });
    // area
    const area = body.createDiv();
    area.createDiv({ cls: 'sfx-label', text: 'Area' });
    const seg = area.createDiv({ cls: 'sfx-seg' });
    for (const k of ['radius', 'emanation', 'cone', 'cube', 'line', 'wall'] as Shape[]) {
      const b = seg.createEl('button', { text: SHAPE_LABEL[k], cls: this.area.shape === k ? 'is-on' : '' });
      b.onclick = () => { this.area = { ...this.area, shape: k, from: k === 'radius' || k === 'cube' ? this.area.from : k === 'wall' ? 'point' : 'caster' }; if (k === 'line' && !this.area.width) this.area.width = 5; if (k === 'wall' && !this.area.width) this.area.width = 1; if (k === 'wall' && this.area.lasting === false) this.area.lasting = true; if (this.area.target && !((k === 'line' && this.area.target === 'bolt') || (k === 'emanation' && this.area.target === 'on'))) delete this.area.target; this.render(); };
    }
    const f = area.createDiv({ cls: 'sfx-fields' });
    const lab = (t: string) => f.createSpan({ text: t });
    if (this.area.shape === 'wall') {
      const ws = f.createDiv({ cls: 'sfx-seg' });
      for (const [k, t] of [[false, 'Straight'], [true, 'Ring']] as const) {
        const b = ws.createEl('button', { text: t, cls: !!this.area.round === k ? 'is-on' : '' });
        b.onclick = () => { this.area.round = k || undefined; if (!k) delete this.area.round; if (k && !this.area.ring) this.area.ring = 20; this.render(); };
      }
    }
    if (this.area.shape === 'wall' && this.area.round) {
      lab('Diameter');
      const dia = f.createEl('input', { type: 'number', value: String(this.area.ring ?? 20) }); dia.min = '1';
      dia.onchange = () => { this.area.ring = Math.max(1, Number(dia.value) || this.area.ring || 20); };
      lab('ft');
    } else {
      if (this.area.target === 'bolt') lab('From the caster to each target');
      else {
      lab(this.area.target === 'on' ? 'On each target, plus' : this.area.shape === 'radius' || this.area.shape === 'emanation' ? 'Radius' : this.area.shape === 'cube' ? 'Side' : this.area.shape === 'wall' ? 'Up to' : 'Length');
      const size = f.createEl('input', { type: 'number', value: String(this.area.size) }); size.min = this.area.target === 'on' ? '0' : '1';
      size.onchange = () => { const v = Number(size.value); this.area.size = this.area.target === 'on' ? Math.max(0, Number.isFinite(v) ? v : 0) : Math.max(1, v || this.area.size); };
      }
      lab(this.area.shape === 'wall' ? 'ft long' : 'ft');
    }
    if (this.area.shape === 'wall') {
      lab('Thickness'); const w = f.createEl('input', { type: 'number', value: String(this.area.width ?? 1) }); w.min = '0.1'; w.step = '0.5';
      w.onchange = () => { this.area.width = Math.max(0.1, Number(w.value) || 1); }; lab('ft');
    }
    if (this.area.shape === 'line') {
      lab('Width'); const w = f.createEl('input', { type: 'number', value: String(this.area.width ?? 5) }); w.onchange = () => { this.area.width = Math.max(1, Number(w.value) || 5); }; lab('ft');
    }
    if (this.area.shape === 'cone') {
      lab('Angle');
      const an = f.createEl('input', { type: 'number', value: String(Math.round((this.area.angle ?? P.settings.coneAngle) * 100) / 100) }); an.min = '1'; an.max = '170'; an.step = '1';
      an.title = 'The cone’s angle at its point. The default (in the settings) suits your game: 53° is 5e’s (as wide as it is long), 90° Pathfinder’s';
      an.onchange = () => { const v = Number(an.value); if (v >= 1 && v <= 170) this.area.angle = v; else { delete this.area.angle; an.value = String(P.settings.coneAngle); } this.render(); };
      lab('°');
    }
    if (this.area.shape === 'radius' || this.area.shape === 'cube') {
      const o = f.createDiv({ cls: 'sfx-seg' });
      for (const [k, t] of [['point', 'At a point'], ['caster', 'From the caster']] as const) {
        const b = o.createEl('button', { text: t, cls: this.area.from === k ? 'is-on' : '' });
        b.onclick = () => { this.area.from = k; this.render(); };
      }
    }
    const toggle = (text: string, on: boolean, set: (v: boolean) => void, title = '') => {
      const l = f.createEl('label', { cls: 'sfx-toggle' }); if (title) l.title = title;
      const c = l.createEl('input', { type: 'checkbox' }); c.checked = on; c.onchange = () => set(c.checked); l.appendText(text);
    };
    if (this.area.shape === 'line' || this.area.shape === 'emanation') {
      toggle(this.area.shape === 'line' ? 'A bolt at creatures (click each)' : 'On creatures (click each)', !!this.area.target, (v) => {
        if (v) { this.area.target = this.area.shape === 'line' ? 'bolt' : 'on'; if (this.area.target === 'on') this.area.size = 0; } else delete this.area.target;
        this.render();
      }, 'Click each target token after casting: the effect plays on it, or shoots to it from the caster');
    }
    if (this.area.target !== 'bolt') toggle('Lasts until ended', this.area.lasting, (v) => { this.area.lasting = v; this.render(); });
    if (!this.area.target && (this.area.shape === 'cone' || this.area.shape === 'line' || (this.area.shape === 'cube' && this.area.from === 'caster') || (this.area.shape === 'radius' && this.area.from === 'caster'))) {
      toggle('Follows the caster', this.attach, (v) => { this.attach = v; }, 'It moves with the caster’s token (a beholder’s eye, a breath that stays)');
    }

    if (this.area.shape === 'wall') wallsPicker(body, this.area.blocks, this.area.lasting, (b) => { this.area.blocks = b; this.render(); });
    lightPicker(body, this.light, this.area.lasting, (l) => { this.light = l; this.render(); });

    lookPicker(body.createDiv(), bottom, { app: this.app, plugin: P, name: this.name === 'Effect' ? '' : this.name, shape: this.area.shape, angle: this.area.angle ?? P.settings.coneAngle, size: this.area.size, file: this.file, colour: this.colour, colour2: this.colour2, alpha: this.alpha, fileQuery: this.fileQuery,
      set: (c, re) => {
        if ('file' in c) this.file = c.file;
        if (c.colour !== undefined) this.colour = c.colour;
        if ('colour2' in c) this.colour2 = c.colour2;
        if ('alpha' in c) this.alpha = c.alpha;
        if (c.fileQuery !== undefined) this.fileQuery = c.fileQuery;
        if (re) this.render();
      } });

    // go
    const foot = bottom.createDiv({ cls: 'sfx-foot' });
    foot.createSpan({ cls: 'sfx-saved', text: this.saved });
    const sl = foot.createEl('label', { cls: 'sfx-toggle' }); const snap = sl.createEl('input', { type: 'checkbox' }); snap.checked = P.settings.snap; sl.appendText('Snap to grid');
    snap.onchange = () => { void P.toggleSnap(); };
    // presets: save this as one, or update / delete the one picked
    const look = (): Omit<Preset, 'id' | 'name' | 'of'> => ({ area: { ...this.area }, ...(this.file ? { file: this.file } : {}), colour: this.colour, ...(this.colour2 ? { colour2: this.colour2 } : {}), ...(this.alpha ? { alpha: this.alpha } : {}), ...(this.attach ? { attach: true } : {}), light: this.light ? { ...this.light } : null });
    if (this.preset) {
      const pr = this.preset;
      const del = foot.createEl('button', { text: 'Delete preset', cls: 'mod-warning' });
      del.onclick = async () => { P.settings.presets = P.settings.presets.filter((x) => x.id !== pr.id); await P.save(); this.preset = null; this.saved = `Deleted “${pr.name}”`; this.render(); };
      const up = foot.createEl('button', { text: 'Update preset' });
      up.onclick = async () => {
        const l = look();
        pr.area = l.area; pr.colour = l.colour; pr.light = l.light ?? null;
        if (l.file) pr.file = l.file; else delete pr.file;
        if (l.colour2) pr.colour2 = l.colour2; else delete pr.colour2;
        if (l.alpha) pr.alpha = l.alpha; else delete pr.alpha;
        if (l.attach) pr.attach = true; else delete pr.attach;
        await P.save(); this.saved = `Updated “${pr.name}”`; this.render(); };
    }
    const sp = foot.createEl('button', { text: 'Save as preset…' });
    sp.title = 'Keeps all of this under a name of its own, to cast in one click from ✨’s menu';
    sp.onclick = () => new NameModal(this.app, `${this.name} (${describe(this.area)})`, async (name) => {
      const pr: Preset = { id: uid(), name, of: this.name, ...look() };
      P.settings.presets = [...P.settings.presets, pr]; await P.save();
      this.pickPreset(pr);
    }).open();
    const target = this.choice?.stored?.path ?? this.choice?.notePath;
    const store = foot.createEl('button', { text: this.choice?.stored ? 'Update saved defaults' : 'Save as defaults' });
    if (this.preset) store.addClass('sfx-hidden');
    store.title = target ? `Keeps this area, animation, colour, light and walls as the spell's defaults, in ${target} (its effect-… properties)` : `Keeps these as an effect of your own: a note in ${P.storageFolder()}`;
    store.onclick = async () => {
      store.disabled = true;
      try {
        const path = await P.storeSpell({ name: this.name, ...(this.choice?.stored ? { stored: this.choice.stored } : {}), ...(this.choice?.entry ? { entry: this.choice.entry } : {}), ...(this.choice?.notePath ? { notePath: this.choice.notePath } : {}) }, { area: { ...this.area }, file: this.file, colour: this.colour, colour2: this.colour2, alpha: this.alpha, attach: this.attach, light: this.light });
        const c = P.choices().find((x) => x.stored?.path === path);
        this.choice = c ?? this.choice; this.saved = `Saved in ${path}`;
        this.render();
      } catch (e) { new Notice('Atlas Spell Effects: could not store it (' + (e instanceof Error ? e.message : String(e)) + ')'); store.disabled = false; }
    };
    const go = foot.createEl('button', { cls: 'mod-cta', text: 'Place on the map' });
    go.onclick = async () => {
      go.disabled = true;
      const p = await this.pending();
      this.close();
      P.place(p, this.casterToken);
    };
  }

  /** What is set up now, ready to place (its animation fetched first; a spell's choices remembered). */
  async pending(): Promise<Pending> {
      const P = this.plugin;
      if (!(await P.ensureFile(this.file))) this.file = undefined;
      P.indexVault();
      const key = this.choice?.entry?.key ?? this.choice?.key ?? 'effect';
      if (this.choice && !this.choice.stored) P.remember(key, { ...(this.file ? { file: this.file } : {}), colour: this.colour, ...(this.colour2 ? { colour2: this.colour2 } : {}), ...(this.alpha ? { alpha: this.alpha } : {}), shape: this.area.shape, size: this.area.size, ...(this.area.width ? { width: this.area.width } : {}), ...(this.area.angle ? { angle: this.area.angle } : {}), from: this.area.from, lasting: this.area.lasting, light: this.light, ...(this.area.ring ? { ring: this.area.ring } : {}), ...(this.area.round ? { round: true } : {}), ...(this.area.blocks ? { blocks: this.area.blocks } : {}), ...(this.area.target ? { target: this.area.target } : {}) });
      return { name: this.name, key: this.preset ? 'preset:' + this.preset.id : key, area: { ...this.area }, ...(this.file ? { file: this.file } : {}), colour: this.colour, ...(this.colour2 ? { colour2: this.colour2 } : {}), ...(this.alpha ? { alpha: this.alpha } : {}), ...(this.attach ? { attach: true } : {}), ...(this.light ? { light: { ...this.light } } : {}) };
  }
  onClose(): void { this.contentEl.empty(); }
}

/** A name for a preset. */
class NameModal extends Modal {
  constructor(app: App, private readonly start: string, private readonly done: (name: string) => void | Promise<void>) { super(app); }
  onOpen(): void {
    this.titleEl.setText('Save as preset');
    const el = this.contentEl;
    el.createEl('p', { text: 'Its name, as it shows in ✨’s menu and at the top of the cast window:' });
    const n = el.createEl('input', { type: 'text', value: this.start, cls: 'sfx-wide' });
    const foot = el.createDiv({ cls: 'sfx-foot' });
    foot.createEl('button', { text: 'Cancel' }).onclick = () => this.close();
    const ok = foot.createEl('button', { text: 'Save preset', cls: 'mod-cta' });
    const go = () => { const v = n.value.trim(); if (!v) return; this.close(); void this.done(v); };
    ok.onclick = go; n.onkeydown = (e) => { if (e.key === 'Enter') go(); };
    window.setTimeout(() => { n.focus(); n.select(); }, 0);
  }
  onClose(): void { this.contentEl.empty(); }
}

/** "Cast a preset…": your presets, one click each. */
class PresetPicker extends Modal {
  constructor(app: App, private readonly plugin: AtlasSpellEffects) { super(app); }
  onOpen(): void {
    this.modalEl.addClass('sfx-modal'); this.modalEl.addClass('sfx-edit');
    this.titleEl.setText('Cast a preset');
    const el = this.contentEl;
    const ps = this.plugin.settings.presets;
    if (!ps.length) { el.createDiv({ cls: 'sfx-empty', text: 'No presets yet. In the cast window, set a spell up as you like it and press “Save as preset…”.' }); return; }
    const box = el.createDiv({ cls: 'sfx-list' });
    for (const pr of ps) {
      const it = box.createDiv({ cls: 'sfx-item' });
      it.createSpan({ cls: 'sfx-star', text: '⚡' }); it.createSpan({ cls: 'sfx-name', text: pr.name }); it.createEl('small', { text: describe(pr.area) });
      it.onclick = () => { this.close(); void this.plugin.castPreset(pr); };
    }
  }
  onClose(): void { this.contentEl.empty(); }
}

class EndModal extends Modal {
  constructor(app: App, private readonly plugin: AtlasSpellEffects) { super(app); }
  onOpen(): void {
    this.modalEl.addClass('sfx-modal'); this.modalEl.addClass('sfx-endwin');
    this.titleEl.setText('Lasting effects on this map');
    this.render();
  }
  private render(): void {
    const P = this.plugin;
    const el = this.contentEl; el.empty();
    const list = P.lastingHere().sort((a, b) => a.name.localeCompare(b.name) || a.started - b.started);
    if (!list.length) { el.createDiv({ cls: 'sfx-empty', text: 'None on this map.' }); return; }
    el.createDiv({ cls: 'sfx-muted', text: 'Point at one to see it outlined on the map.' });
    const box = el.createDiv({ cls: 'sfx-list sfx-endlist' });
    for (const e of list) {
      const l = P.labelOf(e, list);
      const it = box.createDiv({ cls: 'sfx-item sfx-end-row' });
      setIcon(it.createSpan({ cls: 'sfx-star' }), e.shape === 'cone' ? 'triangle' : e.shape === 'line' ? 'minus' : e.shape === 'cube' ? 'square' : e.shape === 'wall' ? 'brick-wall' : 'circle');
      const tx = it.createDiv({ cls: 'sfx-name' });
      tx.createDiv({ cls: 'sfx-end-name', text: l.name });
      tx.createDiv({ cls: 'sfx-end-detail', text: l.detail });
      it.onmouseenter = () => P.showOnMap(e); it.onmouseleave = () => P.showOnMap(null);
      const b = it.createEl('button', { text: 'End' });
      b.onclick = (ev) => { ev.stopPropagation(); P.showOnMap(null); P.end(e.id); this.render(); };
    }
    const foot = el.createDiv({ cls: 'sfx-foot' });
    const all = foot.createEl('button', { text: 'End them all', cls: 'mod-warning' }); all.onclick = () => { P.showOnMap(null); P.endAllHere(); this.render(); };
    const done = foot.createEl('button', { text: 'Done' }); done.onclick = () => this.close();
  }
  onClose(): void { this.plugin.showOnMap(null); this.contentEl.empty(); }
}

/** "Download everything": what it fetches, before it starts. */
class DownloadModal extends Modal {
  constructor(app: App, private readonly plugin: AtlasSpellEffects, private readonly done: () => void) { super(app); }
  onOpen(): void {
    const P = this.plugin;
    const left = P.files.filter((f) => f.remote).length;
    this.titleEl.setText('Download every JB2A animation');
    const el = this.contentEl;
    el.createEl('p', { text: `This fetches the ${left} JB2A animations not in your vault yet, about 1.2 GB in all, from JB2A’s GitHub into “${P.jb2aRoot()}”. Ones you already have are skipped, so you can stop and carry on later.` });
    el.createEl('p', { text: 'Without it, each animation is fetched the first time you use it. If your vault syncs (Obsidian Sync, iCloud, OneDrive…), the whole pack will sync too.' });
    el.createEl('p', { text: 'JB2A’s free pack is by Jules, Ben, gazkhan and wassily, shared under CC BY-NC-SA 4.0; a credit and licence note is saved with it.' });
    const foot = el.createDiv({ cls: 'sfx-foot' });
    foot.createEl('button', { text: 'Cancel' }).onclick = () => this.close();
    const go = foot.createEl('button', { text: `Download ${left} animations`, cls: 'mod-cta' });
    go.onclick = () => { this.close(); void P.downloadEverything(); this.done(); };
  }
  onClose(): void { this.contentEl.empty(); }
}

class EffectSettings extends PluginSettingTab {
  constructor(app: App, private readonly plugin: AtlasSpellEffects) { super(app, plugin); }
  hide(): void { this.plugin.dlListener = null; }
  display(): void {
    const el = this.containerEl; el.empty();
    const p = this.plugin, s = p.settings;
    el.createEl('p', { text: 'Animated spell areas on your Atlas maps, shown on your screen and the player window. Cast with ✨ in Atlas’s toolbar.' });

    // ── spells ──
    new Setting(el).setName('Spells').setHeading();
    const bs = new Setting(el).setName('Spell bases')
      .setDesc('Every note these Bases show (in any of their views) is a spell, with its area, light and walls read from its text. Pick the Base of your spell pages, as you pick loot bases in Atlas. Saved defaults are written onto each spell’s own note.');
    if (!basesReady()) bs.setDesc('Bases needs Obsidian 1.10 or later with the Bases core plugin on. Until then, spell notes are found by their properties (below).');
    const list = el.createDiv({ cls: 'sfx-baselist' });
    for (const b of s.bases) {
      const st = p.baseState.get(b), n = p.baseNotes.get(b)?.length;
      new Setting(list).setName(b).setDesc(st === 'missing' ? 'Not found: moved or renamed?' : st === 'no-bases' ? 'Bases is off.' : n !== undefined ? `${n} notes` : 'Reading…')
        .addButton((x) => x.setIcon('x').setTooltip('Remove').onClick(() => { void (async () => { s.bases = s.bases.filter((y) => y !== b); await p.save(); await p.startBases(); this.display(); })(); }));
    }
    new Setting(list).setName('Add a base').setDesc('Start typing its name.')
      .addText((t) => {
        t.setPlaceholder('Compendium/Spells.base');
        new BaseSuggest(this.app, t.inputEl, async (path) => { if (!s.bases.includes(path)) { s.bases = [...s.bases, path]; await p.save(); await p.startBases(); } window.setTimeout(() => this.display(), 400); });
      });
    new Setting(el).setName('Folder for effects of your own').setDesc(`“Save as defaults” on an effect that isn’t a spell note makes a note here (and a Base showing them, added above). Now ${p.stored.length} spells have saved defaults.`)
      .addText((t) => {
        t.setPlaceholder('Spell Storage').setValue(s.storage).onChange((v) => { void (async () => { s.storage = v.trim() || 'Spell Storage'; await p.save(); })(); });
        new FolderSuggest(this.app, t.inputEl, async (v) => { s.storage = v.trim() || 'Spell Storage'; await p.save(); });
      });
    new Setting(el).setName('Also find spell notes anywhere').setDesc(`Notes whose properties have a school and a level, or that have a “spell” tag, even outside your Bases. Now: ${p.noteChoices.length} spell notes offered.`)
      .addToggle((t) => t.setValue(s.noteSpells).onChange((v) => { void (async () => { s.noteSpells = v; await p.save(); p.indexSpells(); this.display(); })(); }));

    // ── animations ──
    new Setting(el).setName('Animations').setHeading();
    const remote = p.files.filter((f) => f.remote).length;
    new Setting(el).setName('Offer every JB2A animation').setDesc(`All of JB2A’s free animations (${remote ? `${remote} not downloaded yet` : 'all downloaded'}) show in the cast window; each is fetched from JB2A’s GitHub the first time you use it.`)
      .addToggle((t) => t.setValue(s.jb2aOffer).onChange((v) => { void (async () => { s.jb2aOffer = v; await p.save(); p.indexVault(); this.display(); })(); }));
    new Setting(el).setName('JB2A folder').setDesc('Where JB2A animations are saved in your vault.')
      .addText((t) => {
        t.setPlaceholder('JB2A_DnD5e').setValue(s.jb2aFolder).onChange((v) => { void (async () => { s.jb2aFolder = v.trim() || 'JB2A_DnD5e'; await p.save(); p.indexVault(); })(); });
        new FolderSuggest(this.app, t.inputEl, async (v) => { s.jb2aFolder = v.trim() || 'JB2A_DnD5e'; await p.save(); p.indexVault(); });
      });
    const dls = new Setting(el).setName('Download everything');
    const show = () => {
      const d = p.dl;
      dls.setDesc(d ? `Downloading… ${d.done} of ${d.total || '…'}${d.failed ? `, ${d.failed} failed` : ''}. You can close this; it carries on.` : remote ? `Fetch all ${remote} JB2A animations you don’t have yet (about 1.2 GB), so every one works offline.` : 'Every JB2A animation is in your vault.');
    };
    show();
    dls.addButton((b) => {
      const set = () => { b.setButtonText(p.dl ? 'Stop' : 'Download everything'); b.setDisabled(!p.dl && !remote); };
      set();
      b.onClick(() => { if (p.dl) { p.dl.stop = true; return; } new DownloadModal(this.app, p, () => { set(); show(); }).open(); });
      p.dlListener = () => { show(); set(); };
    });
    el.createEl('p', { cls: 'setting-item-description', text: 'JB2A — Jules & Ben’s Animated Assets (free pack) by Jules, Ben, gazkhan and wassily, under CC BY-NC-SA 4.0. Support them on Patreon for the full pack.' });
    new Setting(el).setName('Your own effect folders').setDesc(`Other vault folders with effect animations (.webm, .gif, .png…), separated by commas. Empty: any folder with “JB2A” in its name, and any folder called “Spell Effects”. In the vault now: ${p.files.length - remote} files.`)
      .addText((t) => {
        t.setPlaceholder('Spell Effects').setValue(s.folders).onChange((v) => { void (async () => { s.folders = v; await p.save(); p.indexVault(); })(); });
        new FolderSuggest(this.app, t.inputEl, async (v) => { s.folders = v; await p.save(); p.indexVault(); }, true);
      })
      .addButton((b) => b.setButtonText('Look again').onClick(() => { p.indexVault(); this.display(); }));

    new Setting(el).setName('On the map').setHeading();
    new Setting(el).setName('Snap to grid').setDesc('Spheres, cubes and wall corners land on the nearest grid corner, as the rules place them (Alt: the other way, once).')
      .addToggle((t) => t.setValue(s.snap).onChange((v) => { void (async () => { s.snap = v; await p.save(); })(); }));
    new Setting(el).setName('Cone angle').setDesc('A cone’s angle at its point when its spell doesn’t say: 53° for D&D 5e (as wide at its end as it is long), 90° for Pathfinder. Each spell or preset can have its own in the cast window.')
      .addText((t) => {
        t.setValue(String(Math.round(s.coneAngle * 100) / 100));
        t.inputEl.type = 'number'; t.inputEl.min = '1'; t.inputEl.max = '170';
        t.onChange((v) => { void (async () => { const n = Number(v); if (n >= 1 && n <= 170) { s.coneAngle = n; await p.save(); } })(); });
      });
  }
}
