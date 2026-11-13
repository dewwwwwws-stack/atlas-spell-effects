// Atlas Spell Effects: animated spell areas on Atlas VTT maps (a bridge until Atlas has its own).
// Cast from the command palette or the ribbon: pick a spell (your spell list says its area), pick its animation
// (JB2A or your own files; or one the add-on draws), click the caster / aim / click where it lands. It plays on
// your map and on the player window (the TV) at the right place and size; lasting ones stay until you end them.
import { Plugin, Modal, Menu, Notice, PluginSettingTab, Setting, setIcon, TFile, MarkdownView, type App, type TextComponent, type WorkspaceLeaf, type SettingDefinitionItem } from 'obsidian';
import { BaseReader, basesReady } from './bases';
import { jb2aFiles, fetchJb2a, fetchAll } from './jb2a';
import { measureArt, hasReach, type Trim } from './trim';
import { kitOf, PixiPainter, forgetBlobs, type AimLook } from './pixi';
import { areaOf as atlasAreaOf, areaKey, effectFromArea, lookOf, areaCarries, atlasLightOf, toolShapeOf, AREA_LOOKS, LOOK_NAMES, LOOK_COLOURS, type AreaShape, type AreaLook } from './measures';
import { IN_SPELL_ID, IN_SPELL, ROUND_SECS, idsOf, upFor, timeOf, secondsOf, spellConditions, type ConditionDef } from './conditions';
import { call, field, type AtlasAssets, type Tab, type AtlasView, type AtlasViewport, type AtlasState, type CanvasNode, type PlayersView, type Measurement } from './atlas';
import { FolderSuggest, BaseSuggest } from './suggest';
import { SpellNames, StatblockLinker, type SpellLink } from './statblocks';
import { areaOf, targetOf, fallbackArea, describe, rangeOf, teleportOf, setRules, unitLabel, square, squares, fromFeet, type GameUnitType, type Area, type Shape, type SpellEntry, type WallBlocks } from './areas';
import { indexFiles, indexFile, matchesFor, coloursOf, search, nearestLength, type EffectFile } from './library';
import { isStored, storedFrom, writeDefaults, clearDefaults, baseFile, noteName, unitFactor, unitNow, type StoredSpell } from './storage';
import { looksLikeSpell, spellFromNote } from './notes';
import { lightOf, placedLights, adoptLook, lightKey, LIGHT_COLOUR, type EffectLight } from './lights';

import { boxOf, dirTo, hitEffect, snapCorner, placeOf, pxPerFoot, attachTo, detach, wallPieces, wallPoints, ringPoints, pathLength, within, controlsOf, stepSize, dragHandle, aims, CONE_ANGLE, coneLocal, type Box, type Effect, type Point, type Scale, type TokenAt } from './geometry';
import { Painter, artInfo, instantMs, FADE_MS, paintHandles, drawnSample, type Surface, type World, type Mapping } from './overlay';

const ATLAS_VIEW = 'atlas-vtt';
const PLAYER_VIEW = 'atlas-vtt-local-player';
const PLAYER_CANVAS = 'atlas-player-canvas';

/** `p`, or the nearest point to it no further than `reach` from `c`. */
const inReach = (p: Point, c: Point, reach: number): Point => { const d = Math.hypot(p.x - c.x, p.y - c.y); return d <= reach || d === 0 ? p : { x: c.x + ((p.x - c.x) * reach) / d, y: c.y + ((p.y - c.y) * reach) / d }; };
/** How many of the spells cast last are kept (✨'s menu, the cast window). */
const RECENT = 5;
const uid = () => 'fx' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** A preset, from versions before 1.4: made into a saved spell (a note of its own) when the add-on loads. */
export interface Preset { id: string; name: string; of: string; area: Area; file?: string; colour: string; colour2?: string; alpha?: number; attach?: boolean; light?: EffectLight | null }
interface Remembered { atlas?: AtlasChoices; look?: string; teleport?: number; conditions?: string[]; range?: number; unit?: string; angle?: number; target?: 'on' | 'bolt'; self?: boolean; colour2?: string; alpha?: number; file?: string; colour?: string; shape?: Shape; size?: number; width?: number; from?: 'caster' | 'point'; lasting?: boolean; light?: EffectLight | null; ring?: number; round?: boolean; blocks?: WallBlocks }
interface Settings {
  folders: string;                 // vault folders with effect files, comma-separated; '' = any folder named like JB2A or "Spell Effects"
  remember: Record<string, Remembered>;
  lasting: Effect[];               // lasting effects, kept between sessions
  snap: boolean;
  storage: string;                 // the folder for new spell notes (effects of your own)
  bases: string[];                 // .base files whose notes are spells
  presets: Preset[];               // older versions' presets, not made into saved spells yet
  showAim: boolean;                // the players see where a spell is aimed, before it is cast
  aimLook: AimLook;                // how: its outline, filled in, or its animation
  jb2aFolder: string;              // where JB2A animations are downloaded to
  jb2aOffer: boolean;              // offer every JB2A animation (downloaded when first used)
  orphanLights: { map: string; id: string; wall?: boolean }[];   // lights of ended effects on maps that weren't open: removed when they are
  noteSpells: boolean;             // offer the vault's spell notes (notes whose properties say they are spells)
  artTrim: Record<string, Trim | 0>;   // where each animation's picture is in its frame (0: looked, nothing to trim)
  coneAngle: number;               // a cone's angle when a spell doesn't say; 0: the game system's, from Atlas
  markCreatures: boolean;          // "In a spell" and a spell's conditions on the creatures inside it
  showRounds: boolean;             // how long each lasting spell has been up, by Atlas's initiative, beside it
  atlasAreas: boolean;             // each spell one of Atlas's own areas too (Atlas 0.15 on)
  areas: Record<string, { map: string; effect: string; mine: boolean }>; // those areas (by their Atlas id), to take away with their spells
  roundSecs: Record<string, number>; // a round's length in seconds you set, for each game system (Atlas's preset id); 0: rounds only; none: the system's own
  marks: Mark[];                   // the conditions the add-on put on creatures (and takes off again)
  caught: Caught[];                // creatures hit by instant spells, shown till you close their card
  recent: Pending[];               // the spells cast last, newest first
}
/** A condition the add-on keeps on a creature for a spell: `on` (put on by it), `off` (you took it off while the creature was still inside), `theirs` (it had it already). */
interface Mark { map: string; from: string; token: string; cond: string; state: 'on' | 'off' | 'theirs' }
/** Creatures hit by an instant spell (Fireball): a card of them, till you close it. */
interface Caught { id: string; map: string; name: string; tokens: { id: string; name: string }[] }
const DEFAULTS: Settings = { folders: '', remember: {}, lasting: [], snap: true, storage: 'Spell Storage', bases: [], presets: [], jb2aFolder: 'JB2A_DnD5e', jb2aOffer: true, noteSpells: true, orphanLights: [], coneAngle: 0, artTrim: {}, showAim: false, aimLook: 'outline', markCreatures: true, showRounds: true, atlasAreas: true, areas: {}, roundSecs: {}, marks: [], caught: [], recent: [] };

/** A spell to pick in the cast window: a saved one, or a spell note (from a Base or found in the vault). */
export interface Choice { key: string; name: string; source: 'stored' | 'note'; entry?: SpellEntry; stored?: StoredSpell; notePath?: string }


/** What is being cast: the area and look, before it is placed. */
interface Pending { name: string; key: string; area: Area; file?: string; colour: string; colour2?: string; alpha?: number; attach?: boolean; light?: EffectLight; /** How far from its caster it can be cast (feet, from the edge of their space). */ range?: number; /** The conditions it gives the creatures inside it (names). */ conditions?: string[]; /** It teleports its caster up to this far (game units). */ teleport?: number; /** Atlas's look for its area (fire, frost…); '' or missing: none. */ look?: string; /** Its Atlas area's choices (Atlas 0.15 on). */ atlas?: AtlasChoices }
/** A spell's Atlas area, as chosen in the cast window: how it's drawn, its light, walls, players, how it's placed. */
interface AtlasChoices { draw?: 'area' | 'animation'; areaLight?: 'atlas' | 'none'; throughWalls?: boolean; hidden?: boolean; tool?: boolean }
/** A spell's remembered choices in the game's units now (remembered in another game system's: the same squares). */
function inUnitsNow(r: Remembered | undefined): Remembered | undefined {
  if (!r) return r;
  const k = unitFactor(r.unit); if (k === 1) return r;
  const sc = (v: number | undefined) => (v === undefined ? v : Math.round(v * k * 100) / 100);
  const light = r.light ? { ...r.light, bright: sc(r.light.bright) ?? 0, dim: sc(r.light.dim) ?? 0 } : r.light;
  return { ...r, size: sc(r.size), width: sc(r.width), ring: sc(r.ring), light, ...(r.teleport ? { teleport: sc(r.teleport) } : {}), unit: unitNow() };
}
/** The conditions part of an effect made from a pending spell. */
const condsOf = (p: Pending): Partial<Effect> => {
  const a = p.atlas ?? {};
  return { ...(p.conditions?.length ? { conditions: [...p.conditions] } : {}), ...(p.look ? { look: p.look } : {}), ...(a.draw ? { draw: a.draw } : {}), ...(a.areaLight ? { areaLight: a.areaLight } : {}), ...(a.throughWalls ? { throughWalls: true } : {}), ...(a.hidden ? { hidden: true } : {}) };
};

/** What casting a spell from a statblock's menu does, in a few words (`who`: its caster, when known). */
function castWord(p: Pending, who: string | null): string {
  const a = p.area;
  const aims = a.shape === 'cone' || a.shape === 'line' || (a.shape === 'cube' && a.from === 'caster');
  if (a.shape === 'wall') return 'Draw it on the map';
  if (a.target === 'bolt') return who ? 'Click a target on the map' : 'Click the caster, then a target';
  if (a.target) return a.self ? (who ? `Cast on ${who}` : 'Click the caster on the map') : 'Click a token on the map';
  if (a.from === 'caster') return aims ? (who ? 'Aim it on the map' : 'Click the caster, then aim') : who ? `Cast on ${who}` : 'Click the caster on the map';
  return 'Click where it goes on the map';
}

export default class AtlasSpellEffects extends Plugin {
  settings: Settings = { ...DEFAULTS };
  /** Waits before looking again (spells, the vault's files, spell Bases). */
  private timers: { rs?: number; ri?: number; rb?: number } = {};
  files: EffectFile[] = [];
  effects: Effect[] = [];
  private painters = new Map<object, Painter>();          // by view or player document
  private loop = 0;
  private placing: { tab: Tab; pending: Pending; caster: { x: number; y: number; token?: string; r: number } | null; preview: Effect | null; stop: () => void; hint: HTMLElement; /** The spell's range round its caster. */ range?: Effect | null } | null = null;
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
    // the old default (5e's) gives way to Atlas's game system; an angle someone chose stays
    if (this.settings.coneAngle === CONE_ANGLE) this.settings.coneAngle = 0;
    basesReady(this);
    // an older version's spell list from GitHub: gone (spells come from your vault)
    const old = this.settings as unknown as Record<string, unknown>;
    if ('repo' in old || 'spells' in old) { for (const k of ['repo', 'branch', 'spellPath', 'spells']) delete old[k]; void this.save(); }
    this.effects = (this.settings.lasting ?? []).filter((e) => e && e.id && e.map);
    this.addSettingTab(new EffectSettings(this.app, this));
    this.addRibbonIcon('sparkles', 'Cast a spell effect', () => this.openCast());
    this.addCommand({ id: 'cast', name: 'Cast a spell effect…', callback: () => this.openCast() });
    this.addCommand({ id: 'cast-again', name: 'Cast the last effect again', callback: () => (this.last ? this.place(this.last) : this.openCast()) });
    this.addCommand({ id: 'preset', name: 'Cast a saved spell…', callback: () => new SavedPicker(this.app, this).open() });
    this.addCommand({ id: 'end', name: 'End a lasting effect…', callback: () => new EndModal(this.app, this).open() });
    this.addCommand({ id: 'end-all', name: 'End every lasting effect on this map', callback: () => this.endAllHere() });
    this.addCommand({ id: 'snap', name: 'Snap effects to the grid on or off', callback: () => { void this.toggleSnap(); } });
    this.addCommand({ id: 'reload', name: 'Look again for spell notes and effect files', callback: () => { this.indexVault(); this.indexSpells(); } });
    this.app.workspace.onLayoutReady(() => {
      // from an older version: its Spell Storage folder's Base becomes the first spell Base
      if (firstBases) { const b = `${this.storageFolder()}/${this.storageFolder().split('/').pop()}.base`; if (this.app.vault.getAbstractFileByPath(b)) { this.settings.bases = [b]; void this.save(); } }
      this.indexVault(); this.indexSpells(); void this.startBases(); this.linkStatblocks(); this.wake();
      void this.presetsToSaved();
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
      // one with an Atlas area: Atlas's own handle picks it (its popover has the spell's buttons)
      if (e.measure && t.store.getState()?.objects?.measures?.[e.measure] && this.areasOn(t)) continue;
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
      if (step && sel) { stopAll(ev); const before = this.snapshot(); stepSize(sel, Number(step.dataset.step), square()); this.commit(before); this.changed(); return; }
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
      const group = this.isPicked(fx.id) && this.selected!.ids.length > 1 ? this.effects.filter((e) => this.isPicked(e.id) && e.id !== fx.id).map((e): Effect => structuredClone(e)) : undefined;
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
    // the spells cast last: again, as they were cast
    const recent = this.settings.recent.length ? this.settings.recent : this.last ? [this.last] : [];
    if (recent.length) {
      menu.addSeparator();
      recent.forEach((l, n) => menu.addItem((i) => i.setTitle(`Cast ${l.name} again`).setIcon(n ? 'history' : 'repeat').onClick(() => this.place(l))));
    }
    const quick = this.stored.filter((st) => st.menu);
    if (quick.length) {
      menu.addSeparator();
      for (const st of quick) menu.addItem((i) => i.setTitle(st.name).setIcon('star').onClick(() => { void this.castSaved(st); }));
    }
    menu.addSeparator();
    menu.addItem((i) => { i.setTitle('Spell AoE player preview').setIcon('crosshair').onClick(() => { this.settings.showAim = !this.settings.showAim; void this.save(); this.wake(); }); i.setChecked?.(this.settings.showAim); });
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

  /** A saved spell straight onto the map (its animation fetched first, if it is a JB2A one not downloaded yet). */
  async castSaved(st: StoredSpell): Promise<void> {
    if (!this.atlasTab()) { new Notice('Atlas Spell Effects: open an Atlas map first.'); return; }
    const c = this.choices().find((x) => x.stored?.path === st.path);
    if (!c) return;
    const m = new CastModal(this.app, this);
    await m.pick(c);
    this.place(await m.pending());
  }

  /**
   * Presets (before 1.4) become saved spells: each a note of its own, in ✨'s menu as before. One saved spell is
   * one thing to know about, kept, changed and deleted the same way.
   */
  async presetsToSaved(): Promise<void> {
    const ps = this.settings.presets;
    if (!ps.length) return;
    let done = 0;
    for (const pr of ps) {
      try {
        await this.storeSpell({ name: pr.name }, { area: { ...pr.area }, file: pr.file, colour: pr.colour, colour2: pr.colour2, alpha: pr.alpha, attach: pr.attach, light: pr.light ?? null, menu: true });
        this.settings.presets = this.settings.presets.filter((x) => x.id !== pr.id); done++;
      } catch (e) { console.error('Atlas Spell Effects: could not keep a preset as a saved spell', pr.name, e); }
    }
    await this.save();
    this.namesChanged();
    if (done) new Notice(`Atlas Spell Effects: your ${done === 1 ? 'preset is' : `${done} presets are`} now saved spells, in ${this.storageFolder()} (and still in ✨’s menu).`);
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
    // everything it put on the page (a card left behind would stay, its × dead, after an update)
    for (const d of this.docs()) d.querySelectorAll('.sfx-layer,.sfx-tool,.sfx-caught,.sfx-pop,.sfx-hint').forEach((el) => el.remove());
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
  /** Spell names changed (spells read or saved): looked for again. */
  namesChanged(): void { this.names = null; for (const l of this.linkers.values()) l.soon(); }

  /** The names this add-on can cast: spells with an area, and saved ones. */
  spellNames(): SpellNames {
    if (this.names) return this.names;
    const links: SpellLink[] = [];
    const seen = new Set<string>();
    // every spell (one with no area is cast on its caster, or at a point), by its name and its other names: a
    // note's aliases, and the name without its inventor ("Acid Arrow" for "Melf's Acid Arrow", as 2024 names it)
    const add = (key: string, name: string) => { const k = name.trim().toLowerCase(); if (k.length >= 3 && !seen.has(k)) { links.push({ key, name: name.trim() }); seen.add(k); } };
    const all = this.choices().filter((c) => !!c.stored || !!c.entry || !!c.notePath);
    for (const c of all) add(c.key, c.name);
    for (const c of all) {
      const f = c.notePath ? this.app.vault.getAbstractFileByPath(c.notePath) : null;
      const al = f instanceof TFile ? this.app.metadataCache.getFileCache(f)?.frontmatter?.['aliases'] as unknown : undefined;
      for (const a of Array.isArray(al) ? al : typeof al === 'string' ? al.split(',') : []) if (typeof a === 'string') add(c.key, a);
      // (two words or more left: "Hunter's Mark" isn't "Mark")
      const m = /^[\p{L}.-]+['’]s\s+(\S+\s+\S.*)$/u.exec(c.name.trim());
      if (m) add(c.key, m[1]);
    }
    return (this.names = new SpellNames(links));
  }

  /** Every open window's statblocks are read (the main one, and windows popped out). */
  linkStatblocks(): void {
    const docs = new Set<Document>([document, ...this.docs()]);
    for (const d of docs) {
      if (this.linkers.has(d) || !d.body) continue;
      const l = new StatblockLinker(d, () => this.spellNames(), (link, how) => void this.castFromStatblock(link, how), (link, how) => void this.statblockMenu(link, how), (sb) => { if (sb.closest('.atlas-statblock-preview-window')) this.tokenOfStatblock(sb); });
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
      const t = this.atlasTab(); const st = t?.store.getState?.();
      const tokens = st?.objects?.tokens ?? {};
      const sel = (st?.selectedIds ?? []).filter((id: string) => tokens[id]);
      // a statblock note open in a tab, or Atlas's statblock pane ("Edit statblock" on a token): the token on the
      // map linked to that note (the selected one, where several share it)
      const leaf = this.app.workspace.getLeavesOfType('markdown').find((l) => l.view.containerEl.contains(sb))
        ?? (() => { let found: WorkspaceLeaf | undefined; this.app.workspace.iterateAllLeaves((l) => { if (!found && l.view.containerEl.contains(sb)) found = l; }); return found; })();
      const v = leaf?.view;
      const fp = v instanceof MarkdownView ? v.file?.path : (() => { const f = field(v, 'file'); return f instanceof TFile ? f.path : field(v, 'path'); })();
      const path = typeof fp === 'string' ? fp : undefined;
      if (t && path) {
        const linked = Object.entries(tokens).filter(([, tok]) => tok.statblockPath === path && !tok.offMap).map(([id]) => id);
        const picked = linked.length === 1 ? linked[0] : linked.find((id) => sel.length === 1 && sel[0] === id);
        if (picked) return { tab: t, id: picked };
      }
      // elsewhere (Atlas's side panel…): the one token selected on the map, if there is one
      if (t && sel.length === 1) return { tab: t, id: sel[0] };
      return null;
    }
    // a window Atlas opened for a token on a map (Ctrl / ⌘ + hover): Atlas keeps it by its token
    for (const tab of this.atlasTabs()) {
      const open = field(call<unknown>(tab.view.serviceManager, 'getNotePreviewUIManager'), 'activePreviews');
      if (!(open instanceof Map)) continue;
      for (const [key, pv] of open as Map<unknown, unknown>) {
        if (typeof key !== 'string' || field(pv, 'element') !== win) continue;
        const id = key.slice(key.lastIndexOf('::') + 2);
        if (tab.store.getState()?.objects?.tokens?.[id]) { this.windowTok.set(win, { tab, id }); return { tab, id }; }
      }
    }
    let t = this.windowTok.get(win);
    if (!t && this.hoverTok && Date.now() - this.hoverTok.at < 5000) { t = { tab: this.hoverTok.tab, id: this.hoverTok.id }; this.windowTok.set(win, t); }
    return t ?? null;
  }

  /** A spell clicked in a statblock: cast it (its creature as the caster), or Shift: open it in the cast window. */
  async castFromStatblock(link: SpellLink, how: { shift: boolean; statblock: HTMLElement }): Promise<void> {
    const tok = this.tokenOfStatblock(how.statblock);
    const c = this.choices().find((x) => x.key === link.key) ?? null;
    if (!c) return;
    const m = new CastModal(this.app, this);
    await m.pick(c);
    if (how.shift) { m.casterToken = tok?.id; m.open(); return; }
    const p = await m.pending();
    if (!this.atlasTab()) { new Notice('Atlas Spell Effects: open an Atlas map first.'); return; }
    this.place(p, tok && this.mapOf(tok.tab) === this.mapOf(this.atlasTab()!) ? tok.id : undefined);
  }

  /**
   * A statblock's Cast button: a menu of the caster and the spell's range, the way it's cast (the map takes it
   * from there), and the cast window.
   */
  async statblockMenu(link: SpellLink, how: { statblock: HTMLElement; x: number; y: number }): Promise<void> {
    const tok = this.tokenOfStatblock(how.statblock);
    const c = this.choices().find((x) => x.key === link.key) ?? null;
    if (!c) return;
    const m = new CastModal(this.app, this);
    await m.pick(c);
    const p = await m.pending();
    const tab = this.atlasTab();
    const here = tok && tab && this.mapOf(tok.tab) === this.mapOf(tab) ? tok : null;
    const who = here ? this.tokenName(here.tab, here.id) : null;
    const range = p.range && p.range > 0 ? `${p.range} ${unitLabel()}` : '';
    const menu = new Menu();
    menu.addItem((i) => i.setTitle([who ?? 'No caster on the map', range].filter(Boolean).join('   ·   ')).setIcon('user').setDisabled(true));
    menu.addItem((i) => i.setTitle(castWord(p, who)).setIcon('wand-sparkles').onClick(() => {
      if (!this.atlasTab()) { new Notice('Atlas Spell Effects: open an Atlas map first.'); return; }
      this.place(p, here?.id);
    }));
    // its animation once on the caster, aimed at no one (a flourish: the DM deals with what it does)
    menu.addItem((i) => {
      i.setTitle('Cast with no target').setIcon('sparkle').setDisabled(!here);
      if (here) i.onClick(() => this.castOnCaster(p, here.tab, here.id));
    });
    // a creature to cast it on, straight from the list (in range of the caster, nearest first)
    const a = p.area;
    if (a.target && !a.self && tab && (a.target !== 'bolt' || here)) {
      const list = this.targetsFor(tab, p, here?.id);
      if (list.length) {
        menu.addSeparator();
        const max = 12;
        for (const k of list.slice(0, max)) {
          menu.addItem((i) => i.setTitle(k.ft === null ? k.name : `${k.name}   ·   ${k.ft} ${unitLabel()}`).setIcon('crosshair').onClick(() => this.castOnTarget(tab, p, k.id, here?.id)));
        }
        if (list.length > max) menu.addItem((i) => i.setTitle(`${list.length - max} more: click them on the map`).setDisabled(true));
        menu.addSeparator();
      } else if (here && p.range) {
        menu.addItem((i) => i.setTitle(`No one within ${p.range} ${unitLabel()}`).setIcon('crosshair').setDisabled(true));
      }
    }
    menu.addItem((i) => i.setTitle('Open in the cast window…').setIcon('sliders-horizontal').onClick(() => { m.casterToken = tok?.id; m.open(); }));
    menu.showAtPosition({ x: how.x, y: how.y }, how.statblock.ownerDocument);
  }

  /** A spell's animation played once on its caster, at no one. */
  castOnCaster(p: Pending, t: Tab, token: string): void {
    const at = this.tokenOf(t, token); if (!at) return;
    this.cast({ id: uid(), map: this.mapOf(t), name: p.name, shape: 'emanation', size: 0, on: true, token, at: { x: at.x, y: at.y }, colour: p.colour, ...(p.colour2 ? { colour2: p.colour2 } : {}), ...(p.alpha ? { alpha: p.alpha } : {}), ...(p.file ? { file: p.file } : {}), lasting: false, started: Date.now() });
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
    this.names = null;                                             // saved spells may have changed
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
      const fm: Record<string, unknown> | null = cache?.frontmatter ?? null;
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
    const fm: Record<string, unknown> | null = this.app.metadataCache.getFileCache(f)?.frontmatter ?? null;
    c.entry = spellFromNote(f.path, fm, await this.app.vault.cachedRead(f));
    return c.entry;
  }

  /** Saves a spell's defaults onto its own note's properties (a note in the folder for your own effects, for one without). */
  async storeSpell(c: { name: string; stored?: StoredSpell; entry?: SpellEntry; notePath?: string }, d: { area: Area; file?: string | undefined; colour?: string | undefined; colour2?: string | undefined; alpha?: number | undefined; attach?: boolean | undefined; light?: EffectLight | null | undefined; menu?: boolean | undefined; range?: number | undefined; conditions?: string[] | undefined; teleport?: number | undefined; look?: string | undefined; atlas?: AtlasChoices | undefined }): Promise<string> {
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
    this.namesChanged();
    return file.path;
  }

  /** Whether a saved spell's note is one the add-on made (a spell of your own): deleting it deletes the note. */
  ownNote(path: string): boolean { return path.startsWith(this.storageFolder() + '/'); }

  /**
   * A saved spell gone: a note the add-on made goes to the bin; a spell page of yours keeps everything but its
   * effect-… properties (it is cast from its text again).
   */
  async forgetSpell(st: StoredSpell): Promise<void> {
    const f = this.app.vault.getAbstractFileByPath(st.path);
    if (f instanceof TFile) {
      if (this.ownNote(st.path)) await this.app.fileManager.trashFile(f);
      else await this.app.fileManager.processFrontMatter(f, (fm: Record<string, unknown>) => clearDefaults(fm));
    }
    this.stored = this.stored.filter((x) => x.path !== st.path);
    this.storedChoices.delete(st.path);
    this.namesChanged();
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
    // the map's measurement (its game unit, and how many to a cell), as Atlas's drag ruler reads it. Every size
    // the add-on keeps is in these game units, as Atlas's own lights and rulers are.
    const m = call<Measurement>(field(call(t.renderer, 'getTokenRenderer'), 'dragRuler'), 'settingsProvider');
    const dist = m?.unitDistance;
    const per = typeof dist === 'number' && Number.isFinite(dist) && dist > 0 ? dist : 5;
    this.readSystem(m, per);
    return { cell, feetPerCell: per };
  }

  /** The game system Atlas measures the open map with (its collection's): what the settings show. */
  atlasSystem: { perSquare: number; unit: string; cone: number; coneRound: boolean; bands: string[] } | null = null;
  private systemKey = '';
  /** Atlas's game system, read with the map's measurement: spell text is read with its units and range bands. */
  private readSystem(m: Measurement | undefined, perCell: number): void {
    if (!m) return;
    const t = m.unitType;
    const unit: GameUnitType = t === 'meters' || t === 'yards' || t === 'units' || t === 'custom' ? t : 'feet';
    const per = typeof m.ruleDistance === 'number' && m.ruleDistance > 0 ? m.ruleDistance : perCell;
    const bands = (m.rangeBands ?? []).filter((b) => b && typeof b.name === 'string' && b.maxSquares > 0);
    const cone = typeof m.coneAngle === 'number' && m.coneAngle > 0 && m.coneAngle < 180 ? m.coneAngle : CONE_ANGLE;
    const coneRound = m.coneEnd !== 'flat';
    const key = JSON.stringify([per, unit, cone, coneRound, bands]);
    if (key === this.systemKey) return;
    this.systemKey = key;
    setRules({ unit, perSquare: per, bands: bands.map((b) => ({ name: b.name, squares: b.maxSquares })) });
    // saved spells read again in this game system's units (one saved in another's: the same squares)
    window.setTimeout(() => this.indexSpells(), 0);
    this.atlasSystem = { perSquare: per, unit: unitLabel(), cone, coneRound, bands: bands.map((b) => b.name) };
    this.namesChanged();
  }

  /**
   * The name of the game system the open map plays by, as Atlas names it ("D&D 5e", "Daggerheart", or your own
   * system's name): from its collection's own file (atlas-vtt/collections/<collection>/collection.json). Null when
   * the map isn't in a collection, or it can't be read.
   */
  async systemName(): Promise<string | null> {
    const t = this.atlasTab(); if (!t) return null;
    const id = /collections\/([^/]+)\//.exec(this.mapOf(t))?.[1];
    if (!id) return null;
    const ad = this.app.vault.adapter;
    const read = async (path: string): Promise<Record<string, unknown> | null> => {
      try { const v: unknown = JSON.parse(await ad.read(path)); return v && typeof v === 'object' ? v as Record<string, unknown> : null; } catch { return null; }
    };
    const col = await read(`atlas-vtt/collections/${id}/collection.json`);
    const sid = field(col?.['settings'], 'systemPresetId');
    if (typeof sid !== 'string' || !sid) return null;
    const BUILT_IN: Record<string, string> = { dnd5e: 'D&D 5e', pathfinder2e: 'Pathfinder 2e', daggerheart: 'Daggerheart', shadowdark: 'Shadowdark', ose: 'Old-School Essentials', cairn: 'Cairn', coc7e: 'Call of Cthulhu', cyberpunkred: 'Cyberpunk RED', drawsteel: 'Draw Steel' };
    if (sid.startsWith('builtin:')) return BUILT_IN[sid.slice(8)] ?? null;
    // one of your own: its file in Atlas's system presets folder
    try {
      const ls = await ad.list('atlas-vtt/system-presets');
      for (const f of ls.files.filter((x) => x.endsWith('.json'))) { const p = await read(f); if (p?.['id'] === sid && typeof p['name'] === 'string') return p['name']; }
    } catch { /* no presets folder */ }
    return null;
  }

  /** A cone's angle when its spell doesn't say: the one set in the settings, else the game system's (Atlas's). */
  coneAngle(fromAtlas = false): number {
    if (!fromAtlas && this.settings.coneAngle > 0) return this.settings.coneAngle;
    const t = this.atlasTab(); if (t) this.scaleOf(t);
    return this.atlasSystem?.cone ?? CONE_ANGLE;
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
    // measured before the reach of a burst was: looked at again, once
    if (known !== undefined && !(known && !hasReach(known) && !this.trimming.has(path))) return known || null;
    if (known) { this.trimming.add(path); this.trimQueue.push(path); if (this.trimQueue.length === 1) void this.nextTrim(); return known; }
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
          const at = this.tokenOf(t, id); if (at) out.push(players ? { ...at, id } : { ...at, id, sel: picked.has(id), ...(tok.offMap ? { off: true } : {}) });
        }
        return out;
      },
      shown: (map, id) => {
        const t = this.atlasTabs().find((x) => this.mapOf(x) === map); if (!t) return null;
        const sprites = field(call(t.renderer, 'getTokenRenderer'), 'tokenSprites');
        const sp = field(sprites, id) as { visible?: boolean; alpha?: number; parent?: unknown } | undefined;
        if (!sp || typeof sp.visible !== 'boolean') return null;
        return sp.visible && (sp.alpha ?? 1) > 0;
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
    if (!this.effects.length && !this.placing) { this.clearPainters(); this.chores(); return; }
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
    // (a spell drawn as Atlas's area alone has no animation: Atlas draws it)
    const drawn = this.effects.filter((e) => !(e.draw === 'area' && e.measure));
    for (const t of this.atlasTabs()) {
      const kit = this.noCanvas.has(t.viewport) ? null : kitOf(t.viewport);
      let mine = drawn;
      if (kit) {
        let pp = this.pixiPainters.get(t.view);
        // Atlas's canvas went wrong for effects once: drawn over it from then on (as before)
        const giveUp = (e: unknown) => { this.noCanvas.add(t.viewport); this.pixiPainters.get(t.view)?.stop(); this.pixiPainters.delete(t.view); console.error('Atlas Spell Effects: drawing in Atlas’s canvas went wrong; drawing over it instead', e); this.wake(); };
        if (!pp) { pp = new PixiPainter(kit, t.viewport, t.renderer, world, (path) => this.readFile(path), () => this.wake(), giveUp); this.pixiPainters.set(t.view, pp); }
        const px = pp, map = this.mapOf(t), pl = this.placing;
        const aim = this.settings.showAim && pl && pl.tab.view === t.view ? pl.preview : null;
        let fine = true;
        try { px.paint(drawn, now, out, map, aim, this.settings.aimLook); } catch (e) { fine = false; giveUp(e); }
        if (fine) { inCanvas = true; mine = drawn.filter((e) => !PixiPainter.wants(e)); }
      }
      let p = this.painters.get(t.view); if (!p) { p = new Painter(this.tabSurface(t), world); this.painters.set(t.view, p); }
      const pl = this.placing;
      const dom = p, list = mine; this.safely('drawing over the map', () => dom.paint(list, now, out, pl && pl.tab.view === t.view ? [pl.preview, pl.range ?? null] : null)); live.add(t.view);
    }
    for (const [k, p] of this.pixiPainters) if (!live.has(k)) { p.stop(); this.pixiPainters.delete(k); }
    // the TV is a copy of Atlas's canvas: effects in it reach the TV that way
    if (!inCanvas) for (const l of this.app.workspace.getLeavesOfType(PLAYER_VIEW)) {
      const doc = l.view.containerEl.ownerDocument;
      let p = this.painters.get(doc); if (!p) { p = new Painter(this.playerSurface(doc), world); this.painters.set(doc, p); }
      const pp = p, aim = this.settings.showAim ? this.placing?.preview ?? null : null; this.safely('drawing on the TV', () => pp.paint(drawn, now, out, aim)); live.add(doc);
    }
    for (const [k, p] of this.painters) if (!live.has(k)) { p.stop(); this.painters.delete(k); }
    this.chores();
  }

  /**
   * What's kept in step with Atlas whether or not a spell is drawn: its areas, lights, walls and conditions, the
   * cards of who was hit, the spell's part of Atlas's area window. Run every frame, and on every wake-up when no
   * spell is on the map (a card closed, an area clicked).
   */
  private chores(): void {
    // each on its own: one going wrong never stops the others (lights and walls are kept in step whatever happens)
    this.safely('selection', () => this.paintSelection());
    this.safely('placing with Atlas’s tool', () => this.watchAtlasPlacing());
    this.safely('areas', () => this.syncAreas());
    this.safely('lights', () => this.syncLights());
    this.safely('catching', () => this.catchPending());
    this.safely('conditions', () => this.syncConditions());
    this.safely('caught', () => this.paintCaught());
    this.safely('Atlas’s area window', () => this.paintPopover());
    this.safely('rounds', () => this.paintRounds());
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

  // ── Atlas's own areas: each spell one of them too (Atlas 0.15 on) ──
  /** What was last written to, or seen of, each effect's Atlas area: its shape (to tell who changed it), its light, its look. */
  private areaSeen = new Map<string, { shape: string; light: string; look: string; opts?: string }>();
  /** Effects whose light their Atlas area gives (so the add-on puts up none of its own). */
  private areaLight = new Set<string>();

  /** Whether a map tab's Atlas keeps areas (0.15 on) and the add-on is to use them. */
  areasOn(t: Tab): boolean {
    const st = t.store.getState?.();
    return this.settings.atlasAreas && !!st && typeof st.addMeasure === 'function' && typeof st.deleteMeasure === 'function' && typeof st.updateMeasure === 'function' && !st.isPlayerView;
  }

  /** Atlas's light for an effect's area: as the add-on would put it up, in Atlas's words; null for none. */
  private areaLightOf(t: Tab, e: Effect, a: AreaShape | null): Record<string, unknown> | null {
    if (e.areaLight === 'none' || !a) return null;
    if (e.areaLight === 'atlas') { const sc = this.scaleOf(t); return atlasLightOf(a, e.look, pxPerFoot(sc), sc.cell, e.colour); }
    if (!e.light || !e.lasting || !areaCarries(a, e.light.mode === 'darkness')) return null;
    const tok = e.token ? this.tokenOf(t, e.token) : null;
    const pl = placedLights(e, e.light, this.boxFor(e, t), tok, pxPerFoot(this.scaleOf(t)))[0];
    return pl ? { ...pl.emission } : null;
  }

  /**
   * Keeps each spell's Atlas area in step with it, both ways: made when it's cast (or when its map opens, for one
   * from before), changed when the add-on changes the spell, the spell changed when you change the area in Atlas
   * (its handles, its colour), the spell ended when you delete the area in Atlas, and the area deleted when the
   * spell ends. Written outside Atlas's undo: the add-on's spells have their own.
   */
  syncAreas(): void {
    let changed = false;
    const ended: string[] = [];
    for (const t of this.atlasTabs()) {
      if (!this.areasOn(t)) {
        // switched off: the areas the add-on made go (the spells stay, drawn by the add-on alone)
        const st0 = t.store.getState?.(); const map0 = this.mapOf(t);
        if (!st0 || st0.isPlayerView || typeof st0.deleteMeasure !== 'function') continue;
        for (const [id, rec] of Object.entries(this.settings.areas)) {
          if (rec.map !== map0) continue;
          if (rec.mine && st0.objects?.measures?.[id]) this.untracked(t, () => st0.deleteMeasure!(id));
          delete this.settings.areas[id]; changed = true;
        }
        for (const e of this.effects) if (e.map === map0 && e.measure) { delete e.measure; this.areaSeen.delete(e.id); this.areaLight.delete(e.id); changed = true; }
        continue;
      }
      const st = t.store.getState(); const map = this.mapOf(t);
      const measures = st.objects?.measures ?? {};
      const sc = this.scaleOf(t); const ppf = pxPerFoot(sc);
      const live = new Set<string>();
      for (const e of this.effects) {
        if (e.map !== map || e.id.startsWith('preview') || e.draw === 'animation') continue;
        const tok = e.token ? this.tokenOf(t, e.token) : null;
        if (e.token && !tok) continue;
        const want = atlasAreaOf(e, boxOf(e, sc, tok));
        if (!want) continue;
        if (this.fitCone(e, t)) changed = true;
        // through walls, the GM's alone: as chosen in the cast window
        const opts = { walls: e.throughWalls ? false : undefined, hidden: e.hidden ? true : undefined };
        const optsKey = JSON.stringify(opts);
        const light = this.areaLightOf(t, e, want);
        const lightKey = JSON.stringify(light);
        const look = e.look && (AREA_LOOKS as readonly string[]).includes(e.look) ? e.look : '';
        if (light) this.areaLight.add(e.id); else this.areaLight.delete(e.id);
        const m = e.measure ? measures[e.measure] : undefined;
        if (e.measure && !m) {
          // deleted in Atlas (by you, or Atlas's undo): the spell ends with it; one never made yet is made below
          if (this.areaSeen.has(e.id) || this.settings.areas[e.measure]) { ended.push(e.id); delete this.settings.areas[e.measure]; this.areaSeen.delete(e.id); changed = true; continue; }
          delete e.measure;
        }
        if (!e.measure) {
          const made: { id: string | null } = { id: null };
          this.untracked(t, () => { made.id = st.addMeasure!({ ...want, ...(e.throughWalls ? { walls: false } : {}), ...(e.hidden ? { hidden: true } : {}), ...(light ? { light } : {}), ...(look ? { effect: look } : {}) }); });
          const id = made.id;
          if (typeof id === 'string' && id) {
            e.measure = id; this.settings.areas[id] = { map, effect: e.id, mine: true };
            this.areaSeen.set(e.id, { shape: areaKey(want), light: lightKey, look, opts: optsKey });
            live.add(id); changed = true;
          }
          continue;
        }
        live.add(e.measure);
        const seen = this.areaSeen.get(e.id);
        const now = areaKey(m);
        if (seen && now !== seen.shape) {
          // changed in Atlas: the spell takes its new shape, place, size and colour
          const moved = effectFromArea(e, m as unknown as AreaShape, ppf, sc.cell);
          if (moved) { Object.assign(e, moved); if (!moved.token) { delete e.token; delete e.offset; delete e.turn; } if (moved.dir === undefined) delete e.dir; }
          const again = atlasAreaOf(e, boxOf(e, sc, e.token ? this.tokenOf(t, e.token) : null));
          this.areaSeen.set(e.id, { ...seen, shape: areaKey(again ?? m) });
          changed = true;
          continue;
        }
        // changed by the add-on (moved, resized, its light or look): Atlas's area too
        const changes: Record<string, unknown> = {};
        if (!seen || areaKey(want) !== seen.shape) Object.assign(changes, { shape: want.shape, points: want.points, width: want.width, color: want.color, follows: want.follows, aura: want.aura });
        if (!seen || lightKey !== seen.light) changes['light'] = light ?? undefined;
        if (!seen || look !== seen.look) changes['effect'] = look || undefined;
        if (!seen || (seen.opts !== undefined && optsKey !== seen.opts)) Object.assign(changes, opts);
        if (Object.keys(changes).length) {
          this.untracked(t, () => st.updateMeasure!(e.measure!, changes));
          this.areaSeen.set(e.id, { shape: areaKey(want), light: lightKey, look, opts: seen?.opts !== undefined || !seen ? optsKey : undefined });
        }
      }
      // the areas of spells that have ended (or were undone): gone with them
      for (const [id, rec] of Object.entries(this.settings.areas)) {
        if (rec.map !== map || live.has(id)) continue;
        if (rec.mine && measures[id]) this.untracked(t, () => st.deleteMeasure!(id));
        delete this.settings.areas[id]; changed = true;
      }
    }
    if (ended.length) this.endMany(ended);
    if (changed) this.saveSoon();
  }

  // ── conditions: "In a spell" on creatures inside a spell, and the conditions a spell gives them ──
  /** Collections asked to take the "In a spell" condition (once each). */
  private markerAsked = new Set<string>();

  /** The collection a map tab's map is in (its folder in Atlas's collections), or the store's own. */
  collectionOf(t: Tab): string | null {
    const id = /collections\/([^/]+)\//.exec(this.mapOf(t))?.[1] ?? t.store.getState()?.currentCollectionId;
    return typeof id === 'string' && id ? id : null;
  }

  /** Atlas's collections (through the tab's services). */
  private assetsOf(t: Tab): AtlasAssets | null {
    const a = call<AtlasAssets>(t.view.serviceManager, 'getAssetService');
    return a && typeof a.getCollectionSettings === 'function' ? a : null;
  }

  /** The conditions of the open map's collection (its game system's, and the DM's own). */
  conditionDefs(t: Tab | null = this.atlasTab()): ConditionDef[] {
    if (!t) return [];
    const id = this.collectionOf(t); const a = this.assetsOf(t);
    if (!id || !a) return [];
    try { return (a.getCollectionSettings(id).conditions ?? []).filter((c) => c && typeof c.id === 'string' && typeof c.name === 'string'); } catch { return []; }
  }

  /** The game system a tab's map plays by (Atlas's preset id for it, from its collection), or "" when it can't tell. */
  systemOf(t: Tab | null = this.atlasTab()): string {
    if (!t) return '';
    const id = this.collectionOf(t); const a = this.assetsOf(t);
    try { const v = id && a ? a.getCollectionSettings(id)['systemPresetId'] : undefined; return typeof v === 'string' ? v : ''; } catch { return ''; }
  }

  /** How long a round lasts in a map's game system (seconds): as you set it, else the game's own; undefined: rounds only. */
  roundSecs(t: Tab | null = this.atlasTab()): number | undefined {
    const sid = this.systemOf(t);
    const v = this.settings.roundSecs[sid] ?? ROUND_SECS[sid];
    return typeof v === 'number' && v > 0 ? v : undefined;
  }

  /** The names of the collection's conditions a spell can give (not the add-on's own marker). */
  conditionNames(t: Tab | null = this.atlasTab()): string[] { return this.conditionDefs(t).filter((c) => c.id !== IN_SPELL_ID).map((c) => c.name); }

  /** Puts "In a spell" among the collection's conditions, if it isn't there yet. True when it is there now. */
  private ensureMarker(t: Tab): boolean {
    const defs = this.conditionDefs(t);
    if (defs.some((c) => c.id === IN_SPELL_ID)) return true;
    const id = this.collectionOf(t); const a = this.assetsOf(t);
    if (!id || !a || this.markerAsked.has(id)) return false;
    this.markerAsked.add(id);
    void a.updateCollectionSettings(id, { conditions: [...defs, { ...IN_SPELL }] }).then(() => this.wake()).catch((e: unknown) => { console.error('Atlas Spell Effects: could not add the “In a spell” condition', e); });
    return false;
  }

  /** The tokens inside an effect on a tab's map now (any part of their space: their middle, or round it). */
  insideOf(t: Tab, e: Effect): string[] {
    const tokens = t.store.getState()?.objects?.tokens ?? {};
    // its Atlas area: Atlas's own count (its grid's rule, as far as walls let it), as Atlas rings them
    const counted = e.measure && this.areasOn(t) ? this.atlasCount(t, e.measure) : null;
    if (counted) return counted.filter((id) => tokens[id] && !tokens[id].offMap && id !== e.caster && !(e.shape === 'emanation' && id === e.token));
    if (e.on) { const own = e.token ? tokens[e.token] : undefined; return e.token && own && !own.offMap ? [e.token] : []; }
    const s = this.scaleOf(t);
    const follow = e.token ? this.tokenOf(t, e.token) : null;
    if (e.token && !follow) return [];
    const b = boxOf(e, s, follow);
    const pieces = e.shape === 'wall' ? wallPieces(e, s, follow) : undefined;
    const out: string[] = [];
    for (const [id, tok] of Object.entries(tokens)) {
      // a cone, a line or an aura from its caster: the others in it, not the caster
      if (tok.offMap || id === e.caster || (e.shape === 'emanation' && id === e.token)) continue;
      const at = this.tokenOf(t, id); if (!at) continue;
      const pts = [{ x: at.x, y: at.y }, ...Array.from({ length: 8 }, (_, i) => ({ x: at.x + Math.cos(i * Math.PI / 4) * at.r * 0.6, y: at.y + Math.sin(i * Math.PI / 4) * at.r * 0.6 }))];
      if (pts.some((p) => hitEffect(e, b, p, pieces))) out.push(id);
    }
    return out;
  }

  /**
   * Brings the conditions the add-on keeps in step: on every creature inside a lasting spell, "In a spell" and the
   * spell's conditions, off again when it leaves or the spell ends; on every creature caught in an instant spell
   * and not dealt with yet, "In a spell". Only what the add-on put on is taken off: a condition the creature had
   * already stays, and one you take off while it's still inside stays off.
   */
  syncConditions(): void {
    if (!this.settings.markCreatures && !this.settings.marks.length) return;
    let changed = false;
    for (const t of this.atlasTabs()) {
      const st = t.store.getState?.(); if (!st || st.isPlayerView || typeof st.setTokensCondition !== 'function') continue;
      const map = this.mapOf(t);
      const tokens = st.objects?.tokens ?? {};
      const defs = this.conditionDefs(t);
      const marker = this.settings.markCreatures && this.ensureMarker(t);
      // what should be on, by whom: "effect|token|condition"
      const want = new Map<string, { from: string; token: string; cond: string }>();
      if (this.settings.markCreatures) {
        for (const e of this.effects) {
          if (e.map !== map || !e.lasting || e.bolt || e.outline || e.id.startsWith('preview')) continue;
          const conds = [...(marker ? [IN_SPELL_ID] : []), ...idsOf(e.conditions ?? [], defs)];
          if (!conds.length) continue;
          for (const token of this.insideOf(t, e)) for (const cond of conds) want.set(`${e.id}|${token}|${cond}`, { from: e.id, token, cond });
        }
        if (marker) for (const c of this.settings.caught) {
          if (c.map !== map) continue;
          for (const k of c.tokens) if (tokens[k.id]) want.set(`caught:${c.id}|${k.id}|${IN_SPELL_ID}`, { from: 'caught:' + c.id, token: k.id, cond: IN_SPELL_ID });
        }
      }
      const has = (token: string, cond: string) => (tokens[token]?.conditions ?? []).includes(cond);
      const add = new Map<string, string[]>(), drop = new Map<string, string[]>();
      const push = (m: Map<string, string[]>, cond: string, token: string) => { const l = m.get(cond) ?? []; if (!l.includes(token)) l.push(token); m.set(cond, l); };
      const kept: typeof this.settings.marks = [];
      const known = new Set<string>();
      for (const m of this.settings.marks) {
        if (m.map !== map) { kept.push(m); continue; }
        const key = `${m.from}|${m.token}|${m.cond}`;
        if (want.has(key)) {
          known.add(key);
          // taken off by you while still inside: left off
          if (m.state === 'on' && !has(m.token, m.cond)) { kept.push({ ...m, state: 'off' }); changed = true; } else kept.push(m);
          continue;
        }
        // no longer wanted: off, unless another spell still holds it on the creature
        changed = true;
        if (m.state === 'on' && has(m.token, m.cond) && ![...want.values()].some((w) => w.token === m.token && w.cond === m.cond)) push(drop, m.cond, m.token);
      }
      for (const [key, w] of want) {
        if (known.has(key)) continue;
        changed = true;
        const other = kept.some((m) => m.map === map && m.token === w.token && m.cond === w.cond && m.state === 'on');
        if (has(w.token, w.cond) && !other) kept.push({ map, ...w, state: 'theirs' });
        else { kept.push({ map, ...w, state: 'on' }); if (!has(w.token, w.cond)) push(add, w.cond, w.token); }
      }
      this.settings.marks = kept;
      if (add.size || drop.size) this.untracked(t, () => {
        for (const [cond, ids] of add) st.setTokensCondition!(ids, cond, true);
        for (const [cond, ids] of drop) st.setTokensCondition!(ids, cond, false);
      });
    }
    if (changed) this.saveSoon();
  }

  /** A spell's effect shaped as one of Atlas's areas is (its place, size, colour and whom it follows), on that area. */
  private effectOnArea(t: Tab, id: string, p: Pending): Effect | null {
    const m = t.store.getState()?.objects?.measures?.[id];
    if (!m) return null;
    const sc = this.scaleOf(t);
    const base: Effect = { id: uid(), map: this.mapOf(t), name: p.name, shape: m['follows'] ? 'emanation' : 'radius', size: 0, at: { x: 0, y: 0 }, colour: typeof m['color'] === 'string' ? m['color'] : p.colour, lasting: true, started: Date.now(), ...(p.colour2 ? { colour2: p.colour2 } : {}), ...(p.alpha ? { alpha: p.alpha } : {}), ...(p.file ? { file: p.file } : {}), ...(p.light ? { light: { ...p.light } } : {}), ...condsOf(p) };
    return effectFromArea(base, m as unknown as AreaShape, pxPerFoot(sc), sc.cell);
  }

  /** A spell put on one of Atlas's own areas: its animation over it, its conditions…; the area stays Atlas's (ending the spell leaves it). */
  animateArea(p: Pending, t: Tab, id: string, mine = false): void {
    const e = this.effectOnArea(t, id, p);
    if (!e) { new Notice('Atlas Spell Effects: that area isn’t on the map any more.'); return; }
    e.measure = id;
    if (!p.area.lasting) e.lasting = false;
    // its look and light stay as you set them in Atlas, unless the spell names its own
    const m = t.store.getState()?.objects?.measures?.[id];
    const had = typeof m?.['effect'] === 'string' && (AREA_LOOKS as readonly string[]).includes(m['effect']) ? m['effect'] : '';
    if (p.look) e.look = p.look; else if (had) e.look = had; else delete e.look;
    // its colour as you left it (when not its look's own)
    const own = e.look && e.look in LOOK_COLOURS ? LOOK_COLOURS[e.look as AreaLook] : e.colour;
    const given = typeof m?.['color'] === 'string' ? m['color'] : '';
    if (/^#[0-9a-f]{6}$/i.test(given) && given.toLowerCase() !== own.toLowerCase()) e.areaColour = given; else delete e.areaColour;
    this.settings.areas[id] = { map: e.map, effect: e.id, mine };
    // (drawn for the spell with Atlas's tool: the spell's choices; one of yours: as you left it, but what the spell names)
    this.areaSeen.set(e.id, mine ? { shape: areaKey(m), light: '', look: '', opts: '' } : { shape: areaKey(m), light: p.light || p.atlas?.areaLight ? '' : JSON.stringify(null), look: p.look ? '' : had });
    this.cast(e);
  }

  /**
   * A spell placed with Atlas's own Measure tool: the tool is picked with the spell's shape and look (kept, and
   * shown to players as chosen), and the area you draw becomes the spell's (its animation over it); Atlas's tool as
   * it was afterwards. Esc stops.
   */
  placeWithAtlas(t: Tab, pending: Pending): void {
    const st = t.store.getState();
    const shape = toolShapeOf(pending.area);
    if (!shape || typeof st.setMeasureTool !== 'function' || typeof st.setActiveTool !== 'function') { this.place({ ...pending, atlas: { ...pending.atlas, tool: false } }); return; }
    const before = new Set(Object.keys(st.objects?.measures ?? {}));
    const was = { tool: st.activeTool, options: st.measureTool ? { ...st.measureTool } : null };
    const sc = this.scaleOf(t);
    st.setMeasureTool({ mode: shape, keep: true, players: !pending.atlas?.hidden, color: pending.colour, effect: pending.look || null, ...(shape === 'line' ? { lineWidth: Math.max(1, Math.round((pending.area.width ?? sc.feetPerCell) / sc.feetPerCell)) } : {}) });
    st.setActiveTool('measure');
    const doc = t.canvas.ownerDocument;
    const hint = (t.canvas.parentElement ?? doc.body).createDiv({ cls: 'sfx-hint', text: `${pending.name}: draw it with Atlas’s Measure tool (${describe(pending.area)})   ·   Esc to stop` });
    const restore = () => { const s2 = t.store.getState(); s2.setActiveTool?.(was.tool ?? 'select'); if (was.options) s2.setMeasureTool?.(was.options); };
    const opts = { capture: true } as AddEventListenerOptions;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && this.atlasPlacing?.tab === t) { this.atlasPlacing.stop(); restore(); } };
    doc.addEventListener('keydown', key, opts);
    this.placing?.stop();
    this.atlasPlacing = { tab: t, pending, before, stop: () => { doc.removeEventListener('keydown', key, opts); hint.remove(); this.atlasPlacing = null; }, restore };
  }

  /** A spell being placed with Atlas's Measure tool. */
  private atlasPlacing: { tab: Tab; pending: Pending; before: Set<string>; stop: () => void; restore: () => void } | null = null;

  /** Placing with Atlas's tool: the area you've just kept becomes the spell's. */
  private watchAtlasPlacing(): void {
    const ap = this.atlasPlacing; if (!ap) return;
    const ms = ap.tab.store.getState()?.objects?.measures ?? {};
    const fresh = Object.keys(ms).find((id) => !ap.before.has(id) && ms[id]?.['shape'] !== 'ruler');
    if (!fresh) return;
    ap.stop(); ap.restore();
    this.animateArea(ap.pending, ap.tab, fresh, true);
  }

  /** The tokens Atlas counts in one of its areas (null: this Atlas can't say, or hasn't drawn it yet). */
  private atlasCount(t: Tab, id: string): string[] | null {
    if (typeof field(t.renderer, 'tokensInMeasure') !== 'function') return null;
    if (!t.store.getState()?.objects?.measures?.[id]) return null;
    const ids: unknown = call<unknown>(t.renderer, 'tokensInMeasure', id);
    return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : null;
  }

  /** Instant spells just cast, whose creatures are counted once Atlas has their area (a moment after). */
  private toCatch = new Map<string, number>();

  /** Counts the creatures of instant spells just cast, once their Atlas areas are there (or at once, without them). */
  catchPending(now = Date.now()): void {
    for (const [id, at] of this.toCatch) {
      const e = this.effects.find((x) => x.id === id);
      const t = e ? this.atlasTabs().find((x) => this.mapOf(x) === e.map) : undefined;
      if (!e || !t) { this.toCatch.delete(id); continue; }
      const age = now - at;
      if (this.areasOn(t) && atlasAreaOf(e, this.boxFor(e, t)) && age < 1500) {
        // its Atlas area made and drawn (a moment, so a count of nobody is a real one)
        if (!e.measure || !this.atlasCount(t, e.measure) || (age < 300 && !this.atlasCount(t, e.measure)!.length)) continue;
      }
      this.toCatch.delete(id);
      this.catchIn(e);
    }
  }

  /** An instant spell (Fireball) just went off: the creatures it hit (a card, and "In a spell" on them till it's closed). */
  private catchIn(e: Effect): void {
    if (!this.settings.markCreatures || e.lasting || e.bolt || e.outline || e.on) return;
    const t = this.atlasTabs().find((x) => this.mapOf(x) === e.map); if (!t) return;
    const ids = this.insideOf(t, e); if (!ids.length) return;
    if (this.settings.caught.some((c) => c.id === e.id)) return;
    this.settings.caught.push({ id: e.id, map: e.map, name: e.name, tokens: ids.map((id) => ({ id, name: this.tokenName(t, id) })) });
    this.saveSoon();
  }

  /**
   * Atlas's own window for one of its areas (its handle clicked): the spell's part of it, under Atlas's choices. For
   * a spell's area: its name, Edit spell… and End spell. For one of yours without a spell: Animate…, to put a spell's
   * animation (and conditions…) on it.
   */
  paintPopover(tries = 0): void {
    for (const t of this.atlasTabs()) {
      const st = t.store.getState?.(); if (!st || !this.areasOn(t)) continue;
      const id = typeof st.measurePopover === 'string' ? st.measurePopover : null;
      const doc = t.canvas.ownerDocument;
      const pop = doc.querySelector<HTMLElement>('.atlas-measure-popover');
      if (!id || !pop) { if (id && tries < 10) window.setTimeout(() => this.paintPopover(tries + 1), 40); continue; }
      const m = st.objects?.measures?.[id];
      if (!m || m['shape'] === 'ruler') continue;
      const fx = this.effects.find((e) => e.measure === id);
      const key = `${id}|${fx?.id ?? ''}|${fx?.name ?? ''}`;
      const had = pop.querySelector<HTMLElement>(':scope > .sfx-pop');
      if (had?.dataset.k === key) continue;
      had?.remove();
      const box = pop.createDiv({ cls: 'atlas-light-popover__section sfx-pop' });
      box.dataset.k = key;
      // before Atlas's own last row (select tokens, delete)
      const last = pop.querySelector(':scope > .atlas-light-popover__actions');
      if (last) pop.insertBefore(box, last);
      const head = box.createDiv({ cls: 'sfx-pop-head' });
      setIcon(head.createSpan({ cls: 'sfx-pop-icon' }), 'sparkles');
      head.createSpan({ cls: 'sfx-pop-name', text: fx ? fx.name : 'Spell Effects' });
      const row = box.createDiv({ cls: 'sfx-pop-buttons' });
      const close = () => t.store.getState().closeMeasurePopover?.();
      if (fx) {
        const ed = row.createEl('button', { cls: 'sfx-pop-btn', text: 'Edit spell…' });
        ed.onclick = () => { close(); new EditModal(this.app, this, fx.id, t).open(); };
        const end = row.createEl('button', { cls: 'sfx-pop-btn', text: 'End spell' });
        end.onclick = () => { close(); this.end(fx.id); };
      } else {
        const an = row.createEl('button', { cls: 'sfx-pop-btn mod-cta', text: 'Animate…' });
        an.onclick = () => { close(); const cm = new CastModal(this.app, this); cm.forArea = { tab: t, id }; cm.open(); };
      }
    }
  }

  /** A map tab's mark, for its card (several tabs: a card each). */
  private viewKeys = new WeakMap<object, string>();
  /** This copy of the add-on (an update loads a new one): its cards are its own. */
  private readonly instanceKey = uid();
  private viewKey(t: Tab): string { let k = this.viewKeys.get(t.view); if (!k) { k = uid(); this.viewKeys.set(t.view, k); } return k; }

  /**
   * The cards' × heard first, on the window, by where the pointer is (Atlas listens to the pointer over its map
   * before anything on the page hears it).
   */
  private caughtWins = new WeakSet<Document>();
  private hookCaughtClicks(doc: Document): void {
    if (this.caughtWins.has(doc)) return;
    this.caughtWins.add(doc);
    const win = doc.defaultView; if (!win) return;
    const hit = (e: MouseEvent): HTMLElement | null => {
      for (const b of Array.from(doc.querySelectorAll<HTMLElement>('.sfx-caught .sfx-caught-x'))) {
        const r = b.getBoundingClientRect();
        if (e.clientX >= r.left - 2 && e.clientX <= r.right + 2 && e.clientY >= r.top - 2 && e.clientY <= r.bottom + 2) return b;
      }
      return null;
    };
    const inCard = (e: MouseEvent): boolean => Array.from(doc.querySelectorAll<HTMLElement>('.sfx-caught')).some((c) => { const r = c.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; });
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const b = hit(e);
      if (b) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); if (b.dataset.caught) this.closeCaught(b.dataset.caught); return; }
      // the rest of the card: its own (not the map's)
      if (inCard(e)) { e.stopPropagation(); e.stopImmediatePropagation(); }
    };
    const quiet = (e: MouseEvent) => {
      if (!inCard(e)) return;
      e.stopPropagation(); e.stopImmediatePropagation();
      // a pointerdown that never reached us: the release or the click closes it instead
      if (e.button === 0 && (e.type === 'mouseup' || e.type === 'pointerup' || e.type === 'click')) { const b = hit(e); if (b?.dataset.caught) { e.preventDefault(); this.closeCaught(b.dataset.caught); } }
    };
    this.registerDomEvent(win, 'pointerdown', down, { capture: true });
    // the window resized (a sidebar opened): the cards follow the map's corner
    this.registerDomEvent(win, 'resize', () => this.wake());
    for (const ev of ['mousedown', 'pointerup', 'mouseup', 'click', 'dblclick', 'contextmenu'] as const) this.registerDomEvent(win, ev, quiet, { capture: true });
  }

  /** An instant spell's card closed: done with (its "In a spell" marks come off). */
  closeCaught(id: string): void {
    if (!this.settings.caught.some((c) => c.id === id)) return;     // closed already (by an earlier event of the same click)
    this.settings.caught = this.settings.caught.filter((x) => x.id !== id);
    this.saveSoon(); this.wake();
  }

  /**
   * The cards of creatures hit by instant spells, over each map they're on (yours only). Kept in the tab's own
   * frame, outside Atlas's map (whose pointer handling would take the clicks), over its top right.
   */
  paintCaught(): void {
    for (const t of this.atlasTabs()) {
      const doc = t.canvas.ownerDocument;
      const list = this.settings.caught.filter((c) => c.map === this.mapOf(t));
      // on the page itself, over the map's top right (out of Atlas's map and its layers, which take its clicks)
      // cards left by an earlier copy of the add-on (before an update or a reload): gone
      doc.body.querySelectorAll<HTMLElement>(':scope > .sfx-caught').forEach((el) => { if (el.dataset.owner !== this.instanceKey) el.remove(); });
      let box = doc.body.querySelector<HTMLElement>(`:scope > .sfx-caught[data-view="${this.viewKey(t)}"]`);
      if (!list.length || t.canvas.offsetParent === null) { box?.remove(); continue; }
      const r = t.canvas.getBoundingClientRect();
      if (!box) { box = doc.body.createDiv({ cls: 'sfx-caught' }); box.dataset.view = this.viewKey(t); box.dataset.owner = this.instanceKey; }
      this.hookCaughtClicks(doc);
      box.setCssStyles({ top: `${Math.round(r.top + 56)}px`, left: `${Math.round(r.right - 272)}px` });
      const key = JSON.stringify(list);
      if (box.dataset.k === key) continue;
      box.dataset.k = key; box.empty();
      for (const c of list) {
        const card = box.createDiv({ cls: 'sfx-caught-card' });
        const head = card.createDiv({ cls: 'sfx-caught-head' });
        setIcon(head.createSpan({ cls: 'sfx-caught-icon' }), 'sparkles');
        head.createSpan({ cls: 'sfx-caught-title', text: c.name });
        head.createSpan({ cls: 'sfx-caught-count', text: `${c.tokens.length} hit` });
        const x = head.createEl('button', { cls: 'clickable-icon sfx-caught-x', attr: { 'aria-label': 'Close' } }); setIcon(x, 'x');
        x.dataset.caught = c.id;
        x.onclick = (ev) => { ev.preventDefault(); ev.stopPropagation(); this.closeCaught(c.id); };
        for (const k of c.tokens) card.createDiv({ cls: 'sfx-caught-row' }).createSpan({ cls: 'sfx-caught-name', text: k.name });
      }
    }
  }

  /**
   * How long each lasting spell has been up, by Atlas's initiative: counted from the round it was cast in (or the
   * fight's first round), shown by it on your map only. Nothing ends on its own.
   */
  paintRounds(): void {
    let changed = false;
    for (const t of this.atlasTabs()) {
      const st = t.store.getState?.(); if (!st) continue;
      const map = this.mapOf(t);
      const ini = st.initiative;
      const round = ini?.isActive && typeof ini.round === 'number' && ini.round > 0 ? ini.round : 0;
      const on = round > 0;
      const shown: { e: Effect; text: string }[] = [];
      for (const e of this.effects) {
        if (e.map !== map || !e.lasting) continue;
        if (!on) { if (e.round !== undefined) { delete e.round; changed = true; } continue; }
        // a new fight (its rounds start again): counted from its first round
        if (e.round === undefined || e.round > round) { e.round = round; changed = true; }
        if (this.settings.showRounds) shown.push({ e, text: upFor(round - e.round, this.roundSecs(t)) });
      }
      const sf = this.tabSurface(t); const layer = sf.layer(); const m = sf.mapping();
      const had = layer?.querySelector<HTMLElement>(':scope > .sfx-rounds') ?? null;
      if (!layer || !m || !shown.length) { had?.remove(); continue; }
      const box = had ?? layer.createDiv({ cls: 'sfx-rounds' });
      const s = this.scaleOf(t);
      const els = Array.from(box.children) as HTMLElement[];
      shown.forEach(({ e, text }, i) => {
        const el = els[i] ?? box.createDiv({ cls: 'sfx-round' });
        const follow = e.token ? this.tokenOf(t, e.token) : null;
        const b = boxOf(e, s, follow);
        const top = Math.min(b.h, b.w) / 2;
        const p = m.toLocal(b.cx, b.cy - (e.shape === 'wall' ? 0 : top));
        if (el.textContent !== text) el.textContent = text;
        el.setCssStyles({ left: `${Math.round(p.x)}px`, top: `${Math.round(p.y)}px` });
      });
      for (const el of els.slice(shown.length)) el.remove();
    }
    if (changed) this.saveSoon();
  }

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
        // (its Atlas area gives it, where Atlas keeps areas: none of the add-on's own)
        const wants = !!e.light && e.lasting && !(this.areaLight.has(e.id) && this.areasOn(t));
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
    if (e.shape === 'cone') return coneLocal(e, b.w, b.h, 12).map((q) => turn(q.x, q.y));
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

  /**
   * A spell's range round its caster, as a ring to show while placing, and how far that reaches (world units,
   * from the caster's centre: their space's edge plus the range). Null without a range (Self, or not said).
   */
  rangeRing(tab: Tab, pending: Pending, caster: { x: number; y: number; r: number }): { ring: Effect; reach: number } | null {
    const ft = pending.range;
    if (!ft || !(ft > 0)) return null;
    const ppf = pxPerFoot(this.scaleOf(tab));
    const reach = caster.r + ft * ppf;
    return { reach, ring: { id: 'preview-range', map: this.mapOf(tab), name: pending.name, shape: 'radius', size: reach / ppf, at: { x: caster.x, y: caster.y }, colour: pending.colour, lasting: false, started: 0 } };
  }

  /**
   * A spell that teleports its caster (Misty Step, Dimension Door): the caster (from the statblock, or clicked),
   * how far they can go shown round them, then a click where they go. Its animation plays where they leave and where
   * they arrive, and the token moves there (Atlas's own move: Ctrl+Z puts it back), its space on the grid.
   */
  teleportCast(tab: Tab, pending: Pending, casterToken?: string): void {
    const doc = tab.canvas.ownerDocument;
    const hint = (tab.canvas.parentElement ?? doc.body).createDiv({ cls: 'sfx-hint' });
    const reach = pending.teleport ?? 0;
    let caster: { id: string; x: number; y: number; r: number } | null = null;
    const say = () => { hint.textContent = `${pending.name}: ` + (caster ? `click where ${this.tokenName(tab, caster.id)} teleports to (up to ${reach} ${unitLabel()})` : 'click the token that teleports') + '   ·   Esc to stop'; };
    const toWorld = (e: PointerEvent | MouseEvent): Point | null => {
      const r = tab.canvas.getBoundingClientRect();
      if (e.clientX < r.left || e.clientY < r.top || e.clientX > r.right || e.clientY > r.bottom) return null;
      const p = call<Point>(tab.viewport, 'toWorld', e.clientX - r.left, e.clientY - r.top);
      return p && Number.isFinite(p.x) ? { x: p.x, y: p.y } : null;
    };
    const ppf = pxPerFoot(this.scaleOf(tab));
    const map = this.mapOf(tab);
    // where the token lands: within reach of where it stands (middle to middle), its space on the grid
    const landing = (p: Point, ev?: { altKey?: boolean }): Point | null => {
      if (!caster) return null;
      const max = reach * ppf;
      const clamp = (q: Point): Point => { const dx = q.x - caster!.x, dy = q.y - caster!.y, d = Math.hypot(dx, dy); return d <= max || d === 0 ? q : { x: caster!.x + dx * max / d, y: caster!.y + dy * max / d }; };
      const tok = t0();
      const cells = Math.max(1, Math.round(typeof tok?.size === 'number' && tok.size > 0 ? tok.size : 1));
      const cell = this.scaleOf(tab).cell;
      const snap = (q: Point): Point => {
        if (!this.snapOn(ev)) return q;
        // an odd-sized token's middle sits in a square's middle, an even one's on a corner
        if (cells % 2 === 0) return this.snapPoint(tab, q, ev);
        const c = this.snapPoint(tab, { x: q.x - cell / 2, y: q.y - cell / 2 }, ev);
        return { x: c.x + cell / 2, y: c.y + cell / 2 };
      };
      let q = snap(clamp(p));
      // snapped past its reach: a square nearer
      for (let i = 0; i < 4 && Math.hypot(q.x - caster.x, q.y - caster.y) > max + 0.5; i++) {
        const d = Math.hypot(q.x - caster.x, q.y - caster.y);
        q = snap({ x: caster.x + (q.x - caster.x) * (d - cell) / d, y: caster.y + (q.y - caster.y) * (d - cell) / d });
      }
      return Math.hypot(q.x - caster.x, q.y - caster.y) <= max + 0.5 ? q : { x: caster.x, y: caster.y };
    };
    const t0 = () => (caster ? tab.store.getState()?.objects?.tokens?.[caster.id] : undefined);
    const ghost = (q: Point): Effect => ({ id: 'preview', map, name: pending.name, shape: 'radius', size: (caster?.r ?? 0) / ppf, at: q, colour: pending.colour, ...(pending.colour2 ? { colour2: pending.colour2 } : {}), outline: true, lasting: false, started: 0 });
    const ring = (): Effect | null => (caster ? { id: 'preview-range', map, name: pending.name, shape: 'radius', size: reach + caster.r / ppf, at: { x: caster.x, y: caster.y }, colour: pending.colour, lasting: false, started: 0 } : null);
    const choose = (id: string): boolean => {
      const at = this.tokenOf(tab, id); if (!at) return false;
      caster = { id, x: at.x, y: at.y, r: at.r };
      if (this.placing) this.placing.range = ring();
      say(); this.wake();
      return true;
    };
    const move = (e: PointerEvent) => {
      const p = toWorld(e); if (!p || !this.placing) return;
      const q = landing(p, e);
      this.placing.preview = q ? ghost(q) : null;
    };
    const down = (e: PointerEvent) => {
      const p = toWorld(e); if (!p || !this.placing) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      if (e.button === 2) { this.placing.stop(); return; }
      if (e.button !== 0) return;
      if (!caster) { const tok = this.tokenAt(tab, p); if (tok) choose(tok.id); return; }
      const q = landing(p, e); const from = { x: caster.x, y: caster.y }; const id = caster.id;
      this.placing.stop();
      if (!q) return;
      this.teleportTo(tab, pending, id, from, q);
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
      for (const [ev, fn] of [['pointermove', move], ['pointerdown', down], ['pointerup', swallow], ['click', swallow], ['contextmenu', swallow], ['keydown', key]] as const) doc.removeEventListener(ev, fn as EventListener, opts);
      hint.remove();
      if (this.placing?.tab === tab) this.placing = null;
    };
    this.placing = { tab, pending, caster: null, preview: null, stop: () => { stop(); this.bars(); this.wake(); }, hint, range: null };
    // the caster: the statblock's creature, or the one token selected
    const sel = (tab.store.getState()?.selectedIds ?? []).filter((id: string) => tab.store.getState()?.objects?.tokens?.[id]);
    if (!(casterToken && choose(casterToken)) && !(sel.length === 1 && choose(sel[0]))) say();
    this.wake();
  }

  /** The teleport itself: its animation where they leave and where they arrive, and the token moved there. */
  teleportTo(tab: Tab, pending: Pending, id: string, from: Point, to: Point): void {
    const at = this.tokenOf(tab, id); const st = tab.store.getState();
    if (!at || typeof st.moveToken !== 'function') { new Notice('Atlas Spell Effects: couldn’t move that token.'); return; }
    const ppf = pxPerFoot(this.scaleOf(tab));
    const map = this.mapOf(tab);
    const puff = (p: Point): Effect => ({ id: uid(), map, name: pending.name, shape: 'radius', size: at.r / ppf, at: { x: p.x, y: p.y }, colour: pending.colour, ...(pending.colour2 ? { colour2: pending.colour2 } : {}), ...(pending.alpha ? { alpha: pending.alpha } : {}), ...(pending.file ? { file: pending.file } : {}), bolt: true, lasting: false, started: Date.now() });
    this.cast(puff(from));
    if (Math.hypot(to.x - from.x, to.y - from.y) < 1) return;
    st.moveToken(id, to.x, to.y);
    this.cast(puff(to));
  }

  /** Click the caster / aim / click the spot on the Atlas map, then it plays. */
  place(pending: Pending, casterToken?: string): void {
    const tab = this.atlasTab();
    if (!tab) { new Notice('Atlas Spell Effects: open an Atlas map first.'); return; }
    this.placing?.stop();
    this.last = pending;
    // the spells cast last, newest first (the same spell once)
    this.settings.recent = [pending, ...this.settings.recent.filter((r) => r.name !== pending.name || r.key !== pending.key)].slice(0, RECENT);
    this.saveSoon();
    if (pending.teleport && pending.teleport > 0) { this.teleportCast(tab, pending, casterToken); return; }
    if (pending.atlas?.tool && pending.atlas.draw !== 'animation' && this.areasOn(tab) && toolShapeOf(pending.area)) { this.placeWithAtlas(tab, pending); return; }
    if (pending.area.shape === 'wall') { this.drawWall(tab, pending); return; }
    if (pending.area.target) { this.castAt(tab, pending, casterToken); return; }
    const a = pending.area;
    const doc = tab.canvas.ownerDocument;
    const hint = (tab.canvas.parentElement ?? doc.body).createDiv({ cls: 'sfx-hint' });
    const needsCaster = a.from === 'caster';
    const aims = a.shape === 'cone' || a.shape === 'line' || (a.shape === 'cube' && a.from === 'caster');
    const say = () => { hint.textContent = `${pending.name}: ` + (needsCaster && !this.placing?.caster ? `first click the caster’s token (it starts from them${aims ? '; then aim' : ''})` : aims ? 'aim and click' : reach ? `click where it goes (within its ${pending.range} ${unitLabel()} range, shown round the caster)` : 'click where it goes') + '   ·   Esc to stop'; };
    const toWorld = (e: PointerEvent | MouseEvent): Point | null => {
      const r = tab.canvas.getBoundingClientRect();
      if (e.clientX < r.left || e.clientY < r.top || e.clientX > r.right || e.clientY > r.bottom) return null;
      const p = call<Point>(tab.viewport, 'toWorld', e.clientX - r.left, e.clientY - r.top);
      return p && Number.isFinite(p.x) ? { x: p.x, y: p.y } : null;
    };
    let alt = false;
    // a spell cast at a point, by a known caster (a statblock's creature): its range shows round them, and the
    // area can't go beyond it
    const rc = casterToken && !needsCaster ? this.tokenOf(tab, casterToken) : null;
    const reach = rc ? this.rangeRing(tab, pending, rc) : null;
    const inRange = (p: Point): Point => reach && rc ? inReach(p, rc, reach.reach) : p;
    // a cone shown (and cast) as Atlas will draw it
    const effectAt = (q: Point, id: string): Effect | null => { const fx = shapeAt(q, id); if (fx) this.fitCone(fx, tab); return fx; };
    const shapeAt = (q: Point, id: string): Effect | null => {
      const map = this.mapOf(tab); const sc = this.scaleOf(tab);
      const p = aims || needsCaster ? q : inRange(q);
      const base = { id, map, name: pending.name, shape: a.shape, size: a.size, ...(a.width ? { width: a.width } : {}), ...(a.shape === 'cone' ? { angle: a.angle ?? this.coneAngle() } : {}), colour: pending.colour, ...(pending.colour2 ? { colour2: pending.colour2 } : {}), ...(pending.alpha ? { alpha: pending.alpha } : {}), lasting: a.lasting, started: Date.now(), ...(pending.file ? { file: pending.file } : {}), ...(pending.light && id !== 'preview' ? { light: { ...pending.light } } : {}), ...condsOf(pending) };
      const c = this.placing?.caster;
      if (needsCaster && !c) {
        // before the caster is chosen: show the area on whatever is under the pointer
        const tok = this.tokenAt(tab, p);
        return { ...base, at: tok ? { x: tok.x, y: tok.y } : p, ...(aims ? { dir: 0 } : {}) };
      }
      if (aims && c) return { ...base, at: { x: c.x, y: c.y }, dir: dirTo(c, p), ...(c.token ? { caster: c.token } : {}), ...(c.token && (pending.attach || a.shape === 'cube') ? { token: c.token } : {}) };
      if (needsCaster && c) return { ...base, at: { x: c.x, y: c.y }, ...(c.token ? { token: c.token, caster: c.token } : {}) };
      void sc;
      const at = a.shape === 'radius' || a.shape === 'cube' ? inRange(this.snapPoint(tab, p, { altKey: alt })) : p;
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
    this.placing = { tab, pending, caster: null, preview: null, stop: () => { stop(); this.bars(); }, hint, range: reach?.ring ?? null };
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
    const ring = (c: { x: number; y: number; r: number } | null) => { if (this.placing) this.placing.range = c ? this.rangeRing(tab, pending, c)?.ring ?? null : null; };
    const toWorld = (e: PointerEvent | MouseEvent): Point | null => {
      const r = tab.canvas.getBoundingClientRect();
      if (e.clientX < r.left || e.clientY < r.top || e.clientX > r.right || e.clientY > r.bottom) return null;
      const p = call<Point>(tab.viewport, 'toWorld', e.clientX - r.left, e.clientY - r.top);
      return p && Number.isFinite(p.x) ? { x: p.x, y: p.y } : null;
    };
    const say = () => {
      hint.textContent = `${pending.name}: ` + (bolt && !caster ? 'click the caster (a token, or a spot)   ·   Esc to stop'
        : a.self ? 'click the caster’s token   ·   Esc to stop'
        : count ? 'click another target, or Esc / right-click when done' : 'click a target (a creature, or a spot)   ·   Esc to stop');
    };
    const effect = (id: string, p: Point): Effect | null => this.targetEffect(tab, pending, caster, id, p);
    const move = (e: PointerEvent) => { const p = toWorld(e); if (!p || !this.placing) return; this.placing.preview = effect('preview', p); this.wake(); };
    const down = (e: PointerEvent) => {
      const p = toWorld(e); if (!p || !this.placing) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      if (e.button === 2) { this.placing.stop(); return; }
      if (e.button !== 0) return;
      if (bolt && !caster) {
        const tok = this.tokenAt(tab, p);
        caster = tok ? { x: tok.x, y: tok.y } : this.snapPoint(tab, p, e);
        ring({ ...caster, r: tok?.r ?? 0 });
        say(); return;
      }
      const fx = effect(uid(), p);
      if (fx) { this.castTarget(fx, pending); count++; }
      if (fx && a.self) { this.placing.stop(); return; }          // only the caster: done
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
    // on the caster only, and the caster known (cast from their statblock): on them at once
    if (a.self && ct) { const fx = effect(uid(), { x: ct.x, y: ct.y }); this.placing.stop(); if (fx) this.cast(fx); return; }
    ring(ct);
    this.bars();
    say();
    this.wake();
  }

  /** A targeted spell's effect: on the token at `p` (or the spot), or a bolt from `caster` to it. */
  private targetEffect(tab: Tab, pending: Pending, caster: Point | null, id: string, p: Point, on?: string): Effect | null {
    const a = pending.area;
    const bolt = a.target === 'bolt';
    const tok = on ? (() => { const k = this.tokenOf(tab, on); return k ? { ...k, id: on } : null; })() : this.tokenAt(tab, p);
    const base = { id, map: this.mapOf(tab), name: pending.name, colour: pending.colour, ...(pending.colour2 ? { colour2: pending.colour2 } : {}), ...(pending.alpha ? { alpha: pending.alpha } : {}), started: Date.now(), ...(pending.file ? { file: pending.file } : {}), ...condsOf(pending) };
    if (bolt) {
      if (!caster) return null;
      const to = tok ? { x: tok.x, y: tok.y } : p;
      const len = Math.hypot(to.x - caster.x, to.y - caster.y) / pxPerFoot(this.scaleOf(tab));
      if (len < 1) return null;
      // the animation in the length nearest the distance (JB2A makes rays for 5 to 90 ft)
      const file = pending.file ? nearestLength(pending.file, this.files.filter((f) => !f.remote), len / Math.max(1e-6, fromFeet(1))) : undefined;
      return { ...base, ...(file ? { file } : {}), bolt: true, shape: 'line', size: Math.round(len * 10) / 10, width: a.width ?? square(), at: { x: caster.x, y: caster.y }, dir: dirTo(caster, to), lasting: false };
    }
    return { ...base, shape: 'emanation', size: a.size, at: tok ? { x: tok.x, y: tok.y } : p, ...(tok ? { token: tok.id } : {}), on: true, lasting: a.lasting, ...(pending.light && id !== 'preview' ? { light: { ...pending.light } } : {}) };
  }

  /** A targeted spell's effect cast (a bolt: its animation in the length nearest the distance, fetched from JB2A the first time it's needed). */
  private castTarget(fx: Effect, pending: Pending): void {
    if (fx.bolt && pending.file) {
      const want = nearestLength(pending.file, this.files, fx.size / Math.max(1e-6, fromFeet(1)));
      void (async () => { if (want !== fx.file && await this.ensureFile(want)) { fx.file = want; this.indexVault(); } this.cast(fx); })();
    } else this.cast(fx);
  }

  /** The creatures a targeted spell could go on: in its range of the caster, nearest first (no caster: everyone). */
  targetsFor(t: Tab, pending: Pending, caster?: string): { id: string; name: string; ft: number | null }[] {
    const toks = t.store.getState()?.objects?.tokens ?? {};
    const c = caster ? this.tokenOf(t, caster) : null;
    const ppf = pxPerFoot(this.scaleOf(t));
    const reach = c && pending.range && pending.range > 0 ? pending.range * ppf : Infinity;
    const out: { id: string; name: string; ft: number | null }[] = [];
    for (const id of Object.keys(toks)) {
      if (id === caster) continue;
      const k = this.tokenOf(t, id); if (!k) continue;
      const gap = c ? Math.max(0, Math.hypot(k.x - c.x, k.y - c.y) - c.r - k.r) : 0;
      if (gap > reach + 0.5) continue;
      out.push({ id, name: this.tokenName(t, id), ft: c ? Math.round(gap / ppf / square()) * square() : null });
    }
    return out.sort((x, y) => (x.ft ?? 0) - (y.ft ?? 0) || x.name.localeCompare(y.name));
  }

  /** A targeted spell cast straight on a creature (picked from the Cast menu), from its caster. */
  castOnTarget(t: Tab, pending: Pending, target: string, caster?: string): void {
    const k = this.tokenOf(t, target); if (!k) return;
    const c = caster ? this.tokenOf(t, caster) : null;
    this.last = pending;
    this.settings.recent = [pending, ...this.settings.recent.filter((r) => r.name !== pending.name || r.key !== pending.key)].slice(0, RECENT);
    this.saveSoon();
    const fx = this.targetEffect(t, pending, c ? { x: c.x, y: c.y } : null, uid(), { x: k.x, y: k.y }, target);
    if (fx) this.castTarget(fx, pending);
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
      colour: pending.colour, ...(pending.colour2 ? { colour2: pending.colour2 } : {}), ...(pending.alpha ? { alpha: pending.alpha } : {}), lasting: a.lasting, started: Date.now(), ...(pending.file ? { file: pending.file } : {}), ...condsOf(pending),
      ...(pending.light && id !== 'preview' ? { light: { ...pending.light } } : {}),
    });
    const ring = (id: string, c: Point): Effect => wall(id, ringPoints(a.ring!, this.scaleOf(tab)).map((p) => ({ x: c.x + p.x, y: c.y + p.y })), true);
    const say = () => {
      const used = Math.round(pathLength(next ? [...pts, next] : pts) / ppf());
      hint.textContent = `${pending.name}: ` + (round ? 'click the ring’s centre'
        : !pts.length ? `click where the wall starts (up to ${a.size} ${unitLabel()})`
        : `click the next corner · ${used} of ${a.size} ${unitLabel()} · Enter, double-click or right-click to finish · Backspace takes a corner back`) + '   ·   Esc to stop';
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

  /**
   * A cone that is one of Atlas's areas: drawn as Atlas draws it (its game's cone angle, and round-ended unless its
   * rules make cones flat), so the add-on's cone and Atlas's are the same shape. True: changed.
   */
  fitCone(e: Effect, t: Tab | null = this.atlasTab()): boolean {
    if (e.shape !== 'cone' || !t || !this.areasOn(t) || e.draw === 'animation' || e.on || e.bolt || e.outline) return false;
    this.scaleOf(t);                                               // Atlas's rules read
    const angle = this.atlasSystem?.cone ?? CONE_ANGLE, round = this.atlasSystem?.coneRound ?? true;
    if (e.angle === angle && !!e.coneRound === round) return false;
    e.angle = angle;
    if (round) e.coneRound = true; else delete e.coneRound;
    return true;
  }

  cast(e: Effect): void {
    this.fitCone(e, this.atlasTabs().find((x) => this.mapOf(x) === e.map) ?? null);
    window.setTimeout(() => this.bars(), 0);
    const before = this.snapshot();
    this.effects.push(e);
    if (e.lasting) { this.commit(before); this.saveSoon(); }
    else { this.toCatch.set(e.id, Date.now()); this.catchPending(); }
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
    const back = want.map((w): Effect => {
      const had = now.get(w.id);
      return { ...w, ...(had?.lightIds ? { lightIds: had.lightIds } : {}), ...(had?.wallIds ? { wallIds: had.wallIds } : {}) };
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
        if (best) { const st = square(), ft = Math.round(best.d / ppf / st) * st; bits.push(ft <= st ? `by ${this.tokenName(t, best.id)}` : `${Math.round(ft * 10) / 10} ${unitLabel()} from ${this.tokenName(t, best.id)}`); }
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
/** The cast window's area choices: the shapes, and "On a creature" (an aura that fits it, cast at creatures). */
type AreaChoice = Shape | 'on';
const AREA_CHOICES: [AreaChoice, string][] = [['radius', 'Sphere'], ['emanation', 'Around caster'], ['on', 'On a creature'], ['cone', 'Cone'], ['cube', 'Cube'], ['line', 'Line'], ['wall', 'Wall']];

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
    const cols = coloursOf(cur, P.files, c.size / Math.max(1e-6, fromFeet(1)));
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
    b.onclick = () => set(k === 'none' ? null : k === 'darkness' ? { mode: 'darkness', bright: 0, dim: light?.dim ?? squares(3) } : { mode: 'light', bright: light?.mode === 'light' ? light.bright : squares(4), dim: light?.mode === 'light' ? light.dim : squares(8), ...(light?.colour ? { colour: light.colour } : {}) });
  }
  const f = box.createDiv({ cls: 'sfx-fields' });
  if (light?.mode === 'light') {
    f.createSpan({ text: 'Bright' });
    const b = f.createEl('input', { type: 'number', value: String(light.bright) }); b.min = '0';
    f.createSpan({ text: `${unitLabel()}, dim to` });
    const d = f.createEl('input', { type: 'number', value: String(light.dim) }); d.min = '0';
    f.createSpan({ text: unitLabel() });
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
        f.createSpan({ text: unitLabel() });
      } else {
        f.createSpan({ cls: 'sfx-chip', text: `${Math.round(pathLength(fx.points ?? []) / pxPerFoot(sc))} ${unitLabel()} long, ${(fx.points?.length ?? 1) - 1} stretch${(fx.points?.length ?? 1) - 1 === 1 ? '' : 'es'}` });
      }
      f.createSpan({ text: 'Thickness' });
      const th = f.createEl('input', { type: 'number', value: String(fx.width ?? 1) }); th.min = '0.1'; th.step = '0.5';
      th.oninput = () => { const v = Number(th.value); if (v > 0) { fx.width = v; this.changed(); } };
      f.createSpan({ text: unitLabel() });
    } else {
    f.createSpan({ text: fx.shape === 'radius' || fx.shape === 'emanation' ? 'Radius' : fx.shape === 'cube' ? 'Side' : 'Length' });
    const size = f.createEl('input', { type: 'number', value: String(fx.size) }); size.min = '1';
    size.oninput = () => { const v = Number(size.value); if (v > 0) { fx.size = v; this.changed(); } };
    f.createSpan({ text: unitLabel() });
    }
    if (fx.shape === 'line') {
      f.createSpan({ text: 'Width' }); const w = f.createEl('input', { type: 'number', value: String(fx.width ?? square()) });
      w.oninput = () => { const v = Number(w.value); if (v > 0) { fx.width = v; this.changed(); } }; f.createSpan({ text: unitLabel() });
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
  private area: Area = { shape: 'radius', size: squares(4), from: 'point', lasting: false };
  private file: string | undefined;
  private colour = '#ff8a2a';
  private colour2: string | undefined;
  private alpha: number | undefined;
  private attach = false;
  private light: EffectLight | null = null;
  /** The conditions it gives the creatures inside it (names of the collection's conditions). */
  private conditions: string[] = [];
  /** How far from its caster it can be cast (game units): from its text, or as saved. */
  private range: number | undefined;
  /** How far it teleports its caster (game units); 0: it doesn't. */
  private teleport = 0;
  /** Atlas's look for its area (fire, frost…); '': none. */
  private look: AreaLook | '' = '';
  /** Its Atlas area's other choices: how it's drawn, its light, walls, players, how it's placed. */
  private atlas: AtlasChoices = {};
  /** Cast from a statblock: its creature is the caster. */
  casterToken: string | undefined;
  /** Opened for one of Atlas's own areas: the spell goes on it (its animation, conditions…), where it lies. */
  forArea: { tab: Tab; id: string } | undefined;
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
    if (this.choice) { this.render(); return; }      // opened with a spell already picked
    const last = this.plugin.last;
    if (last) { const c = this.plugin.choices().find((x) => x.name === last.name); if (c) void this.pick(c); else this.render(); } else this.render();
  }

  /** A spell picked: as it was saved, or what its text says (and the best animation for it). */

  async pick(c: Choice | null): Promise<void> {
    this.choice = c; this.saved = '';
    const P = this.plugin;
    this.colour2 = undefined; this.alpha = undefined;
    if (c?.stored) {
      const st = c.stored;
      this.name = st.name; this.area = { ...st.area }; this.file = st.file; this.colour = st.colour ?? this.colour; this.attach = !!st.attach;
      this.colour2 = st.colour2; this.alpha = st.alpha;
      this.light = st.light !== undefined ? st.light : lightOf(c.entry ?? null, this.area);
      this.conditions = st.conditions ?? spellConditions(c.entry ?? null, P.conditionNames());
      this.range = st.range ?? (c.entry ? rangeOf(c.entry) ?? undefined : undefined);
      this.teleport = st.teleport ?? (c.entry ? teleportOf(c.entry) ?? 0 : 0);
      this.atlas = { ...(st.atlas ?? {}) };
      this.look = st.look !== undefined ? ((AREA_LOOKS as readonly string[]).includes(st.look) ? st.look as AreaLook : '') : lookOf(c.entry ?? null) ?? '';
      this.saved = `Saved in ${st.path}`;
    } else if (c) {
      const entry = await P.noteEntry(c);
      const r = entry ? inUnitsNow(P.settings.remember[entry.key]) : undefined;
      const a = entry ? areaOf(entry) ?? targetOf(entry) ?? fallbackArea(entry) : null;
      this.name = c.name;
      this.area = { shape: r?.shape ?? a?.shape ?? 'radius', size: r?.size ?? a?.size ?? squares(4), ...((r?.width ?? a?.width) ? { width: r?.width ?? a?.width } : {}), ...(r?.angle ? { angle: r.angle } : {}), from: r?.from ?? a?.from ?? 'point', lasting: r?.lasting ?? a?.lasting ?? false,
        ...((r?.ring ?? a?.ring) ? { ring: r?.ring ?? a?.ring } : {}), ...(r?.round ? { round: true } : {}), ...((r?.blocks ?? a?.blocks) ? { blocks: r?.blocks ?? a?.blocks } : {}), ...((r ? r.target : a?.target) ? { target: (r ? r.target : a?.target)! } : {}), ...((r ? r.self : a?.self) ? { self: true } : {}) };
      if (this.area.target === 'on' && !r) this.area.size = a?.size ?? 0;
      this.file = r ? r.file : matchesFor(c.name, this.area.shape, P.files, 1)[0]?.file.path;
      if (r?.colour) this.colour = r.colour;
      this.colour2 = r?.colour2; this.alpha = r?.alpha;
      this.attach = false;
      this.light = r && r.light !== undefined ? r.light : lightOf(entry, this.area);
      this.conditions = r?.conditions ?? spellConditions(entry, P.conditionNames());
      this.range = entry ? rangeOf(entry) ?? undefined : undefined;
      this.teleport = r?.teleport ?? (entry ? teleportOf(entry) ?? 0 : 0);
      this.atlas = { ...(r?.atlas ?? {}) };
      this.look = r?.look !== undefined ? ((AREA_LOOKS as readonly string[]).includes(r.look) ? r.look as AreaLook : '') : lookOf(entry) ?? '';
    } else {
      this.name = 'Effect'; this.light = null; this.conditions = []; this.range = undefined; this.teleport = 0; this.look = ''; this.atlas = {};
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
      const rest = all.filter((c) => c.source !== 'stored' && (words.length || (c.entry && areaOf(c.entry)))).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })).slice(0, 80);
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
      const item = (g: HTMLElement, c: Choice) => {
        const a = c.stored ? c.stored.area : c.entry ? areaOf(c.entry) : null;
        row(g, c.source === 'stored' ? 'sfx-saved-row' : '', c.source === 'stored' ? 'star' : 'wand-2', c.name, a ? (a.target === 'bolt' ? 'bolts' : a.target === 'on' ? (a.self ? 'on the caster' : 'on creatures') : describe(a).replace(' around the caster', a.shape === 'emanation' ? ' around' : '')) : c.source === 'note' ? 'note' : '', this.choice?.key === c.key, () => { void this.pick(c); });
      };
      // the spells cast last (without a search), newest first
      const recent = words.length ? [] : P.settings.recent.map((r) => all.find((c) => c.key === r.key) ?? all.find((c) => c.name.toLowerCase() === r.name.toLowerCase())).filter((c, i, a): c is Choice => !!c && a.indexOf(c) === i);
      if (recent.length) { const g = group('Recent', recent.length); if (g) for (const c of recent) item(g, c); }
      if (stored.length) { const g = group('Saved spells', stored.length); if (g) for (const c of stored) item(g, c); }
      if (rest.length) { const g = group(words.length ? 'Other spells' : 'Spells with an area', rest.length); if (g) for (const c of rest) item(g, c); }
      const own = list.createDiv({ cls: 'sfx-rows' });
      row(own, 'sfx-own', 'plus', 'An effect of your own', '', this.choice === null, () => { void this.pick(null); });
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
    if (this.choice) ht.createEl('h3', { text: this.name });
    else { const n = ht.createEl('input', { type: 'text', value: this.name, placeholder: 'Name' }); n.oninput = () => { this.name = n.value || 'Effect'; }; }
    const acts = head.createDiv({ cls: 'sfx-head-actions' });
    ht.createSpan({ cls: 'sfx-chip', text: this.choice?.source === 'stored' ? 'Saved' : this.choice?.source === 'note' ? 'Spell note' : 'Your own effect' });

    // the settings scroll; the colour and the buttons stay in view below them
    const body = pane.createDiv({ cls: 'sfx-body' });
    const bottom = pane.createDiv({ cls: 'sfx-bottom' });
    // area
    const area = body.createDiv();
    area.createDiv({ cls: 'sfx-label', text: 'Area' });
    const seg = area.createDiv({ cls: 'sfx-seg' });
    const chosen: AreaChoice = this.area.target === 'on' ? 'on' : this.area.shape;
    for (const [c, label] of AREA_CHOICES) {
      const b = seg.createEl('button', { text: label, cls: chosen === c ? 'is-on' : '' });
      if (c === 'on') {
        b.title = 'The effect plays on a creature, round its token (Shield, Bless, Hold Person): on the caster, or on each creature you click';
        b.onclick = () => { this.area = { ...this.area, shape: 'emanation', from: 'caster', target: 'on', size: 0 }; this.render(); };
        continue;
      }
      const k = c;
      b.onclick = () => { if (this.area.target === 'on') { delete this.area.target; delete this.area.self; if (!this.area.size) this.area.size = squares(2); } this.area = { ...this.area, shape: k, from: k === 'radius' || k === 'cube' ? this.area.from : k === 'wall' ? 'point' : 'caster' }; if (k === 'line' && !this.area.width) this.area.width = square(); if (k === 'wall' && !this.area.width) this.area.width = fromFeet(1); if (k === 'wall' && this.area.lasting === false) this.area.lasting = true; if (this.area.target && !((k === 'line' && this.area.target === 'bolt') || (k === 'emanation' && this.area.target === 'on'))) delete this.area.target; this.render(); };
    }
    const f = area.createDiv({ cls: 'sfx-fields' });
    const lab = (t: string) => f.createSpan({ text: t });
    if (this.area.shape === 'wall') {
      const ws = f.createDiv({ cls: 'sfx-seg' });
      for (const [k, t] of [[false, 'Straight'], [true, 'Ring']] as const) {
        const b = ws.createEl('button', { text: t, cls: !!this.area.round === k ? 'is-on' : '' });
        b.onclick = () => { this.area.round = k || undefined; if (!k) delete this.area.round; if (k && !this.area.ring) this.area.ring = squares(4); this.render(); };
      }
    }
    if (this.area.shape === 'wall' && this.area.round) {
      lab('Diameter');
      const dia = f.createEl('input', { type: 'number', value: String(this.area.ring ?? squares(4)) }); dia.min = '1';
      dia.onchange = () => { this.area.ring = Math.max(1, Number(dia.value) || this.area.ring || squares(4)); };
      lab(unitLabel());
    } else {
      if (this.area.target === 'bolt') lab('From the caster to each target');
      else {
      if (this.area.target === 'on') {
        const who = f.createDiv({ cls: 'sfx-seg' });
        for (const [k, t] of [[true, 'The caster'], [false, 'Each creature you click']] as const) {
          const b = who.createEl('button', { text: t, cls: !!this.area.self === k ? 'is-on' : '' });
          b.onclick = () => { if (k) this.area.self = true; else delete this.area.self; this.render(); };
        }
      }
      lab(this.area.target === 'on' ? 'Reaching' : this.area.shape === 'radius' || this.area.shape === 'emanation' ? 'Radius' : this.area.shape === 'cube' ? 'Side' : this.area.shape === 'wall' ? 'Up to' : 'Length');
      const size = f.createEl('input', { type: 'number', value: String(this.area.size) }); size.min = this.area.target === 'on' ? '0' : '1';
      size.onchange = () => { const v = Number(size.value); this.area.size = this.area.target === 'on' ? Math.max(0, Number.isFinite(v) ? v : 0) : Math.max(1, v || this.area.size); };
      }
      lab(this.area.shape === 'wall' ? `${unitLabel()} long` : this.area.target === 'on' ? `${unitLabel()} past its space` : unitLabel());
    }
    if (this.area.shape === 'wall') {
      lab('Thickness'); const w = f.createEl('input', { type: 'number', value: String(this.area.width ?? 1) }); w.min = '0.1'; w.step = '0.5';
      w.onchange = () => { this.area.width = Math.max(0.1, Number(w.value) || 1); }; lab(unitLabel());
    }
    if (this.area.shape === 'line') {
      lab('Width'); const w = f.createEl('input', { type: 'number', value: String(this.area.width ?? square()) }); w.onchange = () => { this.area.width = Math.max(0.1, Number(w.value) || square()); }; lab(unitLabel());
    }
    if (this.area.shape === 'cone') {
      lab('Angle');
      const an = f.createEl('input', { type: 'number', value: String(Math.round((this.area.angle ?? P.coneAngle()) * 100) / 100) }); an.min = '1'; an.max = '170'; an.step = '1';
      an.title = 'The cone’s angle at its point. The default (in the settings) suits your game: 53° is 5e’s (as wide as it is long), 90° Pathfinder’s';
      an.onchange = () => { const v = Number(an.value); if (v >= 1 && v <= 170) this.area.angle = v; else { delete this.area.angle; an.value = String(P.coneAngle()); } this.render(); };
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
    if (this.area.shape === 'line') {
      toggle('A bolt at creatures (click each)', this.area.target === 'bolt', (v) => {
        if (v) this.area.target = 'bolt'; else delete this.area.target;
        this.render();
      }, 'Click each target token after casting: it shoots to it from the caster');
    }
    if (this.area.target !== 'bolt') toggle('Lasts until ended', this.area.lasting, (v) => { this.area.lasting = v; this.render(); });
    toggle('Snap to grid', P.settings.snap, () => { void P.toggleSnap(); }, 'Areas land on grid corners, sizes go in whole squares (Alt: the other way)');
    if (!this.area.target && (this.area.shape === 'cone' || this.area.shape === 'line' || (this.area.shape === 'cube' && this.area.from === 'caster') || (this.area.shape === 'radius' && this.area.from === 'caster'))) {
      toggle('Follows the caster', this.attach, (v) => { this.attach = v; }, 'It moves with the caster’s token (a beholder’s eye, a breath that stays)');
    }

    if (this.area.shape === 'wall') wallsPicker(body, this.area.blocks, this.area.lasting, (b) => { this.area.blocks = b; this.render(); });
    lightPicker(body, this.light, this.area.lasting, (l) => { this.light = l; this.render(); });
    if (this.area.target !== 'bolt' && this.area.lasting) this.conditionsPicker(body);
    this.teleportPicker(body);
    if (this.area.target !== 'bolt' && this.area.target !== 'on' && this.area.shape !== 'wall') this.atlasPicker(body);

    lookPicker(body.createDiv(), bottom, { app: this.app, plugin: P, name: this.name === 'Effect' ? '' : this.name, shape: this.area.shape, angle: this.area.angle ?? P.coneAngle(), size: this.area.size, file: this.file, colour: this.colour, colour2: this.colour2, alpha: this.alpha, fileQuery: this.fileQuery,
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
    // saving: one kind of thing, a saved spell (kept in a note's effect-… properties)
    const st = this.choice?.stored;
    const look = () => ({ area: { ...this.area }, file: this.file, colour: this.colour, colour2: this.colour2, alpha: this.alpha, attach: this.attach, light: this.light, range: this.range, conditions: [...this.conditions], teleport: this.teleport, look: this.look, atlas: { ...this.atlas } });
    const keep = async (btn: { disabled: boolean }, c: { name: string; stored?: StoredSpell; entry?: SpellEntry; notePath?: string }, menu: boolean | undefined) => {
      btn.disabled = true;
      try {
        const path = await P.storeSpell(c, { ...look(), menu });
        this.choice = P.choices().find((x) => x.stored?.path === path) ?? this.choice; this.saved = `Saved in ${path}`;
        this.render();
      } catch (e) { new Notice('Atlas Spell Effects: could not save it (' + (e instanceof Error ? e.message : String(e)) + ')'); btn.disabled = false; }
    };
    if (st) {
      const own = P.ownNote(st.path);
      const del = acts.createEl('button', { cls: 'clickable-icon sfx-icon-btn sfx-danger', attr: { 'aria-label': 'Delete saved spell' } }); setIcon(del, 'trash-2');
      del.title = own ? `Deletes this saved spell (its note, ${st.path}, goes to the bin)` : `Takes this spell’s saved settings off its note (${st.path}); it is cast from its text again`;
      del.onclick = () => new ConfirmModal(this.app, `Delete “${st.name}”?`,
        own ? `Its note, ${st.path}, goes to Obsidian’s bin (you can get it back from there).`
          : `Its saved settings come off its note, ${st.path}. The note itself stays as it is, and the spell is cast from its text again.`,
        'Delete', async () => {
          await P.forgetSpell(st); this.saved = `Deleted “${st.name}”`;
          this.choice = own ? null : P.choices().find((x) => x.notePath === st.path && !x.stored) ?? null;
          if (this.choice) await this.pick(this.choice); else this.render();
        }).open();
      // in ✨'s menu: a star, filled when it is
      const mc = acts.createEl('button', { cls: 'clickable-icon sfx-icon-btn' + (st.menu ? ' is-on' : ''), attr: { 'aria-label': st.menu ? 'In the ✨ menu (click to take it off)' : 'Add to the ✨ menu, to cast in one click' } });
      setIcon(mc, 'star');
      mc.onclick = () => { void keep(mc, { name: st.name, stored: st }, !st.menu); };
      acts.prepend(mc);
    }
    const sp = foot.createEl('button', { text: 'Save as new…' });
    sp.title = `Keeps all of this as a spell of its own, under a new name (a note in ${P.storageFolder()}): a blue Fireball, a small Darkness…`;
    sp.onclick = () => new NameModal(this.app, this.choice ? `${this.name} (${describe(this.area)})` : this.name, async (name) => {
      await keep(sp, { name, ...(this.choice?.entry ? { entry: this.choice.entry } : {}) }, true);
    }).open();
    const target = st?.path ?? this.choice?.notePath;
    const store = foot.createEl('button', { text: st ? 'Save changes' : 'Save' });
    store.title = target ? `From now on, ${this.name} is cast like this (kept in ${target}, as its effect-… properties)` : `Keeps this as a spell of your own: a note in ${P.storageFolder()}`;
    store.onclick = () => { void keep(store, { name: this.name, ...(st ? { stored: st } : {}), ...(this.choice?.entry ? { entry: this.choice.entry } : {}), ...(this.choice?.notePath ? { notePath: this.choice.notePath } : {}) }, st ? st.menu : !this.choice); };
    const go = foot.createEl('button', { cls: 'mod-cta', text: 'Place on the map' });
    go.onclick = async () => {
      go.disabled = true;
      const p = await this.pending();
      this.close();
      if (this.forArea) P.animateArea(p, this.forArea.tab, this.forArea.id);
      else P.place(p, this.casterToken);
    };
  }

  /** What is set up now, ready to place (its animation fetched first; a spell's choices remembered). */
  async pending(): Promise<Pending> {
      const P = this.plugin;
      if (!(await P.ensureFile(this.file))) this.file = undefined;
      P.indexVault();
      const key = this.choice?.entry?.key ?? this.choice?.key ?? 'effect';
      if (this.choice && !this.choice.stored) P.remember(key, { unit: unitNow(), ...(this.file ? { file: this.file } : {}), colour: this.colour, ...(this.colour2 ? { colour2: this.colour2 } : {}), ...(this.alpha ? { alpha: this.alpha } : {}), shape: this.area.shape, size: this.area.size, ...(this.area.width ? { width: this.area.width } : {}), ...(this.area.angle ? { angle: this.area.angle } : {}), from: this.area.from, lasting: this.area.lasting, light: this.light, ...(this.area.ring ? { ring: this.area.ring } : {}), ...(this.area.round ? { round: true } : {}), ...(this.area.blocks ? { blocks: this.area.blocks } : {}), ...(this.area.target ? { target: this.area.target } : {}), ...(this.area.self ? { self: true } : {}), conditions: [...this.conditions], teleport: this.teleport, look: this.look, atlas: { ...this.atlas } });
      const range = this.range;
      return { name: this.name, key, ...(range ? { range } : {}), ...(this.conditions.length && this.area.target !== 'bolt' ? { conditions: [...this.conditions] } : {}), area: { ...this.area }, ...(this.file ? { file: this.file } : {}), colour: this.colour, ...(this.colour2 ? { colour2: this.colour2 } : {}), ...(this.alpha ? { alpha: this.alpha } : {}), ...(this.attach ? { attach: true } : {}), ...(this.light ? { light: { ...this.light } } : {}), ...(this.teleport > 0 ? { teleport: this.teleport } : {}), ...(this.look ? { look: this.look } : {}), ...(Object.keys(this.atlas).length ? { atlas: { ...this.atlas } } : {}) };
  }
  /**
   * Its Atlas area (Atlas 0.15 on, where the add-on uses Atlas's areas): Atlas's own choices for it (its look, its
   * light, walls, who sees it), whether there's an animation over it, and whether it's placed with Atlas's Measure
   * tool or the add-on's aiming.
   */
  private atlasPicker(body: HTMLElement): void {
    const P = this.plugin;
    const t = P.atlasTab();
    if (!t || !P.areasOn(t)) return;
    const box = body.createDiv({ cls: 'sfx-atlas-area' });
    box.createDiv({ cls: 'sfx-label', text: 'Atlas area' });
    const set = (k: keyof AtlasChoices, v: AtlasChoices[keyof AtlasChoices] | undefined) => { const a: Record<string, unknown> = { ...this.atlas }; if (v === undefined || v === false) delete a[k]; else a[k] = v; this.atlas = a; };
    new Setting(box).setName('Drawn as').setDesc('Atlas’s area is what online players see.')
      .addDropdown((d) => d.addOptions({ both: 'Animation over Atlas’s area', area: 'Atlas’s area only', animation: 'Animation only' }).setValue(this.atlas.draw ?? 'both').onChange((v) => { set('draw', v === 'area' || v === 'animation' ? v : undefined); this.render(); }));
    if (this.atlas.draw === 'animation') return;
    new Setting(box).setName('Look').setDesc('How Atlas draws the area. Picked from its damage or name.')
      .addDropdown((d) => {
        d.addOption('', 'None');
        for (const l of AREA_LOOKS) d.addOption(l, LOOK_NAMES[l]);
        d.setValue(this.look).onChange((v) => { this.look = (AREA_LOOKS as readonly string[]).includes(v) ? v as AreaLook : ''; });
      });
    new Setting(box).setName('Light').setDesc('The spell’s (its text, or the Light above), the one Atlas gives its look (Fire flickers, Radiance shines, Shadow darkens), or none.')
      .addDropdown((d) => d.addOptions({ spell: 'The spell’s', atlas: 'Atlas’s for its look', none: 'None' }).setValue(this.atlas.areaLight ?? 'spell').onChange((v) => set('areaLight', v === 'atlas' || v === 'none' ? v : undefined)));
    new Setting(box).setName('Stops at walls').addToggle((tg) => tg.setValue(!this.atlas.throughWalls).onChange((v) => set('throughWalls', !v || undefined)));
    new Setting(box).setName('Players see it').addToggle((tg) => tg.setValue(!this.atlas.hidden).onChange((v) => set('hidden', !v || undefined)));
    if (toolShapeOf(this.area)) new Setting(box).setName('Place with Atlas’s Measure tool').setDesc('Draw it with Atlas’s own tool (its snapping, its cone) instead of aiming here.')
      .addToggle((tg) => tg.setValue(!!this.atlas.tool).onChange((v) => set('tool', v || undefined)));
  }

  /** Whether it teleports its caster, and how far (from its text: "you teleport up to 30 feet"). */
  private teleportPicker(body: HTMLElement): void {
    const row = new Setting(body.createDiv({ cls: 'sfx-teleport' })).setName('Teleports the caster')
      .setDesc(this.teleport > 0 ? `Up to ${this.teleport} ${unitLabel()}: click the caster, then where they go. The token moves (Ctrl+Z puts it back).` : 'Off: the caster stays where they are.');
    row.addToggle((t) => t.setValue(this.teleport > 0).onChange((v) => { this.teleport = v ? (this.choice?.entry ? teleportOf(this.choice.entry) ?? this.range ?? 30 : this.range ?? 30) : 0; this.render(); }));
    if (this.teleport > 0) row.addText((t) => { t.inputEl.type = 'number'; t.inputEl.addClass('sfx-num'); t.setValue(String(this.teleport)); t.onChange((v) => { const n = Number(v); if (n > 0) this.teleport = n; }); });
  }

  /** The conditions it gives creatures inside it: the collection's, each on or off (pre-set from its text). */
  private conditionsPicker(body: HTMLElement): void {
    const P = this.plugin;
    const box = body.createDiv({ cls: 'sfx-conds' });
    box.createDiv({ cls: 'sfx-label', text: 'Conditions' });
    const names = P.conditionNames();
    const desc = box.createDiv({ cls: 'sfx-desc' });
    if (!names.length) { desc.setText('Open an Atlas map to choose the conditions this spell gives (its collection’s game system has them).'); return; }
    desc.setText('Creatures inside it get these (and “In a spell”) while they’re in it; take one off a creature that saves.');
    const chips = box.createDiv({ cls: 'sfx-chips' });
    // ones it gives that this collection doesn't have still show, so they aren't lost
    for (const n of [...names, ...this.conditions.filter((c) => !names.some((x) => x.toLowerCase() === c.toLowerCase()))]) {
      const on = this.conditions.some((c) => c.toLowerCase() === n.toLowerCase());
      const b = chips.createEl('button', { cls: 'sfx-chip-btn' + (on ? ' is-on' : ''), text: n });
      b.onclick = () => { this.conditions = on ? this.conditions.filter((c) => c.toLowerCase() !== n.toLowerCase()) : [...this.conditions, n]; this.render(); };
    }
  }

  onClose(): void { this.contentEl.empty(); }
}

/** "Are you sure?": a question, and a button that does it. */
class ConfirmModal extends Modal {
  constructor(app: App, private readonly title: string, private readonly text: string, private readonly yes: string, private readonly done: () => void | Promise<void>) { super(app); }
  onOpen(): void {
    this.modalEl.addClass('sfx-modal');
    this.titleEl.setText(this.title);
    const el = this.contentEl;
    el.createEl('p', { text: this.text });
    const foot = el.createDiv({ cls: 'sfx-foot' });
    foot.createEl('button', { text: 'Cancel' }).onclick = () => this.close();
    const ok = foot.createEl('button', { text: this.yes, cls: 'mod-warning' });
    ok.onclick = () => { this.close(); void this.done(); };
    window.setTimeout(() => ok.focus(), 0);
  }
  onClose(): void { this.contentEl.empty(); }
}

/** A name for a new saved spell. */
class NameModal extends Modal {
  constructor(app: App, private readonly start: string, private readonly done: (name: string) => void | Promise<void>) { super(app); }
  onOpen(): void {
    this.titleEl.setText('Save as a new spell');
    const el = this.contentEl;
    el.createEl('p', { text: 'Its name, as it shows in the cast window’s Saved spells and in ✨’s menu:' });
    const n = el.createEl('input', { type: 'text', value: this.start, cls: 'sfx-wide' });
    const foot = el.createDiv({ cls: 'sfx-foot' });
    foot.createEl('button', { text: 'Cancel' }).onclick = () => this.close();
    const ok = foot.createEl('button', { text: 'Save', cls: 'mod-cta' });
    const go = () => { const v = n.value.trim(); if (!v) return; this.close(); void this.done(v); };
    ok.onclick = go; n.onkeydown = (e) => { if (e.key === 'Enter') go(); };
    window.setTimeout(() => { n.focus(); n.select(); }, 0);
  }
  onClose(): void { this.contentEl.empty(); }
}

/** "Cast a saved spell…": the saved spells (the ones in ✨'s menu first), one click each. */
class SavedPicker extends Modal {
  constructor(app: App, private readonly plugin: AtlasSpellEffects) { super(app); }
  onOpen(): void {
    this.modalEl.addClass('sfx-modal'); this.modalEl.addClass('sfx-edit');
    this.titleEl.setText('Cast a saved spell');
    const el = this.contentEl;
    const ss = [...this.plugin.stored].sort((a, b) => Number(!!b.menu) - Number(!!a.menu));
    if (!ss.length) { el.createDiv({ cls: 'sfx-empty', text: 'No saved spells yet. In the cast window, set a spell up as you like it and press “Save”.' }); return; }
    const box = el.createDiv({ cls: 'sfx-list' });
    for (const st of ss) {
      const it = box.createDiv({ cls: 'sfx-item' });
      setIcon(it.createSpan({ cls: 'sfx-star' }), 'star'); it.createSpan({ cls: 'sfx-name', text: st.name }); it.createEl('small', { text: describe(st.area) });
      it.onclick = () => { this.close(); void this.plugin.castSaved(st); };
    }
  }
  onClose(): void { this.contentEl.empty(); }
}

class EndModal extends Modal {
  constructor(app: App, private readonly plugin: AtlasSpellEffects) { super(app); }
  onOpen(): void {
    this.modalEl.addClass('sfx-modal'); this.modalEl.addClass('sfx-endwin');
    // its backdrop lighter (the map seen behind it)
    this.containerEl.addClass('sfx-endwin-bg');
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

  /**
   * The settings, for Obsidian's settings search (1.13 on): each heading's rows, each drawn by the same code that
   * draws it in the tab.
   */
  getSettingDefinitions(): SettingDefinitionItem[] {
    return this.sections().map((sec) => ({
      type: 'group' as const,
      ...(sec.heading ? { heading: sec.heading } : {}),
      items: sec.rows.map((r) => ({ name: r.name, ...(r.desc !== undefined ? { desc: r.desc } : {}), render: (st: Setting) => { r.render(st); } })),
    }));
  }

  display(): void { this.redraw(); }

  /** The tab drawn again (its counts and lists up to date). */
  private redraw(): void {
    const el = this.containerEl; el.empty();
    el.createEl('p', { text: 'Animated spell areas on your Atlas maps, shown on your screen and the player window. Cast with ✨ in Atlas’s toolbar.' });
    for (const sec of this.sections()) {
      if (sec.heading) new Setting(el).setName(sec.heading).setHeading();
      for (const r of sec.rows) { const st = new Setting(el).setName(r.name); if (r.desc !== undefined) st.setDesc(r.desc); r.render(st); }
    }
  }

  /** The settings, by heading: each row's name, description and controls. */
  private sections(): { heading?: string; rows: { name: string; desc?: string | DocumentFragment; render: (st: Setting) => void }[] }[] {
    const p = this.plugin, s = p.settings;
    type Row = { name: string; desc?: string | DocumentFragment; render: (st: Setting) => void };
    const spells: Row[] = [], anims: Row[] = [], map: Row[] = [];
    // ── spells ──
    spells.push({
      name: 'Spell bases',
      desc: basesReady() ? 'Every note these Bases show (in any of their views) is a spell, with its area, light and walls read from its text. Pick the Base of your spell pages, as you pick loot bases in Atlas. When you save a spell, it’s written onto its own note.' : 'Bases needs Obsidian 1.10 or later with the Bases core plugin on. Until then, spell notes are found by their properties (below).',
      render: (st) => {
        // the Bases chosen, each with its count, and a box to add one
        const list = st.settingEl.createDiv({ cls: 'sfx-baselist' });
        st.settingEl.addClass('sfx-bases-row');
        for (const b of s.bases) {
          const bst = p.baseState.get(b), n = p.baseNotes.get(b)?.length;
          new Setting(list).setName(b).setDesc(bst === 'missing' ? 'Not found: moved or renamed?' : bst === 'no-bases' ? 'Bases is off.' : n !== undefined ? `${n} notes` : 'Reading…')
            .addButton((x) => x.setIcon('x').setTooltip('Remove').onClick(() => { void (async () => { s.bases = s.bases.filter((y) => y !== b); await p.save(); await p.startBases(); this.redraw(); })(); }));
        }
        new Setting(list).setName('Add a base').setDesc('Start typing its name.')
          .addText((t) => {
            t.setPlaceholder('Compendium/Spells.base');
            new BaseSuggest(this.app, t.inputEl, async (path) => { if (!s.bases.includes(path)) { s.bases = [...s.bases, path]; await p.save(); await p.startBases(); } window.setTimeout(() => this.redraw(), 400); });
          });
      },
    });
    spells.push({
      name: 'Folder for effects of your own',
      desc: `“Save as new…”, and saving an effect that isn’t a spell note, makes a note here (and a Base showing them, added above). You have ${p.stored.length} saved spells.`,
      render: (st) => { st.addText((t) => {
        t.setPlaceholder('Spell Storage').setValue(s.storage).onChange((v) => { void (async () => { s.storage = v.trim() || 'Spell Storage'; await p.save(); })(); });
        new FolderSuggest(this.app, t.inputEl, async (v) => { s.storage = v.trim() || 'Spell Storage'; await p.save(); });
      }); },
    });
    spells.push({
      name: 'Also find spell notes anywhere',
      desc: `Notes whose properties have a school and a level, or that have a “spell” tag, even outside your Bases. Now: ${p.noteChoices.length} spell notes offered.`,
      render: (st) => { st.addToggle((t) => t.setValue(s.noteSpells).onChange((v) => { void (async () => { s.noteSpells = v; await p.save(); p.indexSpells(); this.redraw(); })(); })); },
    });

    // ── animations ──
    const remote = p.files.filter((f) => f.remote).length;
    anims.push({
      name: 'Offer every JB2A animation',
      desc: `All of JB2A’s free animations (${remote ? `${remote} not downloaded yet` : 'all downloaded'}) show in the cast window; each is fetched from JB2A’s GitHub the first time you use it.`,
      render: (st) => { st.addToggle((t) => t.setValue(s.jb2aOffer).onChange((v) => { void (async () => { s.jb2aOffer = v; await p.save(); p.indexVault(); this.redraw(); })(); })); },
    });
    anims.push({
      name: 'JB2A folder',
      desc: 'Where JB2A animations are saved in your vault.',
      render: (st) => { st.addText((t) => {
        t.setPlaceholder('JB2A_DnD5e').setValue(s.jb2aFolder).onChange((v) => { void (async () => { s.jb2aFolder = v.trim() || 'JB2A_DnD5e'; await p.save(); p.indexVault(); })(); });
        new FolderSuggest(this.app, t.inputEl, async (v) => { s.jb2aFolder = v.trim() || 'JB2A_DnD5e'; await p.save(); p.indexVault(); });
      }); },
    });
    anims.push({
      name: 'Download everything',
      desc: 'JB2A — Jules & Ben’s Animated Assets (free pack) by Jules, Ben, gazkhan and wassily, under CC BY-NC-SA 4.0. Support them on Patreon for the full pack.',
      render: (dls) => {
        const credit = 'JB2A — Jules & Ben’s Animated Assets (free pack) by Jules, Ben, gazkhan and wassily, under CC BY-NC-SA 4.0. Support them on Patreon for the full pack.';
        const show = () => {
          const d = p.dl;
          dls.setDesc((d ? `Downloading… ${d.done} of ${d.total || '…'}${d.failed ? `, ${d.failed} failed` : ''}. You can close this; it carries on.` : remote ? `Fetch all ${remote} JB2A animations you don’t have yet (about 1.2 GB), so every one works offline.` : 'Every JB2A animation is in your vault.') + ' ' + credit);
        };
        show();
        dls.addButton((b) => {
          const set = () => { b.setButtonText(p.dl ? 'Stop' : 'Download everything'); b.setDisabled(!p.dl && !remote); };
          set();
          b.onClick(() => { if (p.dl) { p.dl.stop = true; return; } new DownloadModal(this.app, p, () => { set(); show(); }).open(); });
          p.dlListener = () => { show(); set(); };
        });
      },
    });
    anims.push({
      name: 'Your own effect folders',
      desc: `Other vault folders with effect animations (.webm, .gif, .png…), separated by commas. Empty: any folder with “JB2A” in its name, and any folder called “Spell Effects”. In the vault now: ${p.files.length - remote} files.`,
      render: (st) => { st
        .addText((t) => {
          t.setPlaceholder('Spell Effects').setValue(s.folders).onChange((v) => { void (async () => { s.folders = v; await p.save(); p.indexVault(); })(); });
          new FolderSuggest(this.app, t.inputEl, async (v) => { s.folders = v; await p.save(); p.indexVault(); }, true);
        })
        .addButton((b) => b.setButtonText('Look again').onClick(() => { p.indexVault(); this.redraw(); })); },
    });

    // ── on the map ──
    const toggle = (name: string, desc: string, get: () => boolean, put: (v: boolean) => void): Row => ({
      name, desc, render: (st) => { st.addToggle((t) => t.setValue(get()).onChange((v) => { void (async () => { put(v); await p.save(); p.wake(); })(); })); },
    });
    map.push({ name: 'Snap to grid', desc: 'Spheres, cubes and wall corners land on the nearest grid corner, as the rules place them (Alt: the other way, once).', render: (st) => { st.addToggle((t) => t.setValue(s.snap).onChange((v) => { void (async () => { s.snap = v; await p.save(); })(); })); } });
    map.push(toggle('Spell AoE player preview', 'While you place a spell, the players’ screen shows its area’s outline, in its colours, so they can see what it will cover before you cast it. Also in the ✨ button’s menu.', () => s.showAim, (v) => { s.showAim = v; }));
    map.push(toggle('Spells as Atlas areas', 'Each spell you cast is one of Atlas’s own areas too (Atlas 0.15 or later): Atlas draws it (with its Fire, Frost… look), lights it, counts the creatures in it as far as walls let it, saves it with the scene and shows it to online players. The animation plays over it. Change or delete the area in Atlas and the spell follows.', () => s.atlasAreas, (v) => { s.atlasAreas = v; }));
    map.push(toggle('Mark creatures in spells', 'Creatures inside a lasting spell get Atlas’s “In a spell” condition (added to your collection’s conditions), and the conditions the spell gives (Silence: Deafened), while they’re in it. Creatures hit by an instant spell (Fireball) are listed on a card beside the map till you close it. Only what the add-on put on is taken off again.', () => s.markCreatures, (v) => { s.markCreatures = v; }));
    map.push(toggle('Spell turn tracker', 'During a fight in Atlas’s initiative tracker, each lasting spell shows how many rounds it has been up beside it (“Round 3”), on your screen only. Spells never end on their own.', () => s.showRounds, (v) => { s.showRounds = v; }));
    // a round's length: the game system's, as you set it (game systems differ; some have none)
    const sid = p.systemOf();
    const own = ROUND_SECS[sid];
    map.push({
      name: 'Round length',
      desc: sid
        ? `How long a round lasts in your game system, for the turn tracker (“Round 3 · 12 s”): “6 seconds”, “10 s”, “1 minute”… Empty: rounds only. ${own ? `The game’s own: ${timeOf(own)}.` : 'This game system has no set length here: set one from your book, or leave it empty.'} Kept for each game system.`
        : 'Open an Atlas map first: a round’s length is set for its game system.',
      render: (len) => {
        let box: TextComponent | null = null;
        len.addText((t) => {
          box = t;
          t.setPlaceholder('Rounds only');
          const cur = p.roundSecs(); t.setValue(cur ? timeOf(cur) : '');
          t.setDisabled(!sid);
          // emptied: rounds only (even where the game has a length of its own)
          t.onChange((v) => { void (async () => { const n = secondsOf(v); s.roundSecs[sid] = n > 0 ? n : 0; await p.save(); p.wake(); })(); });
        });
        if (sid && own) len.addExtraButton((b) => b.setIcon('rotate-ccw').setTooltip(`Back to the game’s own (${timeOf(own)})`).onClick(() => { void (async () => { delete s.roundSecs[sid]; box?.setValue(timeOf(own)); await p.save(); p.wake(); })(); }));
        void p.systemName().then((n) => { if (n && sid) len.setName(`Round length in ${n}`); });
      },
    });
    map.push({
      name: 'Player preview style',
      desc: 'Outline: the area’s edge, dashed, in its colours. Filled: the area drawn in its colours. Animation: the spell’s own animation, a little see-through.',
      render: (st) => { st.addDropdown((d) => d.addOptions({ outline: 'Outline', filled: 'Filled', animation: 'Animation' }).setValue(s.aimLook).onChange((v) => { void (async () => { s.aimLook = v === 'filled' || v === 'animation' ? v : 'outline'; await p.save(); p.wake(); })(); })); },
    });
    const sys = p.atlasSystem;
    map.push({
      name: 'Your game system',
      desc: sys
        ? `From Atlas (the open map’s collection): ${sys.perSquare} ${sys.unit} to a square, ${Math.round(sys.cone * 100) / 100}° cones${sys.bands.length ? `, range bands ${sys.bands.join(', ')}` : ''}. Spell areas and ranges are read with these (Pathfinder’s bursts, metres, Daggerheart’s and Shadowdark’s range bands…). To change them, change the collection’s game system in Atlas.`
        : 'Read from Atlas once a map is open: its squares, units, cone angle and range bands, from the collection’s game system.',
      render: (st) => { void p.systemName().then((n) => { if (n) st.setName(`Your game system: ${n}`); }); },
    });
    map.push({
      name: 'Cone angle',
      desc: 'Leave empty to use your game system’s, from Atlas (53° in D&D 5e, 90° in most others). Each spell can still have its own in the cast window.',
      render: (st) => { st.addText((t) => {
        t.setPlaceholder(`${Math.round(p.coneAngle(true) * 100) / 100} (from Atlas)`);
        t.setValue(s.coneAngle > 0 ? String(Math.round(s.coneAngle * 100) / 100) : '');
        t.inputEl.type = 'number'; t.inputEl.min = '1'; t.inputEl.max = '170';
        t.onChange((v) => { void (async () => { const n = Number(v); if (!v.trim()) s.coneAngle = 0; else if (n >= 1 && n <= 170) s.coneAngle = n; else return; await p.save(); })(); });
      }); },
    });
    return [{ heading: 'Spells', rows: spells }, { heading: 'Animations', rows: anims }, { heading: 'On the map', rows: map }];
  }
}
