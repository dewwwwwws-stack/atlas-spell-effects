// Combat+ for Atlas VTT (formerly Spell Effects for AtlasVTT): spell effects, areas and D&D 5e rolls on Atlas VTT maps.
// Cast from the command palette or the ribbon: pick a spell (your spell list says its area), pick its animation
// (JB2A or your own files; or one the add-on draws), click the caster / aim / click where it lands. It plays on
// your map and on the player window (the TV) at the right place and size; lasting ones stay until you end them.
import { FuzzySuggestModal, Plugin, Modal, Menu, Notice, PluginSettingTab, Setting, setIcon, TFile, MarkdownView, parseYaml, type App, type TextComponent, type WorkspaceLeaf, type SettingDefinitionItem } from 'obsidian';
import { BaseReader, basesReady } from './bases';
import { jb2aFiles, fetchJb2a, fetchAll } from './jb2a';
import { measureArt, hasReach, type Trim } from './trim';
import { kitOf, PixiPainter, forgetBlobs, type AimLook } from './pixi';
import { areaOf as atlasAreaOf, areaKey, effectFromArea, lookOf, areaCarries, atlasLightOf, toolShapeOf, AREA_LOOKS, LOOK_NAMES, LOOK_COLOURS, type AreaShape, type AreaLook } from './measures';
import { moreOf, countAt, hasMore, type More } from './more';
import { fiveEFile } from './fives';
import { rollSpecOf, statsOf, rollAgainst, addExtra, type RollSpec, type CastRoll, type Edge, type Stats } from './rolls';
import { IN_SPELL_ID, IN_SPELL, ROUND_SECS, idsOf, upFor, timeOf, secondsOf, spellConditions, type ConditionDef } from './conditions';
import { call, field, type AtlasAssets, type Tab, type AtlasView, type AtlasViewport, type AtlasState, type CanvasNode, type PlayersView, type Measurement } from './atlas';
import { FolderSuggest, BaseSuggest } from './suggest';
import { SpellNames, StatblockLinker, type SpellLink } from './statblocks';
import { areaOf, abilityEntry, targetOf, fallbackArea, describe, rangeOf, teleportOf, setRules, unitLabel, square, squares, fromFeet, type GameUnitType, type Area, type Shape, type SpellEntry, type WallBlocks } from './areas';
import { indexFiles, indexFile, matchesFor, defaultFor, hintsOf, coloursOf, search, nearestLength, type EffectFile } from './library';
import { isStored, storedFrom, writeDefaults, clearDefaults, baseFile, noteName, unitFactor, unitNow, type StoredSpell } from './storage';
import { looksLikeItem, looksLikeSpell, looksLikeStatblock, spellFromNote } from './notes';
import { loadSrd, splitNote, type SrdEdition } from './srd';
import { lightOf, placedLights, adoptLook, lightKey, LIGHT_COLOUR, type EffectLight } from './lights';

import { boxOf, dirTo, hitEffect, MOTIONS, MOTION_SPEEDS, motionOf, motionKey, snapCorner, placeOf, pxPerFoot, attachTo, detach, wallPieces, wallPoints, ringPoints, pathLength, within, controlsOf, stepSize, dragHandle, aims, CONE_ANGLE, coneLocal, type Box, type Effect, type Point, type Scale, type TokenAt } from './geometry';
import { Painter, artInfo, instantMs, FADE_MS, paintHandles, drawnSample, moving, type Surface, type World, type Mapping } from './overlay';

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
interface Remembered { more?: More; motion?: string; atlas?: AtlasChoices; look?: string; teleport?: number; conditions?: string[]; range?: number; unit?: string; angle?: number; target?: 'on' | 'bolt'; self?: boolean; colour2?: string; alpha?: number; file?: string; colour?: string; shape?: Shape; size?: number; width?: number; from?: 'caster' | 'point'; lasting?: boolean; light?: EffectLight | null; ring?: number; round?: boolean; blocks?: WallBlocks }
interface Settings {
  folders: string;                 // vault folders with effect files, comma-separated; '' = any folder named like JB2A or "Spell Effects"
  remember: Record<string, Remembered>;
  /** Saved abilities (not spells), by name: how every statblock's Fire Breath looks. Their shape and size come from each statblock's own text. */
  abilities: Record<string, Remembered>;
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
  /** Roll attacks, saves and damage when a spell is cast (D&D 5e), shown on its card. */
  rolling: boolean;
  /** The SRD's spells built in (spells with no note of yours), from this edition; and where its notes are written. */
  srdSpells: boolean; srdEdition: SrdEdition; srdFolder: string;
  /** Who it rolls for: everyone, or only creatures that aren't player characters (players roll their own). */
  rollWho: 'all' | 'npcs';
  /** Post each roll's results to Atlas's table log, when a table is running. */
  rollPost: boolean;
  /** Legendary Resistance used, by map and token ("map|token"): reset by hand on the card. */
  legendary: Record<string, number>;
  /** The name of the Atlas resource that holds temporary hit points (a bar, once it's added in Atlas). */
  tempResource: string;
  /** Play animations (off: spells are their areas only, rolls and all else the same). */
  animations: boolean;
  /** Spells drawn over the tokens: none (all under them), the instant ones and bolts, or all. */
  above: 'none' | 'instant' | 'all';
  markCreatures: boolean;          // "In a spell" and a spell's conditions on the creatures inside it
  showRounds: boolean;             // how long each lasting spell has been up, by Atlas's initiative, beside it
  /** Every spell's and ability's area goes through walls (each one's own choice aside). */
  throughWalls: boolean;
  atlasAreas: boolean;             // each spell one of Atlas's own areas too (Atlas 0.15 on)
  areas: Record<string, { map: string; effect: string; mine: boolean }>; // those areas (by their Atlas id), to take away with their spells
  roundSecs: Record<string, number>; // a round's length in seconds you set, for each game system (Atlas's preset id); 0: rounds only; none: the system's own
  marks: Mark[];                   // the conditions the add-on put on creatures (and takes off again)
  /** What spells have put in Atlas beside areas and lights (difficult terrain, summoned tokens): taken away when their spell ends. */
  made: { map: string; effect: string; kind: 'terrain' | 'token'; id: string }[];
  caught: Caught[];                // creatures hit by instant spells, shown till you close their card
  recent: Pending[];               // the spells cast last, newest first
}
/** A condition the add-on keeps on a creature for a spell: `on` (put on by it), `off` (you took it off while the creature was still inside), `theirs` (it had it already). */
interface Mark { map: string; from: string; token: string; cond: string; state: 'on' | 'off' | 'theirs' }
/** Creatures hit by an instant spell (Fireball): a card of them, till you close it. */
interface Caught {
  id: string; map: string; name: string; tokens: { id: string; name: string }[];
  /** Its rolls against each one (rolling on), and what made them, to roll again. */
  roll?: CastRoll; spec?: RollSpec; by?: string; level?: number | null; edge?: Edge; slot?: number;
  /** The attacker's extra damage on a hit (Sneak Attack), offered as buttons; and those already added. */
  extras?: { name: string; dice: string; type?: string }[]; added?: string[];
}
/** A card's row in words: its roll and what came of it ("17+5 = 22 vs AC 15: hit, 14"). */
function rowText(r: import('./rolls').RollRow, withDamage = true): string {
  const OUT: Record<string, string> = { crit: 'crit!', hit: 'hit', miss: 'miss', fumble: 'natural 1, miss', failed: 'failed', saved: 'saved', damage: '', heal: '', unknown: '?' };
  const dice = r.d20 ? `${r.d20.length > 1 ? `[${r.d20.join(', ')}] ` : ''}${r.kept}${r.bonus !== undefined ? `${r.bonus >= 0 ? '+' : ''}${r.bonus} = ${(r.kept ?? 0) + r.bonus}` : ''}${r.against !== undefined ? ` vs ${r.outcome === 'failed' || r.outcome === 'saved' ? 'DC' : 'AC'} ${r.against}` : ''}` : '';
  const out = OUT[r.outcome] ?? '';
  return [dice, out].filter(Boolean).join(': ') + (withDamage ? `${dice || out ? ', ' : ''}${r.outcome === 'heal' ? `heals ${r.damage}` : `${r.damage} damage`}${r.why ? ` (${r.why})` : ''}` : '');
}

/** A canvas, whichever window it's in (a popped-out one's too). */
const isCanvas = (c: unknown): c is HTMLCanvasElement => !!c && typeof (c as Node).instanceOf === 'function' && (c as Node).instanceOf(HTMLCanvasElement);

const DEFAULTS: Settings = { folders: '', srdSpells: false, srdEdition: '2024', srdFolder: 'Combat+ SRD', rolling: false, rollWho: 'all', rollPost: false, above: 'none', legendary: {}, tempResource: 'Temp HP', animations: true, made: [], remember: {}, abilities: {}, lasting: [], snap: true, storage: 'Spell Storage', bases: [], presets: [], jb2aFolder: 'JB2A_DnD5e', jb2aOffer: true, noteSpells: true, orphanLights: [], coneAngle: 0, artTrim: {}, showAim: false, aimLook: 'outline', markCreatures: true, showRounds: true, atlasAreas: true, throughWalls: false, areas: {}, roundSecs: {}, marks: [], caught: [], recent: [] };

/** A spell to pick in the cast window: a saved one, or a spell note (from a Base or found in the vault). */
export interface Choice { key: string; name: string; source: 'stored' | 'note'; entry?: SpellEntry; stored?: StoredSpell; notePath?: string; /** A creature's ability from a statblock (Fire Breath), not a spell. */ ability?: boolean; /** Whose ability it is (its creature's name). */ owner?: string; /** A built-in SRD spell (no note of its own). */ srd?: boolean }


/** What is being cast: the area and look, before it is placed. */
interface Pending { name: string; key: string; area: Area; file?: string; colour: string; colour2?: string; /** How its drawn shape moves while it lasts. */ motion?: string; /** What it rolls, from its text. */ roll?: RollSpec; /** A plain attack: rolled at each creature clicked, with nothing drawn. */ plain?: boolean; /** A Multiattack: the attacks it makes, one for each creature clicked, in turn. */ sequence?: { name: string; roll: RollSpec }[]; /** What else it does (pushes, how many, a chain, a thing it makes, difficult terrain). */ more?: More; alpha?: number; attach?: boolean; light?: EffectLight; /** How far from its caster it can be cast (feet, from the edge of their space). */ range?: number; /** The conditions it gives the creatures inside it (names). */ conditions?: string[]; /** It teleports its caster up to this far (game units). */ teleport?: number; /** Atlas's look for its area (fire, frost…); '' or missing: none. */ look?: string; /** Its Atlas area's choices (Atlas 0.15 on). */ atlas?: AtlasChoices }
/** A spell's Atlas area, as chosen in the cast window: how it's drawn, its light, walls, players, how it's placed. */
interface AtlasChoices { draw?: 'area' | 'animation'; areaLight?: 'atlas' | 'none'; throughWalls?: boolean; hidden?: boolean; tool?: boolean }
/** A spell's remembered choices in the game's units now (remembered in another game system's: the same squares). */
function inUnitsNow(r: Remembered | undefined): Remembered | undefined {
  if (!r) return r;
  const k = unitFactor(r.unit); if (k === 1) return r;
  const sc = (v: number | undefined) => (v === undefined ? v : Math.round(v * k * 100) / 100);
  const light = r.light ? { ...r.light, bright: sc(r.light.bright) ?? 0, dim: sc(r.light.dim) ?? 0 } : r.light;
  return { ...r, size: sc(r.size), width: sc(r.width), ring: sc(r.ring), light, ...(r.teleport ? { teleport: sc(r.teleport) } : {}), ...(r.more ? { more: { ...r.more, ...(r.more.push ? { push: sc(Math.abs(r.more.push))! * Math.sign(r.more.push) } : {}), ...(r.more.chainRange ? { chainRange: sc(r.more.chainRange)! } : {}) } } : {}), unit: unitNow() };
}
/** The conditions part of an effect made from a pending spell. */
const condsOf = (p: Pending): Partial<Effect> => {
  const a = p.atlas ?? {};
  return { ...(p.roll ? { roll: p.roll } : {}), ...(p.more?.push ? { push: p.more.push } : {}), ...(p.more?.terrain ? { terrain: true } : {}), ...(p.motion ? { motion: p.motion } : {}), ...(p.conditions?.length ? { conditions: [...p.conditions] } : {}), ...(p.look ? { look: p.look } : {}), ...(a.draw ? { draw: a.draw } : {}), ...(a.areaLight ? { areaLight: a.areaLight } : {}), ...(a.throughWalls ? { throughWalls: true } : {}), ...(a.hidden ? { hidden: true } : {}) };
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
  /** Creatures' abilities with an area, from their statblock notes (Fire Breath, Adult Red Dragon's): apart from the spells. */
  abilityChoices: Choice[] = [];
  private creatureNotes: string[] = [];
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
    this.addCommand({ id: 'reset-legendary-resistance', name: 'Reset Legendary Resistance (a new day)', callback: () => { this.settings.legendary = {}; this.saveSoon(); new Notice('Combat+: Legendary Resistance reset for every creature.'); } });
    this.addCommand({ id: 'cast', name: 'Cast a spell effect…', callback: () => this.openCast() });
    this.addCommand({ id: 'cast-again', name: 'Cast the last effect again', callback: () => (this.last ? this.place(this.last) : this.openCast()) });
    this.addCommand({ id: 'preset', name: 'Cast a saved spell…', callback: () => new SavedPicker(this.app, this).open() });
    this.addCommand({ id: 'end', name: 'End a lasting effect…', callback: () => new EndModal(this.app, this).open() });
    this.addCommand({ id: 'end-all', name: 'End every lasting effect on this map', callback: () => this.endAllHere() });
    this.addCommand({ id: 'snap', name: 'Snap effects to the grid on or off', callback: () => { void this.toggleSnap(); } });
    this.addCommand({ id: 'srd-creatures', name: 'Add SRD creatures to the vault…', callback: () => { void this.pickSrdCreatures(); } });
    this.addCommand({ id: 'srd-spells', name: 'Add the SRD spells to the vault as notes', callback: () => { void this.writeSrd('spells').then((n) => new Notice(`Combat+: ${n} SRD spell notes added.`)); } });
    this.addCommand({ id: 'reload', name: 'Look again for spell notes and effect files', callback: () => { this.indexVault(); this.indexSpells(); } });
    this.app.workspace.onLayoutReady(() => {
      // from an older version: its Spell Storage folder's Base becomes the first spell Base
      if (firstBases) { const b = `${this.storageFolder()}/${this.storageFolder().split('/').pop()}.base`; if (this.app.vault.getAbstractFileByPath(b)) { this.settings.bases = [b]; void this.save(); } }
      this.indexVault(); this.indexSpells(); void this.readSrd(); void this.startBases(); this.linkStatblocks(); this.wake();
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
    // another tab brought to the front (the map's hidden): its cards go with it, and come back with it
    this.registerEvent(this.app.workspace.on('active-leaf-change', () => { this.wake(); window.setTimeout(() => this.wake(), 120); }));
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
      this.dodgeLights(at.t, at.p);
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
      if (!tool) tool = this.makeTool(toolbar, root);
      // Atlas's controls come and go: the tool stays last, before the bar's end controls
      if (toolbar) {
        const endEl = toolbar.querySelector(':scope > .atlas-toolbar-end');
        if (endEl ? tool.nextElementSibling !== endEl : toolbar.lastElementChild !== tool) toolbar.insertBefore(tool, endEl);
      }
      this.updateTool(tool, t);
    }
  }

  private makeTool(toolbar: HTMLElement | null, root: HTMLElement): HTMLElement {
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
    if (!this.atlasTab()) { new Notice('Combat+: open an Atlas map first.'); return; }
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
      } catch (e) { console.error('Combat+: could not keep a preset as a saved spell', pr.name, e); }
    }
    await this.save();
    this.namesChanged();
    if (done) new Notice(`Combat+: your ${done === 1 ? 'preset is' : `${done} presets are`} now saved spells, in ${this.storageFolder()} (and still in ✨’s menu).`);
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
  /** Every statblock looked at again (its buttons: attacks come and go with rolling). */
  rescanStatblocks(): void { for (const l of this.linkers.values()) l.scan(); }
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
      const l = new StatblockLinker(d, () => this.spellNames(), (link, how) => void this.castFromStatblock(link, how), (link, how) => void this.statblockMenu(link, how), (sb) => { if (sb.closest('.atlas-statblock-preview-window')) this.tokenOfStatblock(sb); }, (link, how) => this.peekButton(link, how));
      l.attacks = (sb) => { const k = this.settings.rolling && this.settings.rollWho === 'npcs' ? this.tokenOfStatblock(sb) : null; return this.settings.rolling && !(k && this.isPC(k.tab, k.id)); };
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

  /**
   * What a statblock's button casts: the spell, or (an ability: Fire Breath) its area read from its own text there.
   * (An ability is no spell: it's in no spell list, and saving it keeps a preset by its name, not a spell note.)
   */
  private choiceOf(link: SpellLink): Choice | null {
    if (link.ability === undefined) return this.choices().find((x) => x.key === link.key) ?? null;
    if (link.multi?.length) {
      // a Multiattack: its first attack's entry (its reach or range: the longest of them), named for it
      const entries = link.multi.map((x) => abilityEntry(x.name, x.text)).filter((e): e is SpellEntry => !!e);
      if (!entries.length) return null;
      const far = Math.max(0, ...entries.map((e) => parseFloat(String(e.range ?? '')) || 0));
      const entry: SpellEntry = { ...entries[0], key: `ability:${link.name.toLowerCase()}:multi`, name: link.name, ...(far ? { range: `${far} ft.` } : {}) };
      return { key: entry.key, name: link.name, source: 'note', entry, ability: true };
    }
    const entry = abilityEntry(link.name, link.ability);
    return entry ? { key: entry.key, name: link.name, source: 'note', entry, ability: true } : null;
  }
  /** A Multiattack's attacks put on its cast: one roll each, in turn (a creature's own attacks: not spells). */
  private withSequence(p: Pending, link: SpellLink): Pending {
    if (!link.multi?.length) return p;
    const seq: { name: string; roll: RollSpec }[] = [];
    for (const x of link.multi) { const r = rollSpecOf(x.text); if (r) seq.push({ name: x.name, roll: { ...r, spell: false } }); }
    return seq.length ? { ...p, plain: true, sequence: seq, roll: seq[0].roll } : p;
  }
  /** A saved ability's key: its name, any case. */
  abilityKey(name: string): string { return name.replace(/\s+/g, ' ').trim().toLowerCase(); }

  /** A spell clicked in a statblock: cast it (its creature as the caster), or Shift: open it in the cast window. */
  async castFromStatblock(link: SpellLink, how: { shift: boolean; statblock: HTMLElement }): Promise<void> {
    const tok = this.tokenOfStatblock(how.statblock);
    const c = this.choiceOf(link);
    if (!c) return;
    const m = new CastModal(this.app, this);
    await m.pick(c);
    if (how.shift) { m.casterToken = tok?.id; m.open(); return; }
    const p = this.withSequence(await m.pending(), link);
    if (!this.atlasTab()) { new Notice('Combat+: open an Atlas map first.'); return; }
    this.place(p, tok && this.mapOf(tok.tab) === this.mapOf(this.atlasTab()!) ? tok.id : undefined);
  }

  /**
   * A statblock's Cast button: a menu of the caster and the spell's range, the way it's cast (the map takes it
   * from there), and the cast window.
   */
  async statblockMenu(link: SpellLink, how: { statblock: HTMLElement; x: number; y: number }): Promise<void> {
    const tok = this.tokenOfStatblock(how.statblock);
    const c = this.choiceOf(link);
    if (!c) return;
    const m = new CastModal(this.app, this);
    await m.pick(c);
    const p = this.withSequence(await m.pending(), link);
    const tab = this.atlasTab();
    const here = tok && tab && this.mapOf(tok.tab) === this.mapOf(tab) ? tok : null;
    const who = here ? this.tokenName(here.tab, here.id) : null;
    const range = p.range && p.range > 0 ? `${p.range} ${unitLabel()}` : '';
    this.peekButton(null, null);
    // pressed again (its menu open, or just shut by this very press): cast straight away, its usual way
    const key = `${link.key}|${link.name}`, last = this.sbMenu;
    if (last && last.key === key && (last.open || Date.now() - last.hidden < 600)) {
      this.sbMenu = null;
      if (last.open) last.menu.hide();
      if (!this.atlasTab()) { new Notice('Combat+: open an Atlas map first.'); return; }
      this.place(p, here?.id);
      return;
    }
    const menu = new Menu();
    const mine = { key, open: true, hidden: 0, menu };
    this.sbMenu = mine;
    menu.onHide(() => { mine.open = false; mine.hidden = Date.now(); });
    menu.addItem((i) => i.setTitle([who ?? 'No caster on the map', range].filter(Boolean).join('   ·   ')).setIcon('user').setDisabled(true));
    menu.addItem((i) => i.setTitle(castWord(p, who)).setIcon('wand-sparkles').onClick(() => {
      if (!this.atlasTab()) { new Notice('Combat+: open an Atlas map first.'); return; }
      this.place(p, here?.id);
    }));
    // its animation once on the caster, aimed at no one (a flourish: the DM deals with what it does)
    // (not a plain attack: there's nothing to see)
    if (!p.plain) menu.addItem((i) => {
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
    if (!p.plain) menu.addItem((i) => i.setTitle('Edit look…').setIcon('palette').onClick(() => { m.casterToken = tok?.id; m.open(); }));
    menu.showAtPosition({ x: how.x, y: how.y }, how.statblock.ownerDocument);
  }

  /** The statblock button's menu last opened (pressed again: it casts). */
  private sbMenu: { key: string; open: boolean; hidden: number; menu: Menu } | null = null;
  private peekSeq = 0;

  /**
   * The pointer over a statblock's Cast or Use button: a small card beside it of what it will look like (its
   * animation playing, or its area's shape in its colour), its area and look. Off it (null): gone.
   */
  peekButton(link: SpellLink | null, how: { statblock: HTMLElement; rect: DOMRect } | null): void {
    const seq = ++this.peekSeq;
    for (const d of this.docs()) d.querySelectorAll('.sfx-sb-peek').forEach((el) => el.remove());
    document.querySelectorAll('.sfx-sb-peek').forEach((el) => el.remove());
    if (!link || !how) return;
    // a plain attack or save has no look to show
    if (link.ability !== undefined && abilityEntry(link.name, link.ability)?.plain) return;
    window.setTimeout(() => { void (async () => {
      if (seq !== this.peekSeq) return;
      const c = this.choiceOf(link); if (!c) return;
      const m = new CastModal(this.app, this);
      await m.pick(c);
      if (seq !== this.peekSeq || !how.statblock.isConnected) return;
      const v = m.view();
      const doc = how.statblock.ownerDocument, win = doc.defaultView ?? window;
      const card = doc.body.createDiv({ cls: 'sfx-sb-peek' });
      const art = card.createDiv({ cls: 'sfx-peek-art' });
      const ef = v.file ? this.files.find((f) => f.path === v.file) : undefined;
      const tf = v.file ? this.app.vault.getAbstractFileByPath(v.file) : null;
      const lookColour = v.look && v.look in LOOK_COLOURS ? LOOK_COLOURS[v.look as AreaLook] : v.colour;
      if (ef?.remote) { if (ef.thumb) { const i = art.createEl('img'); i.src = ef.thumb; i.onerror = () => i.remove(); } }
      else if (tf instanceof TFile && ef?.video) { const vid = art.createEl('video'); vid.muted = true; vid.loop = true; vid.autoplay = true; vid.src = this.app.vault.getResourcePath(tf); void vid.play()?.catch?.(() => undefined); }
      else if (tf instanceof TFile) { const i = art.createEl('img'); i.src = this.app.vault.getResourcePath(tf); }
      else {
        // no animation: its area's shape, in its colour
        const sh = art.createDiv({ cls: `sfx-peek-shape is-${v.area.target ? 'emanation' : v.area.shape}` });
        sh.setCssProps({ '--sfx-peek': lookColour });
      }
      const text = card.createDiv({ cls: 'sfx-peek-text' });
      text.createDiv({ cls: 'sfx-peek-name', text: v.name });
      text.createDiv({ cls: 'sfx-peek-line', text: describe(v.area) + (v.area.lasting ? ' · stays' : '') });
      const bits = [v.look && v.look in LOOK_NAMES ? `${LOOK_NAMES[v.look as AreaLook]} look` : '', ef ? ef.name.replace(/_\d+x\d+$/, '').replace(/_/g, ' ') : 'No animation (drawn as its area)'].filter(Boolean);
      text.createDiv({ cls: 'sfx-peek-line sfx-muted', text: bits.join(' · ') });
      const sw = text.createDiv({ cls: 'sfx-peek-swatch' }); sw.setCssProps({ '--sfx-peek': lookColour });
      // beside the button, kept on screen
      const w = 260, h = 96;
      const left = Math.max(8, Math.min(how.rect.right + 10, win.innerWidth - w - 8));
      const top = Math.max(8, Math.min(how.rect.top - 8, win.innerHeight - h - 8));
      card.setCssStyles({ left: `${Math.round(left)}px`, top: `${Math.round(how.rect.right + 10 + w > win.innerWidth ? how.rect.bottom + 8 : top)}px` });
    })(); }, 220);
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
    const creatures: string[] = [];
    for (const f of this.app.vault.getMarkdownFiles()) {
      const cache = mc.getFileCache(f);
      const fm: Record<string, unknown> | null = cache?.frontmatter ?? null;
      const tags = (cache?.tags ?? []).map((t) => t.tag);
      // a creature's statblock is never a spell (its abilities are listed apart)
      if (looksLikeStatblock(fm, tags)) { if (inBases.has(f.path) || this.settings.noteSpells) creatures.push(f.path); continue; }
      // nor is a magic item or weapon ("Reliquary of Holy Memories (Very Rare)")
      if (looksLikeItem(fm, tags)) continue;
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
    this.creatureNotes = creatures;
    this.namesChanged();
    void this.readNotes(notes).then(() => this.readAbilities(notes));
  }

  /**
   * The abilities with an area in creatures' statblock notes (their actions, traits, bonus actions, reactions,
   * legendary and lair actions), each named for itself ("Fire Breath", "Adult Red Dragon" its owner). Notes that
   * turned out to be statblocks only when read (a statblock block in their text) are among them, not the spells.
   */
  private async readAbilities(notes: Choice[]): Promise<void> {
    const paths = [...this.creatureNotes];
    const run = ++this.abilityRun;
    const found = notes.filter((c) => !!c.notePath && this.statblockBodies.has(c.notePath));
    for (const c of found) if (c.notePath && !paths.includes(c.notePath)) paths.push(c.notePath);
    if (found.length) this.noteChoices = this.noteChoices.filter((c) => !found.includes(c));
    const out: Choice[] = [];
    const LISTS = ['traits', 'actions', 'bonus_actions', 'reactions', 'legendary_actions', 'lair_actions', 'mythic_actions', 'regional_effects', 'spells_and_actions'];
    for (const path of paths) {
      if (run !== this.abilityRun) return;
      const f = this.app.vault.getAbstractFileByPath(path); if (!(f instanceof TFile)) continue;
      const fm = (this.app.metadataCache.getFileCache(f)?.frontmatter ?? {}) as Record<string, unknown>;
      let text = ''; try { text = await this.app.vault.cachedRead(f); } catch { continue; }
      let fence: Record<string, unknown> = {};
      const m = /```statblock[^\n]*\n([\s\S]*?)```/.exec(text);
      if (m) { try { const y: unknown = parseYaml(m[1]); if (y && typeof y === 'object') fence = y as Record<string, unknown>; } catch { /* not YAML */ } }
      const all = { ...fm, ...fence };
      const owner = String(all['name'] ?? f.basename);
      const seen = new Set<string>();
      for (const key of LISTS) {
        const list = all[key]; if (!Array.isArray(list)) continue;
        for (const it of list) {
          if (!it || typeof it !== 'object') continue;
          const o = it as Record<string, unknown>;
          const raw = String(o['name'] ?? '').trim(); const desc = String(o['desc'] ?? o['description'] ?? o['entries'] ?? '');
          const name = raw.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/[.:]\s*$/, '').trim();
          if (!name || seen.has(name.toLowerCase())) continue;
          const entry = abilityEntry(name, desc); if (!entry || entry.plain) continue;
          seen.add(name.toLowerCase());
          out.push({ key: `${entry.key}@${path}`, name, source: 'note', entry, ability: true, owner, notePath: path });
        }
      }
    }
    out.sort((a, b) => a.name.localeCompare(b.name) || (a.owner ?? '').localeCompare(b.owner ?? ''));
    this.abilityChoices = out;
    this.namesChanged();
  }
  /** Notes found to hold a statblock block when their text was read. */
  private statblockBodies = new Set<string>();
  private abilityRun = 0;

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
    // the SRD's, where you have none of that name
    if (this.settings.srdSpells) for (const c of this.srdChoices) add(c);
    return out;
  }

  /** A picker of the SRD's creatures (its edition's), or all of them: written as Atlas statblock notes. */
  async pickSrdCreatures(): Promise<void> {
    const book = (await loadSrd())[this.settings.srdEdition];
    const ALL = `All ${Object.keys(book.monsters).length} creatures`;
    const m = new SrdPicker(this.app, [ALL, ...Object.keys(book.monsters)], (n) => { void this.writeSrd('monsters', n === ALL ? undefined : [n]).then((k) => new Notice(k ? `Combat+: ${k === 1 && n !== ALL ? n : `${k} creatures`} added to ${this.settings.srdFolder}.` : 'Combat+: already in your vault.')); });
    m.setPlaceholder(`An SRD creature (${book.source}) to add as an Atlas statblock note`);
    m.open();
  }

  /** The built-in SRD spells (its edition's), read as spell notes are. */
  srdChoices: Choice[] = [];
  private srdRun = 0;
  /** The built-in SRD spells read again (on, off, or another edition). */
  async readSrd(): Promise<void> {
    const run = ++this.srdRun;
    if (!this.settings.srdSpells) { this.srdChoices = []; this.namesChanged(); return; }
    let book; try { book = (await loadSrd())[this.settings.srdEdition]; } catch (e) { console.error('Combat+: the built-in SRD could not be read', e); return; }
    if (run !== this.srdRun || !book) return;
    const out: Choice[] = [];
    for (const [name, md] of Object.entries(book.spells)) {
      const { fm, text } = splitNote(md, parseYaml);
      const entry = spellFromNote(`srd/${this.settings.srdEdition}/${name}.md`, { ...fm, name }, text);
      out.push({ key: `srd:${this.settings.srdEdition}:${name.toLowerCase()}`, name, source: 'note', entry, srd: true });
    }
    this.srdChoices = out;
    this.namesChanged();
  }

  /**
   * The SRD's notes written into the vault (`kind`: its spells or its creatures; `names`: just these), under the SRD
   * folder; notes already there are left as they are. The number written.
   */
  async writeSrd(kind: 'spells' | 'monsters', names?: string[]): Promise<number> {
    const book = (await loadSrd())[this.settings.srdEdition];
    const root = (this.settings.srdFolder.trim() || 'Combat+ SRD').replace(/\/+$/, '');
    const folder = `${root}/${kind === 'spells' ? 'Spells' : 'Bestiary'} (${book.source})`;
    const vault = this.app.vault;
    for (const p of [root, folder]) if (!vault.getAbstractFileByPath(p)) await vault.createFolder(p);
    let n = 0;
    for (const [name, md] of Object.entries(book[kind])) {
      if (names && !names.includes(name)) continue;
      const path = `${folder}/${noteName(name)}.md`;
      if (vault.getAbstractFileByPath(path)) continue;
      await vault.create(path, md); n++;
    }
    return n;
  }

  /** A spell note's text, read when it is picked. */
  async noteEntry(c: Choice): Promise<SpellEntry | null> {
    if (c.entry) return c.entry;
    const f = c.notePath ? this.app.vault.getAbstractFileByPath(c.notePath) : null;
    if (!(f instanceof TFile)) return null;
    const fm: Record<string, unknown> | null = this.app.metadataCache.getFileCache(f)?.frontmatter ?? null;
    const body = await this.app.vault.cachedRead(f);
    if (looksLikeStatblock(fm, [], body) || looksLikeItem(fm, [], body)) { this.statblockBodies.add(f.path); return null; }
    c.entry = spellFromNote(f.path, fm, body);
    return c.entry;
  }

  /** Saves a spell's defaults onto its own note's properties (a note in the folder for your own effects, for one without). */
  async storeSpell(c: { name: string; stored?: StoredSpell; entry?: SpellEntry; notePath?: string }, d: { area: Area; file?: string | undefined; colour?: string | undefined; colour2?: string | undefined; motion?: string | undefined; more?: More | undefined; alpha?: number | undefined; attach?: boolean | undefined; light?: EffectLight | null | undefined; menu?: boolean | undefined; range?: number | undefined; conditions?: string[] | undefined; teleport?: number | undefined; look?: string | undefined; atlas?: AtlasChoices | undefined }): Promise<string> {
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
    const n = new Notice(`Combat+: getting ${f.name.replace(/_/g, ' ')} from JB2A…`, 0);
    try {
      await fetchJb2a(this.app, this.jb2aRoot(), f.remote);
      delete f.remote;
      return true;
    } catch (e) {
      new Notice('Combat+: could not get that animation from JB2A (' + (e instanceof Error ? e.message : String(e)) + '). Drawn instead.', 8000);
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
      new Notice(`Combat+: ${dl.stop ? 'stopped after' : 'downloaded'} ${r.done} JB2A animations${r.failed ? `, ${r.failed} failed (Download everything again to retry them)` : ''}.`, 10000);
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
      if (!view?.atlasStore || !renderer || !viewport || !isCanvas(canvas)) continue;
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

  async toggleSnap(): Promise<void> { this.settings.snap = !this.settings.snap; await this.save(); new Notice(`Combat+: snap to grid ${this.settings.snap ? 'on' : 'off'} (hold Alt for the other)`); }

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
      above: () => this.settings.above,
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
        const giveUp = (e: unknown) => { this.noCanvas.add(t.viewport); this.pixiPainters.get(t.view)?.stop(); this.pixiPainters.delete(t.view); console.error('Combat+: drawing in Atlas’s canvas went wrong; drawing over it instead', e); this.wake(); };
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
    this.safely('terrain and summoned things', () => this.syncMade());
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
      console.error(`Combat+: ${what} went wrong`, e);
      new Notice(`Combat+: ${what} went wrong (${e instanceof Error ? e.message : String(e)}). The rest carries on.`, 12000);
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
        const pierce = !!e.throughWalls || this.settings.throughWalls;
        const opts = { walls: pierce ? false : undefined, hidden: e.hidden ? true : undefined };
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
          this.untracked(t, () => { made.id = st.addMeasure!({ ...want, ...(pierce ? { walls: false } : {}), ...(e.hidden ? { hidden: true } : {}), ...(light ? { light } : {}), ...(look ? { effect: look } : {}) }); });
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
  /** Extra damage (Sneak Attack, Divine Smite…) rolled onto every row of a card that hit. False: not read. */
  async addExtraDamage(id: string, text: string, from?: string): Promise<boolean> {
    const c = this.settings.caught.find((x) => x.id === id); if (!c?.roll || !text.trim()) return false;
    const t = this.atlasTabs().find((x) => this.mapOf(x) === c.map);
    const type = c.spec?.damage[0]?.type ?? '';
    let done = false;
    for (const r of c.roll.rows) {
      if (r.applied || !(r.outcome === 'hit' || r.outcome === 'crit' || r.outcome === 'unknown')) continue;
      const stats = t ? await this.statsOfToken(t, r.id) : null;
      if (!addExtra(r, text, type, stats, c.spec?.spell !== false)) return false;
      done = true;
    }
    if (done && from) c.added = [...(c.added ?? []), from];
    if (done) { this.saveSoon(); this.wake(); }
    return done;
  }
  /** A player's own save, as they rolled it: its row saved or failed, with its damage then. */
  ownSave(id: string, token: string, saved: boolean): void {
    const c = this.settings.caught.find((x) => x.id === id); const r = c?.roll?.rows.find((x) => x.id === token);
    if (!r?.own || r.applied) return;
    const d = saved ? r.own.saved : r.own.failed;
    Object.assign(r, { outcome: saved ? 'saved' : 'failed', rolled: d.rolled, damage: d.damage, note: 'their player rolled' });
    if (d.why) r.why = d.why; else delete r.why;
    delete r.own;
    this.saveSoon(); this.wake();
  }
  /** A condition put on a creature from a hit card (once; not tracked: you take it off). */
  giveCondition(map: string, token: string, name: string, b?: HTMLElement): void {
    const t = this.atlasTabs().find((x) => this.mapOf(x) === map); const st = t?.store.getState?.();
    if (!t || !st || typeof st.setTokensCondition !== 'function') return;
    const [id] = idsOf([name], this.conditionDefs(t)); if (!id) { new Notice(`Combat+: no “${name}” condition in this collection.`); return; }
    st.setTokensCondition([token], id, true);
    if (b) { b.textContent = `${name} given`; b.toggleAttribute('disabled', true); }
  }
  conditionNames(t: Tab | null = this.atlasTab()): string[] { return this.conditionDefs(t).filter((c) => c.id !== IN_SPELL_ID).map((c) => c.name); }

  /** Puts "In a spell" among the collection's conditions, if it isn't there yet. True when it is there now. */
  private ensureMarker(t: Tab): boolean {
    const defs = this.conditionDefs(t);
    if (defs.some((c) => c.id === IN_SPELL_ID)) return true;
    const id = this.collectionOf(t); const a = this.assetsOf(t);
    if (!id || !a || this.markerAsked.has(id)) return false;
    this.markerAsked.add(id);
    void a.updateCollectionSettings(id, { conditions: [...defs, { ...IN_SPELL }] }).then(() => this.wake()).catch((e: unknown) => { console.error('Combat+: could not add the “In a spell” condition', e); });
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
    if (!e) { new Notice('Combat+: that area isn’t on the map any more.'); return; }
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
      this.pushCaught(e, t);
    }
  }

  /** A token of this size put on the grid as Atlas has them (an odd-sized one's middle in a square's, an even one's on a corner). */
  private gridSpot(t: Tab, q: Point, r: number): Point {
    if (!this.settings.snap) return q;
    const cell = this.scaleOf(t).cell, cells = Math.max(1, Math.round((2 * r) / cell));
    if (cells % 2 === 0) return this.snapPoint(t, q);
    const c = this.snapPoint(t, { x: q.x - cell / 2, y: q.y - cell / 2 });
    return { x: c.x + cell / 2, y: c.y + cell / 2 };
  }

  /**
   * A token pushed `dist` (game units) straight away from `from`; negative: pulled towards it, no nearer than
   * touching (`fromR`: how big what pulls it is). The token moves in Atlas (its own undo step). True: it moved.
   */
  shove(t: Tab, id: string, from: Point, dist: number, fromR = 0): boolean {
    const st = t.store.getState(); const k = this.tokenOf(t, id);
    if (!k || !dist || typeof st?.moveToken !== 'function') return false;
    const gap = Math.hypot(k.x - from.x, k.y - from.y); if (gap < 0.5) return false;
    const ux = (k.x - from.x) / gap, uy = (k.y - from.y) / gap;
    let d = Math.abs(dist) * pxPerFoot(this.scaleOf(t));
    if (dist < 0) d = -Math.min(d, Math.max(0, gap - fromR - k.r));
    if (Math.abs(d) < 0.5) return false;
    const to = this.gridSpot(t, { x: k.x + ux * d, y: k.y + uy * d }, k.r);
    if (Math.hypot(to.x - k.x, to.y - k.y) < 0.5) return false;
    st.moveToken(id, to.x, to.y);
    return true;
  }

  /** A spell that pushes or pulls, just cast: those in its area move (not its caster), away from or towards where it comes from. */
  private pushCaught(e: Effect, t: Tab): void {
    if (!e.push || e.bolt || e.on || e.outline || e.id === 'preview') return;
    const own = e.token ? this.tokenOf(t, e.token) : null;
    const from = own ? { x: own.x, y: own.y } : e.at;
    let n = 0;
    for (const id of this.insideOf(t, e)) {
      if (id === e.token || id === e.caster) continue;
      const k = this.tokenOf(t, id); if (!k) continue;
      // (a caster the cone starts from, not named: whoever stands on its point)
      if (!own && Math.hypot(k.x - from.x, k.y - from.y) <= k.r + 1) continue;
      if (this.shove(t, id, from, e.push, own?.r ?? 0)) n++;
    }
    if (n) new Notice(`${e.name}: ${e.push > 0 ? 'pushed' : 'pulled'} ${n} creature${n === 1 ? '' : 's'} ${Math.abs(e.push)} ${unitLabel()}. Ctrl+Z puts each back.`);
    this.wake();
  }

  /** The caster's level, where its statblock's note gives one (its properties: level, or a class with a number): for spells that grow with it. */
  levelOf(t: Tab, token: string | undefined): number | null {
    if (!token) return null;
    const tok = t.store.getState()?.objects?.tokens?.[token] as Record<string, unknown> | undefined;
    for (const key of ['statblockPath', 'notePath'] as const) {
      const path = tok?.[key]; if (typeof path !== 'string' || !path) continue;
      const fm = this.app.metadataCache.getCache(path)?.frontmatter as Record<string, unknown> | undefined; if (!fm) continue;
      for (const k of Object.keys(fm)) {
        if (!/^(?:character[ _-]?|total[ _-]?|char[ _-]?)?(?:level|lvl)$/i.test(k)) continue;
        const n = Number(String(fm[k]).match(/\d+/)?.[0]);
        if (n > 0 && n <= 30) return n;
      }
      // "class: Warlock 5", "classes: [Fighter 3, Wizard 2]"
      for (const k of Object.keys(fm)) {
        if (!/^class(?:es)?$/i.test(k)) continue;
        const total = [...String(Array.isArray(fm[k]) ? (fm[k] as unknown[]).join(', ') : fm[k]).matchAll(/\b(\d{1,2})\b/g)].reduce((a, m) => a + Number(m[1]), 0);
        if (total > 0 && total <= 30) return total;
      }
      // a creature without levels: "a 9th-level spellcaster" in its text, else its challenge rating (at least 1), for
      // its cantrips' damage and beams
      const all = JSON.stringify(fm);
      const sc = /\b(\d{1,2})(?:st|nd|rd|th)-level spellcaster\b/i.exec(all);
      if (sc) return Number(sc[1]);
      const crv = fm['cr'] ?? fm['challenge'] ?? fm['challenge_rating'];
      if (crv !== undefined && crv !== null && crv !== '') { const v = String(crv).trim(); const n = /^(\d+)\s*\/\s*(\d+)/.test(v) ? 0 : Number(v.match(/\d+/)?.[0]); return Math.min(30, Math.max(1, n || 1)); }
    }
    return null;
  }

  /**
   * After a targeted spell lands on a creature: it's pushed from (or pulled towards) the caster, and a bolt that
   * leaps on goes from it to the nearest others in reach of it (each its own bolt).
   */
  private afterTarget(t: Tab, pending: Pending, target: string | null, caster: Point | null, casterId?: string): void {
    if (target && this.rollsFor(t, casterId) && pending.roll) {
      const after = pending.roll.after;
      void this.rollOn(t, uid(), pending.name, pending.roll, [target], casterId).then((roll) => {
        // what follows (Ice Knife's burst, hit or miss; a spider's poison, on a hit): its save for the target and those
        // near it, on a card of its own
        if (!after) return;
        const o = roll?.rows[0]?.outcome;
        if (after.onHit && (o === 'miss' || o === 'fumble')) return;
        void this.rollOn(t, uid(), `${pending.name}: ${after.near ? 'burst' : 'save'}`, after, this.near(t, target, after.near ?? 0), casterId);
      });
    }
    const m = pending.more; if (!m || !target) return;
    const k = this.tokenOf(t, target); if (!k) return;
    if (m.chain && pending.area.target === 'bolt') {
      const ppf = pxPerFoot(this.scaleOf(t)), reach = (m.chainRange ?? 6 * square()) * ppf;
      const toks = t.store.getState()?.objects?.tokens ?? {};
      const near: { id: string; d: number }[] = [];
      for (const id of Object.keys(toks)) {
        if (id === target) continue;
        const o = this.tokenOf(t, id); if (!o) continue;
        if (caster && Math.hypot(o.x - caster.x, o.y - caster.y) <= o.r + 1) continue;          // not back to the caster
        const d = Math.max(0, Math.hypot(o.x - k.x, o.y - k.y) - o.r - k.r);
        if (d <= reach + 0.5) near.push({ id, d });
      }
      const plain: Pending = { ...pending }; delete plain.more;
      near.sort((x, y) => x.d - y.d).slice(0, m.chain).forEach((o, i) => window.setTimeout(() => {
        const fx = this.targetEffect(t, plain, { x: k.x, y: k.y }, uid(), { x: 0, y: 0 }, o.id);
        if (fx) this.castTarget(fx, plain);
      }, 220 + i * 90));
    }
    if (m.push && caster) window.setTimeout(() => { if (this.shove(t, target, caster, m.push ?? 0)) this.wake(); }, 350);
  }

  /** An instant spell (Fireball) just went off: the creatures it hit (a card, and "In a spell" on them till it's closed). */
  private catchIn(e: Effect): void {
    if (e.lasting || e.bolt || e.outline || e.on) return;
    const tr = this.atlasTabs().find((x) => this.mapOf(x) === e.map);
    if (tr && this.rollsFor(tr, e.rollBy ?? e.caster) && e.roll) {
      const t = tr;
      const ids = this.insideOf(t, e);
      if (ids.length) void this.rollOn(t, e.id, e.name, e.roll, ids, e.rollBy ?? e.caster);
      return;
    }
    if (!this.settings.markCreatures) return;
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
      head.createSpan({ cls: 'sfx-pop-name', text: fx ? fx.name : 'Combat+' });
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
  /** What each of a card's buttons does. */
  private caughtActs = new WeakMap<Element, () => void>();
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
    const inCard = (e: MouseEvent): boolean => !!(e.target as Element | null)?.closest?.('.sfx-caught') || Array.from(doc.querySelectorAll<HTMLElement>('.sfx-caught')).some((c) => { const r = c.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; });
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
      // the card's own buttons (Apply damage, Reroll…): the map's never hear of them, so they're answered here
      if (e.type === 'click' && e.button === 0) {
        const el = (e.target as Element | null)?.closest?.('[data-act]');
        const fn = el ? this.caughtActs.get(el) : undefined;
        if (fn && !(el as HTMLButtonElement).disabled) { e.preventDefault(); fn(); return; }
      }
      // a pointerdown that never reached us: the release or the click closes it instead
      if (e.button === 0 && (e.type === 'mouseup' || e.type === 'pointerup' || e.type === 'click')) { const b = hit(e); if (b?.dataset.caught) { e.preventDefault(); this.closeCaught(b.dataset.caught); } }
    };
    this.registerDomEvent(win, 'pointerdown', down, { capture: true });
    // typing a damage number in a card: not Atlas's shortcuts
    this.registerDomEvent(win, 'keydown', (e: KeyboardEvent) => { const el = e.target as Element | null; if (el?.closest?.('.sfx-caught')) e.stopPropagation(); }, { capture: true });
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
  /** A creature's statblock numbers (AC, saves, resistances, its spell DC): from its note's properties and statblock. */
  async statsOfToken(t: Tab, id: string | undefined): Promise<Stats | null> {
    if (!id) return null;
    const tok = t.store.getState()?.objects?.tokens?.[id] as Record<string, unknown> | undefined;
    for (const key of ['statblockPath', 'notePath'] as const) {
      const path = tok?.[key]; if (typeof path !== 'string' || !path) continue;
      const f = this.app.vault.getAbstractFileByPath(path); if (!(f instanceof TFile)) continue;
      const fm = (this.app.metadataCache.getFileCache(f)?.frontmatter ?? {}) as Record<string, unknown>;
      let text = '';
      try { text = await this.app.vault.cachedRead(f); } catch { /* unreadable: its properties alone */ }
      // a statblock fence's YAML wins over the note's properties
      let fence: Record<string, unknown> = {};
      const m = /```statblock[^\n]*\n([\s\S]*?)```/.exec(text);
      if (m) { try { const y: unknown = parseYaml(m[1]); if (y && typeof y === 'object') fence = y as Record<string, unknown>; } catch { /* not YAML */ } }
      return statsOf({ ...fm, ...fence }, text);
    }
    return null;
  }

  /** A spell's rolls against these creatures, onto its card (and Atlas's table log, if asked and a table runs). */
  async rollOn(t: Tab, id: string, name: string, spec: RollSpec, ids: string[], by: string | undefined, edge: Edge = 'normal', slot?: number): Promise<CastRoll | null> {
    const caster = await this.statsOfToken(t, by);
    const c0 = by ? this.tokenOf(t, by) : null, ppf = pxPerFoot(this.scaleOf(t));
    const map = this.mapOf(t);
    const targets = await Promise.all(ids.map(async (k) => {
      const tk = this.tokenOf(t, k);
      // as the rules count it: next to the caster is 5 ft (a square), one square between them 10 ft
      const feet = c0 && tk ? Math.max(0, Math.max(Math.abs(tk.x - c0.x), Math.abs(tk.y - c0.y)) - tk.r - c0.r) / ppf + square() : undefined;
      const stats = await this.statsOfToken(t, k);
      // Legendary Resistance left today
      if (stats?.legendary) stats.legendary = Math.max(0, stats.legendary - (this.settings.legendary[`${map}|${k}`] ?? 0));
      const hp = ((t.store.getState()?.objects?.tokens?.[k] as { resources?: Record<string, { current: number; max: number }> } | undefined)?.resources ?? {});
      const hk = ['hp', 'health', 'hitpoints'].find((x) => hp[x]);
      const hurt = !!hk && hp[hk].max > 0 && hp[hk].current < hp[hk].max;
      const own = this.settings.rollWho === 'npcs' && this.isPC(t, k);
      return { id: k, name: this.tokenName(t, k), stats, conds: this.condNames(t, k), ...(feet !== undefined ? { feet: Math.round(feet * 10) / 10 } : {}), ...(hurt ? { hurt } : {}), ...(own ? { own } : {}) };
    }));
    const level = this.levelOf(t, by);
    const roll = rollAgainst(spec, caster, targets, { level, edge, slot: slot ?? null, ...(by ? { casterConds: this.condNames(t, by) } : {}) });
    const c: Caught = { id, map, name, tokens: targets.map((x) => ({ id: x.id, name: x.name })), roll, spec, ...(by ? { by } : {}), level, edge, ...(slot ? { slot } : {}), ...(spec.kind === 'attack' && caster?.extras?.length ? { extras: caster.extras } : {}) };
    const at = this.settings.caught.findIndex((x) => x.id === id);
    if (at >= 0) this.settings.caught[at] = c; else this.settings.caught.push(c);
    this.saveSoon(); this.wake();
    if (this.settings.rollPost) void this.postRoll(c);
    return roll;
  }

  /** A card's rolls as one line each, posted to Atlas's table log (as the GM), when a table is running. */
  private async postRoll(c: Caught): Promise<void> {
    const atlas = (this.app as unknown as { plugins?: { plugins?: Record<string, { tableChat?: { running?: boolean; post?: (p: { text: string }) => Promise<unknown> } | null }> } }).plugins?.plugins?.['atlas-vtt'];
    const chat = atlas?.tableChat;
    if (!c.roll || !chat?.running || typeof chat.post !== 'function') return;
    const lines = [`**${c.name}**: ${c.roll.header}${c.roll.damageText ? ` · ${c.roll.damageText}` : ''}`, ...c.roll.rows.map((r) => `${r.name}: ${rowText(r)}`)];
    try { await chat.post({ text: lines.join('\n') }); } catch { /* the table refused it: the card still has it */ }
  }

  /** A token's conditions as names (and ids), for rolls: Paralyzed, Prone… */
  condNames(t: Tab, id: string): string[] {
    const ids = ((t.store.getState()?.objects?.tokens?.[id] as { conditions?: unknown } | undefined)?.conditions ?? []) as unknown[];
    const defs = this.conditionDefs(t);
    return ids.map((x) => String(x)).map((x) => defs.find((d) => d.id === x)?.name ?? x);
  }

  /** A failed save turned by Legendary Resistance: saved, its damage then, one use gone for the day. */
  useLegendary(cardId: string, rowId: string): void {
    const c = this.settings.caught.find((x) => x.id === cardId); const r = c?.roll?.rows.find((x) => x.id === rowId);
    if (!c || !r?.onSave || r.applied) return;
    Object.assign(r, { outcome: 'saved', rolled: r.onSave.rolled, damage: r.onSave.damage, legendary: true, note: [r.note, 'Legendary Resistance'].filter(Boolean).join('; ') });
    if (!r.onSave.why) delete r.why; else r.why = r.onSave.why;
    delete r.onSave; delete r.temp;
    const k = `${c.map}|${rowId}`; this.settings.legendary[k] = (this.settings.legendary[k] ?? 0) + 1;
    this.saveSoon(); this.wake();
  }

  /**
   * A token's temporary hit points, kept on the token as one of its Atlas resources: the one it has already (Temp HP,
   * temp, thp…), else the one named in the settings ("Temp HP": temp-hp). Added in Atlas as a resource of that
   * name, it shows as a bar.
   */
  private tempOf(t: Tab, id: string): { key: string; value: number; max: number } {
    const res = ((t.store.getState()?.objects?.tokens?.[id] as { resources?: Record<string, { current: number; max: number }> } | undefined)?.resources) ?? {};
    const named = (this.settings.tempResource || 'Temp HP').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'temp-hp';
    const key = (res[named] ? named : undefined) ?? Object.keys(res).find((k) => /^(?:temp|thp|temp[-_ ]?hp|temporary[-_ ]?(?:hit[-_ ]?points|hp))(?:-\d+)?$/i.test(k)) ?? named;
    return { key, value: res[key]?.current ?? 0, max: res[key]?.max ?? 0 };
  }

  /** A card's damage taken off its creatures' hit points in Atlas (one undo step); each row once. */
  applyRoll(id: string): void {
    const c = this.settings.caught.find((x) => x.id === id); if (!c?.roll) return;
    const t = this.atlasTabs().find((x) => this.mapOf(x) === c.map); if (!t) return;
    const st = t.store.getState(); const toks = st?.objects?.tokens ?? {};
    const changes: { id: string; changes: Record<string, unknown> }[] = [];
    let missing = 0;
    for (const r of c.roll.rows) {
      if (r.applied || !(r.damage > 0 || (r.temp ?? 0) > 0)) continue;
      const tok = toks[r.id] as { resources?: Record<string, { current: number; max: number }> } | undefined;
      const res = { ...(tok?.resources ?? {}) };
      const key = ['hp', 'health', 'hitpoints'].find((k) => res[k]);
      const tmp = this.tempOf(t, r.id);
      let left = r.damage, temp = tmp.value;
      // temporary hit points go first; new ones replace old if more (they don't add up) (healing never touches them)
      if (left > 0 && temp > 0 && r.outcome !== 'heal') { const used = Math.min(temp, left); temp -= used; left -= used; }
      if ((r.temp ?? 0) > temp) temp = r.temp ?? 0;
      if (left > 0 && !key) { missing++; continue; }
      if (key && left > 0 && r.outcome === 'heal') { res[key] = { ...res[key], current: Math.min(res[key].max, res[key].current + left) }; left = 0; }
      if (key && left > 0) res[key] = { ...res[key], current: Math.max(0, res[key].current - left) };
      // the bar: full when given, emptying as they're used; gone (no maximum) once none are left
      if (temp !== tmp.value || (r.temp ?? 0) > 0) res[tmp.key] = temp > 0 ? { current: temp, max: (r.temp ?? 0) >= temp && (r.temp ?? 0) > tmp.value ? temp : Math.max(tmp.max, temp) } : { current: 0, max: 0 };
      changes.push({ id: r.id, changes: { resources: res } });
      r.applied = true;
    }
    if (changes.length && typeof st?.updateTokens === 'function') st.updateTokens(changes);
    if (missing) new Notice(`Combat+: ${missing} creature${missing === 1 ? ' has' : 's have'} no hit points in Atlas; take their damage off by hand.`);
    this.saveSoon(); this.wake();
  }

  /** Whether a map is on screen (its tab in front, its canvas laid out). */
  private shown(t: Tab): boolean {
    const c = t.canvas; if (!c.isConnected || c.offsetParent === null) return false;
    const r = c.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  paintCaught(): void {
    // a card whose map isn't showing (its tab behind another, or closed): gone until it shows again
    const showing = new Set(this.atlasTabs().filter((t) => this.shown(t)).map((t) => this.viewKey(t)));
    for (const d of this.docs()) d.body.querySelectorAll<HTMLElement>(':scope > .sfx-caught').forEach((el) => { if (!showing.has(el.dataset.view ?? '')) el.remove(); });
    for (const t of this.atlasTabs()) {
      const doc = t.canvas.ownerDocument;
      const list = this.settings.caught.filter((c) => c.map === this.mapOf(t));
      // on the page itself, over the map's top right (out of Atlas's map and its layers, which take its clicks)
      // cards left by an earlier copy of the add-on (before an update or a reload): gone
      doc.body.querySelectorAll<HTMLElement>(':scope > .sfx-caught').forEach((el) => { if (el.dataset.owner !== this.instanceKey) el.remove(); });
      let box = doc.body.querySelector<HTMLElement>(`:scope > .sfx-caught[data-view="${this.viewKey(t)}"]`);
      if (!list.length || !this.shown(t)) { box?.remove(); continue; }
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
        head.createSpan({ cls: 'sfx-caught-count', text: c.roll ? c.roll.header : `${c.tokens.length} hit` });
        const x = head.createEl('button', { cls: 'clickable-icon sfx-caught-x', attr: { 'aria-label': 'Close' } }); setIcon(x, 'x');
        x.dataset.caught = c.id;
        x.onclick = (ev) => { ev.preventDefault(); ev.stopPropagation(); this.closeCaught(c.id); };
        if (!c.roll) { for (const k of c.tokens) card.createDiv({ cls: 'sfx-caught-row' }).createSpan({ cls: 'sfx-caught-name', text: k.name }); continue; }
        if (c.roll.damageText) card.createDiv({ cls: 'sfx-roll-dmg', text: c.roll.damageText });
        const t3 = this.atlasTabs().find((x) => this.mapOf(x) === c.map);
        for (const r of c.roll.rows) {
          const row = card.createDiv({ cls: `sfx-caught-row sfx-roll-row is-${r.outcome}${r.applied ? ' is-applied' : ''}` });
          const left = row.createDiv({ cls: 'sfx-roll-who' });
          left.createSpan({ cls: 'sfx-caught-name', text: r.name });
          left.createSpan({ cls: 'sfx-roll-dice', text: rowText(r, false) });
          if (r.why) left.createSpan({ cls: 'sfx-roll-why', text: r.why });
          if (r.note) left.createSpan({ cls: 'sfx-roll-why', text: r.note });
          if (r.extra?.length) left.createSpan({ cls: 'sfx-roll-why', text: r.extra.join(', ') });
          if (r.outcome === 'heal') left.createSpan({ cls: 'sfx-roll-why', text: r.applied ? 'healed' : 'heals (change the amount at the right)' });
          if (r.temp) left.createSpan({ cls: 'sfx-roll-why', text: `gains ${r.temp} temporary hit points` });
          const had = t3 ? this.tempOf(t3, r.id).value : 0;
          if (had > 0 && r.damage > 0 && !r.applied) left.createSpan({ cls: 'sfx-roll-why', text: `${had} temporary hit points go first` });
          // a player's own save: what they rolled, told to you
          if (r.own && !r.applied) {
            for (const [text, saved] of [['Saved', true], ['Failed', false]] as const) {
              const b = left.createEl('button', { cls: 'sfx-roll-btn sfx-roll-own', text }); b.dataset.act = '1';
              this.caughtActs.set(b, () => this.ownSave(c.id, r.id, saved));
            }
          }
          if (r.onSave && !r.applied) {
            const b = left.createEl('button', { cls: 'sfx-roll-btn sfx-roll-lr', text: 'Use Legendary Resistance' }); b.dataset.act = '1';
            this.caughtActs.set(b, () => this.useLegendary(c.id, r.id));
          }
          // the conditions it gives, on a failed save or a hit (or what you judge): one click each, yours to take off
          if (c.spec?.conds?.length && ['failed', 'hit', 'crit', 'unknown'].includes(r.outcome)) {
            for (const name of c.spec.conds) {
              const [cid] = t3 ? idsOf([name], this.conditionDefs(t3)) : [];
              const on = !!cid && !!t3 && ((t3.store.getState?.()?.objects?.tokens?.[r.id]?.conditions ?? [])).includes(cid);
              const b = left.createEl('button', { cls: 'sfx-roll-btn sfx-roll-cond', text: on ? `${name} given` : `Give ${name}` }); b.dataset.act = '1';
              if (on) b.toggleAttribute('disabled', true);
              this.caughtActs.set(b, () => this.giveCondition(c.map, r.id, name, b));
            }
          }
          const dmg = row.createEl('input', { cls: 'sfx-roll-input', attr: { type: 'number', min: '0', 'aria-label': `Damage to ${r.name}` } });
          dmg.value = String(r.damage); dmg.disabled = !!r.applied; if (!r.damage && (r.temp || (!c.spec?.damage.length && !c.spec?.weapon))) dmg.hidden = true;
          dmg.setAttribute('aria-label', `${r.outcome === 'heal' ? 'Healing' : 'Damage'} to ${r.name}`);
          dmg.addEventListener('change', () => { const n = Math.max(0, Math.round(Number(dmg.value) || 0)); r.damage = n; dmg.value = String(n); this.saveSoon(); box.dataset.k = JSON.stringify(list); });
        }
        const acts = card.createDiv({ cls: 'sfx-roll-acts' });
        const act = (text: string, fn: () => void, cls = '') => { const b = acts.createEl('button', { cls: 'sfx-roll-btn ' + cls, text }); b.dataset.act = '1'; this.caughtActs.set(b, fn); return b; };
        const left = c.roll.rows.some((r) => !r.applied && (r.damage > 0 || (r.temp ?? 0) > 0));
        // (nothing to apply where it deals no damage and gives no hit points: a grapple, a charm)
        if (c.spec?.damage.length !== 0 || c.spec?.weapon || c.roll.rows.some((r) => r.temp || r.damage > 0)) act(left ? (c.spec?.kind === 'heal' ? 'Apply healing' : c.roll.rows.some((r) => r.damage > 0) ? 'Apply damage' : 'Give temp HP') : 'Applied', () => this.applyRoll(c.id), 'mod-cta').toggleAttribute('disabled', !left);
        const again = (edge: Edge, slot = c.slot) => () => { const t2 = this.atlasTabs().find((x) => this.mapOf(x) === c.map); if (t2 && c.spec) void this.rollOn(t2, c.id, c.name, c.spec, c.tokens.map((k) => k.id), c.by, edge, slot); };
        // a higher slot (a spell that does more with one): rolled again at it
        if (c.spec?.level && (c.spec.upcast || c.spec.tempUp) && !c.roll.rows.some((r) => r.applied)) {
          const sel = acts.createEl('select', { cls: 'sfx-roll-slot', attr: { 'aria-label': 'Spell slot level' } });
          for (let lv = c.spec.level; lv <= 9; lv++) sel.createEl('option', { value: String(lv), text: `Slot ${lv}` });
          sel.value = String(c.slot ?? c.spec.level);
          sel.addEventListener('change', () => again(c.edge ?? 'normal', Number(sel.value))());
        }
        // extra damage on a hit (Sneak Attack, Divine Smite, Hex): typed in, rolled for each creature hit
        const hits = c.roll.rows.filter((r) => !r.applied && (r.outcome === 'hit' || r.outcome === 'crit' || r.outcome === 'unknown'));
        if (c.spec?.kind === 'attack' && hits.length) {
          // the attacker's own (Sneak Attack +3d6): one click, when its rules are met; once each
          for (const x of c.extras ?? []) {
            const done = (c.added ?? []).includes(x.name);
            const b = act(done ? `${x.name} added` : `${x.name} +${x.dice}`, () => { void this.addExtraDamage(c.id, `${x.dice}${x.type ? ` ${x.type}` : ''}`, x.name); });
            b.title = `Add ${x.dice}${x.type ? ` ${x.type}` : ''} damage to each creature hit`;
            if (done) b.toggleAttribute('disabled', true);
          }
          const extra = acts.createDiv({ cls: 'sfx-roll-extra' });
          const box2 = extra.createEl('input', { cls: 'sfx-roll-extra-input', attr: { type: 'text', placeholder: 'Extra: 3d6, 2d8 radiant', 'aria-label': 'Extra damage on a hit' } });
          const add = extra.createEl('button', { cls: 'sfx-roll-btn', text: 'Add' }); add.dataset.act = '1';
          const go = () => { void this.addExtraDamage(c.id, box2.value).then((ok) => { if (!ok) { box2.addClass('is-bad'); box2.focus(); } }); };
          this.caughtActs.set(add, go);
          box2.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
        }
        if (!c.roll.rows.some((r) => r.applied)) { act('Reroll', again('normal')); act('Adv', again('advantage')).title = 'Roll again with advantage'; act('Dis', again('disadvantage')).title = 'Roll again with disadvantage'; }
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

  /**
   * A press on a token that carries a spell's light (an aura's, at its middle): the token is what's pressed, not the
   * light's marker on top of it (Atlas would take the marker, and drag the light off its spell). The light steps
   * aside while Atlas looks at the press, and is back at once. Not in Atlas's lighting tool, where lights are worked
   * on: there the marker is pressed as ever.
   */
  private dodgeLights(t: Tab, p: Point): void {
    const st = t.store.getState?.(); if (!st || typeof st.updateLight !== 'function' || st.activeTool === 'wall') return;
    const tok = this.tokenAt(t, p); if (!tok) return;
    const map = this.mapOf(t), lights = st.objects?.lights ?? {};
    const at = this.tokenOf(t, tok.id); if (!at) return;
    const back: { id: string; x: number; y: number }[] = [];
    for (const e of this.effects) {
      if (e.map !== map || e.token !== tok.id) continue;
      for (const id of e.lightIds ?? []) {
        const l = lights[id];
        if (l && Math.hypot(l.x - at.x, l.y - at.y) <= at.r + 1) back.push({ id, x: l.x, y: l.y });
      }
    }
    if (!back.length) return;
    this.untracked(t, () => { for (const b of back) st.updateLight(b.id, { x: b.x + 1e7, y: b.y + 1e7 }); });
    const restore = () => {
      const now = t.store.getState?.(); if (!now) return;
      const have = back.filter((b) => { const l = now.objects?.lights?.[b.id]; return !!l && l.x > 5e6; });
      // (where its token is by now: a press that already moved it)
      if (have.length) this.untracked(t, () => { for (const b of have) now.updateLight(b.id, { x: b.x, y: b.y }); });
      this.wake();
    };
    window.setTimeout(restore, 0);
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
    return this.outline(e, t);
  }

  /** An area's outline as corners (a circle: a many-sided ring just outside it); null for a wall, or one whose token is gone. */
  outline(e: Effect, t: Tab): Point[] | null {
    if (e.shape === 'wall') return null;
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

  private terrainKeys = new Map<string, string>();

  /**
   * What spells keep in Atlas beside their areas and lights, brought up to date: a lasting area that is difficult
   * terrain has a map feature of its shape (named after it; Atlas's movement ruler counts it), following it as it
   * moves; a summoned thing has its token. Each goes when its spell ends (or, a token taken off the map by hand,
   * its spell ends).
   */
  syncMade(): void {
    let changed = false;
    for (const t of this.atlasTabs()) {
      const st = t.store.getState?.(); if (!st) continue;
      const map = this.mapOf(t);
      const feats = st.objects?.mapFeatures ?? {}, toks = st.objects?.tokens ?? {};
      for (const e of this.effects) {
        if (e.map !== map || e.id === 'preview') continue;
        // a summoned thing taken off the map: its spell is over
        // (not while a map is still loading its tokens)
        if (e.summoned && !toks[e.summoned] && Object.keys(toks).length > 0 && Date.now() - (e.started ?? 0) > 1500) { window.setTimeout(() => this.end(e.id), 0); continue; }
        if (!e.terrain || !e.lasting || e.on || e.bolt || typeof st.addMapFeatures !== 'function') continue;
        const poly = this.outline(e, t); if (!poly || poly.length < 3) continue;
        const pts = poly.map((q) => ({ x: Math.round(q.x * 10) / 10, y: Math.round(q.y * 10) / 10 }));
        const key = JSON.stringify(pts);
        if (!e.terrainId || !feats[e.terrainId]) {
          let ids: string[] = [];
          this.untracked(t, () => { ids = st.addMapFeatures?.([{ polygon: pts, name: e.name, terrain: { difficult: true } }]) ?? []; });
          if (!ids[0]) continue;
          e.terrainId = ids[0]; this.terrainKeys.set(e.id, key);
          this.settings.made.push({ map, effect: e.id, kind: 'terrain', id: ids[0] });
          changed = true;
        } else if (this.terrainKeys.get(e.id) !== key) {
          const had = this.terrainKeys.has(e.id), id = e.terrainId;
          this.terrainKeys.set(e.id, key);
          // (first seen since a reload: only moved if it isn't where it should be)
          if (had || JSON.stringify(feats[id]?.polygon ?? null) !== key) this.untracked(t, () => st.updateMapFeature?.(id, { polygon: pts }));
        }
      }
      // their spell over (or no longer difficult terrain): taken away
      const keep: typeof this.settings.made = [];
      for (const m of this.settings.made) {
        if (m.map !== map) { keep.push(m); continue; }
        const e = this.effects.find((x) => x.id === m.effect);
        const still = !!e && (m.kind === 'terrain' ? !!e.terrain && e.terrainId === m.id : e.summoned === m.id);
        if (still) { keep.push(m); continue; }
        this.untracked(t, () => { if (m.kind === 'terrain') { if (feats[m.id]) st.deleteMapFeature?.(m.id); } else if (toks[m.id]) st.deleteToken?.(m.id); });
        if (e && m.kind === 'terrain' && e.terrainId === m.id) delete e.terrainId;
        this.terrainKeys.delete(m.effect);
        changed = true;
      }
      if (keep.length !== this.settings.made.length) this.settings.made = keep;
    }
    if (changed) this.saveSoon();
  }

  /** A summoned thing's token picture: a soft disc in the spell's colour with its initials, kept in the vault (made once per spell and colour). */
  private async summonImage(name: string, colour: string): Promise<string> {
    const safe = name.replace(/[\\/:*?"<>|#^[\]]/g, ' ').replace(/\s+/g, ' ').trim() || 'Summoned';
    const folder = 'Spell Effects/Summoned';
    const path = `${folder}/${safe} ${colour.replace('#', '')}.png`;
    if (this.app.vault.getAbstractFileByPath(path)) return path;
    const c = createEl('canvas'); c.width = 256; c.height = 256;
    const g = c.getContext('2d'); if (!g) return '';
    const grad = g.createRadialGradient(128, 128, 10, 128, 128, 124);
    grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.35, colour); grad.addColorStop(1, colour + '00');
    g.fillStyle = grad; g.beginPath(); g.arc(128, 128, 124, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(0,0,0,.62)'; g.font = '600 92px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(safe.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join(''), 128, 134);
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/png')); if (!blob) return '';
    try {
      for (const part of ['Spell Effects', folder]) if (!this.app.vault.getAbstractFileByPath(part)) await this.app.vault.createFolder(part);
      await this.app.vault.createBinary(path, await blob.arrayBuffer());
    } catch { if (!this.app.vault.getAbstractFileByPath(path)) return ''; }
    return path;
  }

  /**
   * A summoned thing (Spiritual Weapon, Flaming Sphere) put on the map: a token of its own, named after the spell,
   * with the spell's animation and light on it. It's moved like any token; ending the spell takes it away.
   */
  async summonAt(t: Tab, pending: Pending, at: Point): Promise<void> {
    const st = t.store.getState();
    if (typeof st?.addToken !== 'function') { new Notice('Combat+: this Atlas can’t be given tokens by an add-on; it’s placed as an area instead.'); return; }
    const img = await this.summonImage(pending.name, pending.colour);
    if (!img) { new Notice('Combat+: couldn’t make the token’s picture.'); return; }
    const a = pending.area;
    const cells = Math.max(1, Math.min(4, Math.round((2 * (a.target ? 0 : a.size)) / square()) || 1));
    const spot = this.gridSpot(t, at, (cells * this.scaleOf(t).cell) / 2);
    const id = st.addToken({ kind: 'character', name: pending.name, x: spot.x, y: spot.y, imagePath: img, size: cells, showNameplate: true });
    if (!id) return;
    const plain: Pending = { ...pending }; delete plain.more;
    const fx: Effect = { id: uid(), map: this.mapOf(t), name: pending.name, shape: 'emanation', size: 0, at: { x: spot.x, y: spot.y }, token: id, on: true, lasting: true, summoned: id,
      colour: pending.colour, ...(pending.colour2 ? { colour2: pending.colour2 } : {}), ...(pending.alpha ? { alpha: pending.alpha } : {}), started: Date.now(), ...(pending.file ? { file: pending.file } : {}), ...(pending.light ? { light: { ...pending.light } } : {}), ...condsOf(plain) };
    this.settings.made.push({ map: fx.map, effect: fx.id, kind: 'token', id });
    if (pending.file) await this.ensureFile(pending.file).then(() => this.indexVault()).catch(() => undefined);
    this.cast(fx);
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
    if (!this.atlasTab()) { new Notice('Combat+: open an Atlas map first.'); return; }
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
    if (!at || typeof st.moveToken !== 'function') { new Notice('Combat+: couldn’t move that token.'); return; }
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
    if (!tab) { new Notice('Combat+: open an Atlas map first.'); return; }
    this.placing?.stop();
    this.last = pending;
    // the spells cast last, newest first (the same spell once)
    if (!pending.plain) this.settings.recent = [pending, ...this.settings.recent.filter((r) => r.name !== pending.name || r.key !== pending.key)].slice(0, RECENT);
    this.saveSoon();
    if (pending.teleport && pending.teleport > 0) { this.teleportCast(tab, pending, casterToken); return; }
    if (pending.atlas?.tool && pending.atlas.draw !== 'animation' && this.areasOn(tab) && toolShapeOf(pending.area)) { this.placeWithAtlas(tab, pending); return; }
    if (pending.area.shape === 'wall') { this.drawWall(tab, pending); return; }
    const summon = !!pending.more?.summon && !pending.area.self && pending.area.target !== 'bolt';
    if (pending.area.target && !summon) { this.castAt(tab, pending, casterToken); return; }
    // (a summoned thing: put at a point, whatever its area)
    const a: Area = summon ? { shape: 'radius', size: pending.area.target ? square() / 2 : Math.max(pending.area.size, square() / 2), from: 'point', lasting: true } : pending.area;
    // several areas (Meteor Swarm's four), placed one after another
    const many = !summon && a.from === 'point' && (pending.more?.count ?? 1) > 1 ? Math.min(12, pending.more?.count ?? 1) : 1;
    let placed = 0;
    const doc = tab.canvas.ownerDocument;
    const hint = (tab.canvas.parentElement ?? doc.body).createDiv({ cls: 'sfx-hint' });
    const needsCaster = a.from === 'caster';
    const aims = a.shape === 'cone' || a.shape === 'line' || (a.shape === 'cube' && a.from === 'caster');
    const say = () => { hint.textContent = `${pending.name}: ` + (needsCaster && !this.placing?.caster ? `first click the caster’s token (it starts from them${aims ? '; then aim' : ''})` : aims ? 'aim and click' : reach ? `click where it goes (within its ${pending.range} ${unitLabel()} range, shown round the caster)` : 'click where it goes') + (many > 1 ? `   ·   ${placed + 1} of ${many}` : '') + '   ·   Esc to stop'; };
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
      const base = { id, map, ...(casterToken ? { rollBy: casterToken } : {}), name: pending.name, shape: a.shape, size: a.size, ...(a.width ? { width: a.width } : {}), ...(a.shape === 'cone' ? { angle: a.angle ?? this.coneAngle() } : {}), colour: pending.colour, ...(pending.colour2 ? { colour2: pending.colour2 } : {}), ...(pending.alpha ? { alpha: pending.alpha } : {}), lasting: a.lasting, started: Date.now(), ...(pending.file ? { file: pending.file } : {}), ...(pending.light && id !== 'preview' ? { light: { ...pending.light } } : {}), ...condsOf(pending) };
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
      const fx = effectAt(p, uid());
      // several of them (Meteor Swarm's four): placed one after another
      if (fx && many > 1 && ++placed < many) { this.cast(fx); say(); return; }
      this.placing.stop();
      if (fx && summon) void this.summonAt(tab, pending, fx.at);
      else if (fx) this.cast(fx);
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
  private castAt(tab: Tab, pending: Pending, casterToken?: string, done = 0): void {
    const a = pending.area;
    const bolt = a.target === 'bolt';
    const doc = tab.canvas.ownerDocument;
    const hint = (tab.canvas.parentElement ?? doc.body).createDiv({ cls: 'sfx-hint' });
    const ct = casterToken ? this.tokenOf(tab, casterToken) : null;
    let caster: { x: number; y: number } | null = ct ? { x: ct.x, y: ct.y } : null;
    let count = done;
    // how many it makes (darts, rays; more beams as the caster's level goes up): it stops by itself after the last
    const total = pending.sequence?.length ? pending.sequence.length : pending.more && ((pending.more.count ?? 1) > 1 || pending.more.steps?.length) ? countAt(pending.more, this.levelOf(tab, casterToken)) : 0;
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
        : total > 1 ? `click target ${Math.min(total, count + 1)} of ${total} (the same one again for more than one on it)   ·   Esc when done`
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
      if (fx) { this.castTarget(fx, pending); count++; this.afterTarget(tab, this.stepOf(pending, count - 1), this.tokenAt(tab, p)?.id ?? null, caster, casterToken); }
      if (fx && a.self) { this.placing.stop(); return; }          // only the caster: done
      if (fx && total > 1 && count >= total) { this.placing.stop(); return; }          // its last dart, ray or beam: done
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
    // a plain attack: only its roll (afterTarget), nothing on the map
    if (pending.plain) return;
    if (fx.bolt && pending.file) {
      const want = nearestLength(pending.file, this.files, fx.size / Math.max(1e-6, fromFeet(1)));
      void (async () => { if (want !== fx.file && await this.ensureFile(want)) { fx.file = want; this.indexVault(); } this.cast(fx); })();
    } else this.cast(fx);
  }

  /**
   * A player character's token: marked so in Atlas's token library (the one it was placed from, or one sharing its
   * statblock note).
   */
  isPC(t: Tab, id: string): boolean {
    const tok = t.store.getState()?.objects?.tokens?.[id] as { playerCharacter?: boolean; assetId?: string; imagePath?: string; statblockPath?: string } | undefined;
    if (!tok) return false;
    if (tok.playerCharacter === true) return true;
    const svc = call<{ loadedTokenAssets?: () => { id: string; playerCharacter?: boolean; imagePath?: string; statblockPath?: string }[] }>(t.view.serviceManager, 'getAssetService');
    let lib: { id: string; playerCharacter?: boolean; imagePath?: string; statblockPath?: string }[] = [];
    try { lib = typeof svc?.loadedTokenAssets === 'function' ? svc.loadedTokenAssets() : []; } catch { lib = []; }
    const own = lib.find((a) => (tok.assetId !== undefined && a.id === tok.assetId) || (!!tok.imagePath && a.imagePath === tok.imagePath));
    if (own) return own.playerCharacter === true;
    return !!tok.statblockPath && lib.some((a) => a.playerCharacter === true && a.statblockPath === tok.statblockPath);
  }
  /** Whether a cast by `caster` is rolled: rolling on, and (NPCs only) not a player character's own. */
  rollsFor(t: Tab, caster: string | undefined): boolean {
    return this.settings.rolling && !(this.settings.rollWho === 'npcs' && !!caster && this.isPC(t, caster));
  }

  /** A Multiattack's attack number `i` (its name and roll); anything else as it is. */
  private stepOf(p: Pending, i: number): Pending {
    const s = p.sequence?.[Math.min(i, (p.sequence?.length ?? 1) - 1)];
    return s ? { ...p, name: `${p.name}: ${s.name}`, roll: s.roll } : p;
  }

  /** A creature and those within `feet` of it (as the rules count: next to it, 5 ft). */
  near(t: Tab, id: string, feet: number): string[] {
    const k = this.tokenOf(t, id); if (!k) return [id];
    const ppf = pxPerFoot(this.scaleOf(t));
    const out = [id];
    for (const o of Object.keys(t.store.getState()?.objects?.tokens ?? {})) {
      if (o === id) continue;
      const p = this.tokenOf(t, o); if (!p) continue;
      const gap = Math.max(0, Math.max(Math.abs(p.x - k.x), Math.abs(p.y - k.y)) - p.r - k.r) / ppf + square();
      if (feet > 0 && gap <= feet + 0.5) out.push(o);
    }
    return out;
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
      // how far, as the rules count it: the squares to its space, its own counted (next to it: 5 ft)
      const gap = c ? Math.max(0, Math.max(Math.abs(k.x - c.x), Math.abs(k.y - c.y)) - c.r - k.r) : 0;      // (diagonals count as straight, as D&D counts them)
      if (gap + square() * ppf > reach + 0.5 * ppf) continue;
      out.push({ id, name: this.tokenName(t, id), ft: c ? Math.round(gap / ppf / square()) * square() + square() : null });
    }
    return out.sort((x, y) => (x.ft ?? 0) - (y.ft ?? 0) || x.name.localeCompare(y.name));
  }

  /** A targeted spell cast straight on a creature (picked from the Cast menu), from its caster. */
  castOnTarget(t: Tab, pending: Pending, target: string, caster?: string): void {
    const k = this.tokenOf(t, target); if (!k) return;
    const c = caster ? this.tokenOf(t, caster) : null;
    this.last = pending;
    if (!pending.plain) this.settings.recent = [pending, ...this.settings.recent.filter((r) => r.name !== pending.name || r.key !== pending.key)].slice(0, RECENT);
    this.saveSoon();
    const fx = this.targetEffect(t, pending, c ? { x: c.x, y: c.y } : null, uid(), { x: k.x, y: k.y }, target);
    if (!fx) return;
    this.castTarget(fx, pending);
    this.afterTarget(t, this.stepOf(pending, 0), target, c ? { x: c.x, y: c.y } : null, caster);
    // more than one to send (Magic Missile's darts): the rest are clicked on the map
    const total = pending.sequence?.length ? pending.sequence.length : pending.more && ((pending.more.count ?? 1) > 1 || pending.more.steps?.length) ? countAt(pending.more, this.levelOf(t, caster)) : 0;
    if (total > 1) this.castAt(t, pending, caster, 1);
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
    if (!this.settings.animations && e.file) delete e.file;
    this.fitCone(e, this.atlasTabs().find((x) => this.mapOf(x) === e.map) ?? null);
    window.setTimeout(() => this.bars(), 0);
    const before = this.snapshot();
    this.effects.push(e);
    if (e.lasting) { this.commit(before); this.saveSoon(); }
    if (!e.lasting || e.push) { this.toCatch.set(e.id, Date.now()); this.catchPending(); }
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
    new Notice(`Combat+: ended ${n} lasting effect${n === 1 ? '' : 's'}`);
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
  colour2?: string | undefined; alpha?: number | undefined; angle?: number | undefined; motion?: string | undefined;
  set(change: { file?: string | undefined; colour?: string; colour2?: string | undefined; alpha?: number | undefined; fileQuery?: string; motion?: string | undefined }, rerender: boolean): void;
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
  const sample = drawnSample(dt, c.shape, c.colour, c.colour2, c.alpha, c.angle, c.motion);
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
  if (!cur) {
    // drawn: how it moves while it lasts (the sample shows it)
    const mv = row.createDiv({ cls: 'sfx-swatches sfx-motion' });
    mv.createSpan({ cls: 'sfx-label sfx-flush', text: 'Motion' });
    const now = motionOf(c.motion);
    const kind = mv.createEl('select'); for (const [k, label] of MOTIONS) kind.createEl('option', { value: k, text: label }); kind.value = now.kind;
    kind.title = 'How the drawn area moves while it lasts on the map';
    mv.createSpan({ cls: 'sfx-label sfx-flush', text: 'Speed' });
    const speed = mv.createEl('select'); for (const [k, label] of MOTION_SPEEDS) speed.createEl('option', { value: k, text: label }); speed.value = now.speed;
    const put = () => { speed.disabled = kind.value === 'still'; const m = motionKey(kind.value, kind.value === 'still' ? '' : speed.value); moving(sample, m); c.set({ motion: m }, false); };
    speed.disabled = now.kind === 'still';
    kind.onchange = put; speed.onchange = put;
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
    lookPicker(body.createDiv(), bottom, { app: this.app, plugin: P, name: fx.name, shape: fx.shape, angle: fx.angle, size: fx.size, file: fx.file, colour: fx.colour, colour2: fx.colour2, alpha: fx.alpha, motion: fx.motion, fileQuery: this.fileQuery,
      set: (c, re) => {
        if ('motion' in c) { if (c.motion) fx.motion = c.motion; else delete fx.motion; P.refresh(fx.id); P.changed(); }
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
  private motion: string | undefined;
  /** What else it does (from its text, or as changed here). */
  private more: More = {};
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
    this.colour2 = undefined; this.alpha = undefined; this.motion = undefined;
    if (c?.stored) {
      const st = c.stored;
      this.name = st.name; this.area = { ...st.area }; this.file = st.file; this.colour = st.colour ?? this.colour; this.attach = !!st.attach;
      this.colour2 = st.colour2; this.alpha = st.alpha; this.motion = st.motion;
      this.light = st.light !== undefined ? st.light : lightOf(c.entry ?? null, this.area);
      this.conditions = st.conditions ?? spellConditions(c.entry ?? null, P.conditionNames());
      this.range = st.range ?? (c.entry ? rangeOf(c.entry) ?? undefined : undefined);
      this.teleport = st.teleport ?? (c.entry ? teleportOf(c.entry) ?? 0 : 0);
      { const read = c.entry ? moreOf(c.entry, this.area) : {}; this.more = st.more ? { ...st.more, ...(read.steps ? { steps: read.steps } : {}) } : read; }
      this.atlas = { ...(st.atlas ?? {}) };
      this.look = st.look !== undefined ? ((AREA_LOOKS as readonly string[]).includes(st.look) ? st.look as AreaLook : '') : lookOf(c.entry ?? null) ?? '';
      this.saved = `Saved in ${st.path}`;
    } else if (c) {
      const entry = await P.noteEntry(c);
      const a = entry ? areaOf(entry) ?? targetOf(entry) ?? fallbackArea(entry) : null;
      // an ability: its saved preset (by name, for every statblock), with this statblock's own shape and size
      const preset = c.ability ? P.settings.abilities[P.abilityKey(c.name)] : undefined;
      let r = entry ? inUnitsNow(preset ?? P.settings.remember[entry.key]) : undefined;
      if (preset && r && a) {
        const same = r.shape === a.shape;
        r = { ...r, shape: a.shape, size: a.size, from: a.from };
        delete r.width; delete r.ring; delete r.round; delete r.target; delete r.self;
        if (!same) { delete r.angle; delete r.blocks; }
        if (a.target) r.target = a.target;
        if (a.self) r.self = true;
      }
      if (preset) this.saved = 'Saved ability';
      this.name = c.name;
      this.area = { shape: r?.shape ?? a?.shape ?? 'radius', size: r?.size ?? a?.size ?? squares(4), ...((r?.width ?? a?.width) ? { width: r?.width ?? a?.width } : {}), ...(r?.angle ? { angle: r.angle } : {}), from: r?.from ?? a?.from ?? 'point', lasting: r?.lasting ?? a?.lasting ?? false,
        ...((r?.ring ?? a?.ring) ? { ring: r?.ring ?? a?.ring } : {}), ...(r?.round ? { round: true } : {}), ...((r?.blocks ?? a?.blocks) ? { blocks: r?.blocks ?? a?.blocks } : {}), ...((r ? r.target : a?.target) ? { target: (r ? r.target : a?.target)! } : {}), ...((r ? r.self : a?.self) ? { self: true } : {}) };
      if (this.area.target === 'on' && !r) this.area.size = a?.size ?? 0;
      // D&D 5e: the JB2A free pack's best fit for the spell (its own, else by what it is); other systems: by its name
      const five = !r && P.systemOf().startsWith('builtin:dnd5e') ? fiveEFile(c.name, entry?.descFull ?? entry?.desc, entry?.school, this.area, P.files) : null;
      this.file = entry?.plain ? undefined : r ? r.file : (five ?? defaultFor(c.name, this.area.shape, P.files, hintsOf(entry?.descFull, c.name)))?.path;
      if (r?.colour) this.colour = r.colour;
      this.colour2 = r?.colour2; this.alpha = r?.alpha; this.motion = r?.motion;
      this.attach = false;
      this.light = r && r.light !== undefined ? r.light : lightOf(entry, this.area);
      this.conditions = r?.conditions ?? spellConditions(entry, P.conditionNames());
      this.range = entry ? rangeOf(entry) ?? undefined : undefined;
      this.teleport = r?.teleport ?? (entry ? teleportOf(entry) ?? 0 : 0);
      { const read = entry ? moreOf(entry, this.area) : {}; this.more = r?.more ? { ...r.more, ...(read.steps ? { steps: read.steps } : {}) } : read; }
      this.atlas = { ...(r?.atlas ?? {}) };
      this.look = r?.look !== undefined ? ((AREA_LOOKS as readonly string[]).includes(r.look) ? r.look as AreaLook : '') : lookOf(entry) ?? '';
    } else {
      this.name = 'Effect'; this.light = null; this.conditions = []; this.range = undefined; this.teleport = 0; this.look = ''; this.atlas = {}; this.more = {};
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

  /** The creature abilities' group starts folded (there can be hundreds), once. */
  private openedAbilities = false;

  private renderSide(side: HTMLElement): void {
    const P = this.plugin;
    side.createDiv({ cls: 'sfx-side-title', text: 'Cast a spell effect' });
    const sb = side.createDiv({ cls: 'sfx-search' });
    setIcon(sb.createSpan({ cls: 'sfx-search-icon' }), 'search');
    const q = sb.createEl('input', { type: 'search', placeholder: 'Search spells and abilities…', value: this.query });
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
      // creatures' abilities, apart from the spells: each named for itself, its creature beside it
      const abil = P.abilityChoices.filter((c) => words.every((w) => c.name.toLowerCase().includes(w) || (c.owner ?? '').toLowerCase().includes(w)));
      if (abil.length) {
        if (!words.length && !this.folded.has('Creature abilities') && !this.openedAbilities) { this.folded.add('Creature abilities'); this.openedAbilities = true; }
        const g = group('Creature abilities', abil.length);
        if (g) for (const c of abil.slice(0, 400)) {
          const a = c.entry ? areaOf(c.entry) : null;
          row(g, 'sfx-ability-row', 'swords', c.name, [a ? describe(a) : '', c.owner ?? ''].filter(Boolean).join(' · '), this.choice?.key === c.key, () => { void this.pick(c); });
        }
      }
      const own = list.createDiv({ cls: 'sfx-rows' });
      row(own, 'sfx-own', 'plus', 'An effect of your own', '', this.choice === null, () => { void this.pick(null); });
      if (!all.length && words.length && !abil.length) list.createDiv({ cls: 'sfx-empty', text: 'No spell or ability by that name.' });
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
    ht.createSpan({ cls: 'sfx-chip', text: this.choice?.ability ? (P.settings.abilities[P.abilityKey(this.name)] ? 'Saved ability' : 'Ability') : this.choice?.source === 'stored' ? 'Saved' : this.choice?.source === 'note' ? 'Spell note' : 'Your own effect' });

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
    this.morePicker(body);
    if (this.area.target !== 'bolt' && this.area.target !== 'on' && this.area.shape !== 'wall') this.atlasPicker(body);

    lookPicker(body.createDiv(), bottom, { app: this.app, plugin: P, name: this.name === 'Effect' ? '' : this.name, shape: this.area.shape, angle: this.area.angle ?? P.coneAngle(), size: this.area.size, file: this.file, colour: this.colour, colour2: this.colour2, alpha: this.alpha, fileQuery: this.fileQuery,
      set: (c, re) => {
        if ('file' in c) this.file = c.file;
        if (c.colour !== undefined) this.colour = c.colour;
        if ('colour2' in c) this.colour2 = c.colour2;
        if ('motion' in c) this.motion = c.motion;
        if ('alpha' in c) this.alpha = c.alpha;
        if (c.fileQuery !== undefined) this.fileQuery = c.fileQuery;
        if (re) this.render();
      } });

    // go
    const foot = bottom.createDiv({ cls: 'sfx-foot' });
    foot.createSpan({ cls: 'sfx-saved', text: this.saved });
    // saving: one kind of thing, a saved spell (kept in a note's effect-… properties)
    const st = this.choice?.stored;
    const look = () => ({ area: { ...this.area }, file: this.file, colour: this.colour, colour2: this.colour2, motion: this.motion, more: this.kept(), alpha: this.alpha, attach: this.attach, light: this.light, range: this.range, conditions: [...this.conditions], teleport: this.teleport, look: this.look, atlas: { ...this.atlas } });
    const keep = async (btn: { disabled: boolean }, c: { name: string; stored?: StoredSpell; entry?: SpellEntry; notePath?: string }, menu: boolean | undefined) => {
      btn.disabled = true;
      try {
        const path = await P.storeSpell(c, { ...look(), menu });
        this.choice = P.choices().find((x) => x.stored?.path === path) ?? this.choice; this.saved = `Saved in ${path}`;
        this.render();
      } catch (e) { new Notice('Combat+: could not save it (' + (e instanceof Error ? e.message : String(e)) + ')'); btn.disabled = false; }
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
    if (this.choice?.ability) {
      // an ability (not a spell): a preset by its name, kept with the add-on's settings, for every statblock that has it
      const k = P.abilityKey(this.name);
      if (P.settings.abilities[k]) {
        const del = acts.createEl('button', { cls: 'clickable-icon sfx-icon-btn sfx-danger', attr: { 'aria-label': 'Delete saved ability' } }); setIcon(del, 'trash-2');
        del.title = `Deletes what’s saved for ${this.name}; it’s read from each statblock’s text again`;
        del.onclick = () => new ConfirmModal(this.app, `Delete “${this.name}”?`, 'Its saved animation, colours and choices go. The ability stays in its statblocks, read from their text.', 'Delete', async () => {
          delete P.settings.abilities[k]; delete P.settings.remember[this.choice?.entry?.key ?? ''];
          await P.save(); const c = this.choice; await this.pick(c); this.saved = `Deleted “${this.name}”`; this.render();
        }).open();
      }
      const store = foot.createEl('button', { text: P.settings.abilities[k] ? 'Save changes' : 'Save' });
      store.title = `From now on, ${this.name} looks like this in every statblock that has it (its shape and size still come from each statblock). Saved as an ability, not a spell.`;
      store.onclick = async () => { P.settings.abilities[k] = this.memo(); await P.save(); this.saved = 'Saved ability'; this.render(); };
    }
    const sp = this.choice?.ability ? createEl('button') : foot.createEl('button', { text: 'Save as new…' });
    sp.title = `Keeps all of this as a spell of its own, under a new name (a note in ${P.storageFolder()}): a blue Fireball, a small Darkness…`;
    sp.onclick = () => new NameModal(this.app, this.choice ? `${this.name} (${describe(this.area)})` : this.name, async (name) => {
      await keep(sp, { name, ...(this.choice?.entry ? { entry: this.choice.entry } : {}) }, true);
    }).open();
    const target = st?.path ?? this.choice?.notePath;
    const store = this.choice?.ability ? createEl('button') : foot.createEl('button', { text: st ? 'Save changes' : 'Save' });
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

  /** What's set up now, to be shown (nothing fetched, nothing remembered). */
  view(): { name: string; area: Area; file: string | undefined; colour: string; look: string } {
    return { name: this.name, area: { ...this.area }, file: this.file, colour: this.colour, look: this.look };
  }

  /** The choices made here, to be remembered. */
  memo(): Remembered {
    return { unit: unitNow(), more: this.kept(), ...(this.motion ? { motion: this.motion } : {}), ...(this.file ? { file: this.file } : {}), colour: this.colour, ...(this.colour2 ? { colour2: this.colour2 } : {}), ...(this.alpha ? { alpha: this.alpha } : {}), shape: this.area.shape, size: this.area.size, ...(this.area.width ? { width: this.area.width } : {}), ...(this.area.angle ? { angle: this.area.angle } : {}), from: this.area.from, lasting: this.area.lasting, light: this.light, ...(this.area.ring ? { ring: this.area.ring } : {}), ...(this.area.round ? { round: true } : {}), ...(this.area.blocks ? { blocks: this.area.blocks } : {}), ...(this.area.target ? { target: this.area.target } : {}), ...(this.area.self ? { self: true } : {}), conditions: [...this.conditions], teleport: this.teleport, look: this.look, atlas: { ...this.atlas } };
  }

  /** What is set up now, ready to place (its animation fetched first; a spell's choices remembered). */
  async pending(): Promise<Pending> {
      const P = this.plugin;
      if (!(await P.ensureFile(this.file))) this.file = undefined;
      P.indexVault();
      const key = this.choice?.entry?.key ?? this.choice?.key ?? 'effect';
      if (this.choice && !this.choice.stored) P.remember(key, this.memo());
      const range = this.range;
      const spec = rollSpecOf(this.choice?.entry?.descFull ?? this.choice?.entry?.desc);
      if (spec) {
        const lv = Number(this.choice?.entry?.level);
        if (lv > 0 && lv <= 9) { spec.level = lv; if (spec.after) spec.after.level ??= lv; }
        if (spec.after) spec.after.spell = !this.choice?.ability;
        spec.spell = !this.choice?.ability;
        // a magic weapon's attack: "+2 Greatsword", "Frost Brand (Very Rare)", "magic weapon" in its text
        if (this.choice?.entry?.plain === 'attack' && /(?:^|\s)\+\d\b|\((?:uncommon|rare|very rare|legendary|artifact|artefact)\)|\bmagic(?:al)? (?:weapon|attack)/i.test(`${this.choice.name} ${this.choice.entry.descFull ?? ''}`)) spec.magic = true;
        // (a lasting one's conditions follow its area instead)
        if (this.conditions.length && spec.kind !== 'damage' && !this.area.lasting) spec.conds = [...this.conditions];
      }
      return { name: this.name, key, ...(this.choice?.entry?.plain ? { plain: true } : {}), ...(spec ? { roll: spec } : {}), ...(hasMore(this.more) ? { more: { ...this.more } } : {}), ...(this.motion ? { motion: this.motion } : {}), ...(range ? { range } : {}), ...(this.conditions.length && this.area.target !== 'bolt' ? { conditions: [...this.conditions] } : {}), area: { ...this.area }, ...(this.file ? { file: this.file } : {}), colour: this.colour, ...(this.colour2 ? { colour2: this.colour2 } : {}), ...(this.alpha ? { alpha: this.alpha } : {}), ...(this.attach ? { attach: true } : {}), ...(this.light ? { light: { ...this.light } } : {}), ...(this.teleport > 0 ? { teleport: this.teleport } : {}), ...(this.look ? { look: this.look } : {}), ...(Object.keys(this.atlas).length ? { atlas: { ...this.atlas } } : {}) };
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
    if (this.plugin.settings.throughWalls) new Setting(box).setName('Stops at walls').setDesc('Off for every area: “Areas go through walls” is on in the add-on’s settings.').addToggle((tg) => tg.setValue(false).setDisabled(true));
    else new Setting(box).setName('Stops at walls').addToggle((tg) => tg.setValue(!this.atlas.throughWalls).onChange((v) => set('throughWalls', !v || undefined)));
    new Setting(box).setName('Players see it').addToggle((tg) => tg.setValue(!this.atlas.hidden).onChange((v) => set('hidden', !v || undefined)));
    if (toolShapeOf(this.area)) new Setting(box).setName('Place with Atlas’s Measure tool').setDesc('Draw it with Atlas’s own tool (its snapping, its cone) instead of aiming here.')
      .addToggle((tg) => tg.setValue(!!this.atlas.tool).onChange((v) => set('tool', v || undefined)));
  }

  /** What else it does, as kept with a saved spell (its level steps are read from its text each time). */
  private kept(): More { const { steps, ...rest } = this.more; void steps; return rest; }

  /**
   * What else it does on the map, each read from its text and changeable here: pushes and pulls, how many it makes,
   * a bolt that leaps on, a thing that can be moved, difficult terrain. Only those that fit its kind are shown.
   */
  private morePicker(body: HTMLElement): void {
    const a = this.area, m = this.more;
    const bolt = a.target === 'bolt', aimed = !!a.target, wall = a.shape === 'wall';
    if (wall || this.teleport > 0) return;
    const box = body.createDiv({ cls: 'sfx-more' });
    box.createDiv({ cls: 'sfx-label', text: 'Also' });
    const num = (row: Setting, value: number, set: (n: number) => void, min = 0) => row.addText((t) => { t.inputEl.type = 'number'; t.inputEl.addClass('sfx-num'); t.setValue(String(value)); t.onChange((v) => { const n = Number(v); if (Number.isFinite(n) && n >= min) set(n); }); });
    // pushes and pulls
    const pr = new Setting(box).setName('Pushes or pulls')
      .setDesc(m.push ? `${m.push > 0 ? 'Pushes' : 'Pulls'} ${aimed ? 'its target' : 'those it catches'} ${Math.abs(m.push)} ${unitLabel()} ${m.push > 0 ? 'away from' : 'towards'} ${a.from === 'point' && !aimed ? 'its middle' : 'the caster'} when it’s cast. The tokens move (Ctrl+Z puts each back).` : 'Off: no one is moved.');
    pr.addDropdown((d) => d.addOption('', 'No').addOption('push', 'Pushes').addOption('pull', 'Pulls').setValue(!m.push ? '' : m.push > 0 ? 'push' : 'pull').onChange((v) => { const d0 = Math.abs(m.push ?? 0) || 2 * square(); if (!v) delete m.push; else m.push = v === 'pull' ? -d0 : d0; this.render(); }));
    if (m.push) num(pr, Math.abs(m.push), (n) => { if (n > 0) m.push = (m.push ?? 1) < 0 ? -n : n; }, 0);
    // how many
    if (!a.self && a.from !== 'caster' || aimed) {
      const steps = m.steps?.length ? ` More as the caster’s level goes up (${m.steps.map(([lv, c]) => `${c} at level ${lv}`).join(', ')}), when cast from a statblock that gives its level.` : '';
      const cr = new Setting(box).setName('How many').setDesc(((m.count ?? 1) > 1 || steps ? (aimed ? `${bolt ? 'Bolts' : 'Targets'} to click, one after another; it stops by itself after the last.` : 'Areas to place, one after another.') : 'One.') + steps);
      num(cr, m.count ?? 1, (n) => { const k = Math.round(n); if (k > 1) m.count = Math.min(12, k); else delete m.count; }, 1);
    }
    // a bolt that leaps on
    if (bolt) {
      const ch = new Setting(box).setName('Leaps on').setDesc(m.chain ? `From its target on to the ${m.chain} nearest other creature${m.chain === 1 ? '' : 's'} within ${m.chainRange ?? 30} ${unitLabel()} of it.` : 'Off: it stops at its target.');
      ch.addToggle((t) => t.setValue(!!m.chain).onChange((v) => { if (v) { m.chain = m.chain || 3; m.chainRange = m.chainRange || 6 * square(); } else { delete m.chain; delete m.chainRange; } this.render(); }));
      if (m.chain) { num(ch, m.chain, (n) => { if (n >= 1) m.chain = Math.min(12, Math.round(n)); }, 1); num(ch, m.chainRange ?? 30, (n) => { if (n > 0) m.chainRange = n; }); }
    }
    // a thing that can be moved
    if (!bolt && !a.self && a.lasting && (a.from === 'point' || aimed) && !['cone', 'line', 'cube'].includes(a.shape)) {
      new Setting(box).setName('A thing that can be moved').setDesc(m.summon ? 'It’s put on the map as a token of its own, named after the spell, with its animation on it: drag it like any token (players can, online). Ending the spell takes it away.' : 'Off: it’s an area on the map.')
        .addToggle((t) => t.setValue(!!m.summon).onChange((v) => { if (v) m.summon = true; else delete m.summon; this.render(); }));
    }
    // difficult terrain
    if (!aimed && a.lasting) {
      new Setting(box).setName('Difficult terrain').setDesc(m.terrain ? 'While it lasts, its area is difficult terrain in Atlas (a map feature named after it, which Atlas’s movement ruler counts; the GM’s alone).' : 'Off.')
        .addToggle((t) => t.setValue(!!m.terrain).onChange((v) => { if (v) m.terrain = true; else delete m.terrain; this.render(); }));
    }
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

/** A pick from a list of names (the SRD's creatures). */
class SrdPicker extends FuzzySuggestModal<string> {
  constructor(app: App, private readonly items: string[], private readonly chosen: (name: string) => void) { super(app); }
  getItems(): string[] { return this.items; }
  getItemText(n: string): string { return n; }
  onChooseItem(n: string): void { this.chosen(n); }
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
    el.createEl('p', { text: 'Combat+ for Atlas VTT: spell effects and areas on your Atlas maps (your screen and the player window), and D&D 5e rolls for spells, abilities and attacks. Cast with ✨ in Atlas’s toolbar, or from a statblock.' });
    for (const sec of this.sections()) {
      if (sec.heading) new Setting(el).setName(sec.heading).setHeading();
      for (const r of sec.rows) { const st = new Setting(el).setName(r.name); if (r.desc !== undefined) st.setDesc(r.desc); r.render(st); }
    }
  }

  /** The settings, by heading: each row's name, description and controls. */
  private sections(): { heading?: string; rows: { name: string; desc?: string | DocumentFragment; render: (st: Setting) => void }[] }[] {
    const p = this.plugin, s = p.settings;
    type Row = { name: string; desc?: string | DocumentFragment; render: (st: Setting) => void };
    const main: Row[] = [], srd: Row[] = [], spells: Row[] = [], anims: Row[] = [], map: Row[] = [], game: Row[] = [], players: Row[] = [], rolls: Row[] = [];
    // ── spells ──
    spells.push({
      name: 'Spell bases',
      desc: basesReady() ? `Every note these Bases show is a spell: its area, light and walls are read from its text. Notes of creatures and magic items are left out. In the cast window now: ${p.noteChoices.length} spell notes.` : 'Bases needs Obsidian 1.10 or later with the Bases core plugin on. Until then, spell notes are found by their properties (below).',
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
      name: 'Folder for your saved effects',
      desc: `Effects you save that aren’t spell notes (“Save as new…”) are notes in this folder. You have ${p.stored.length}.`,
      render: (st) => { st.addText((t) => {
        t.setPlaceholder('Spell Storage').setValue(s.storage).onChange((v) => { void (async () => { s.storage = v.trim() || 'Spell Storage'; await p.save(); })(); });
        new FolderSuggest(this.app, t.inputEl, async (v) => { s.storage = v.trim() || 'Spell Storage'; await p.save(); });
      }); },
    });
    spells.push({
      name: 'Also find spell notes anywhere',
      desc: 'Also count notes outside your Bases as spells when their properties have a school and a level, or they have a “spell” tag.',
      render: (st) => { st.addToggle((t) => t.setValue(s.noteSpells).onChange((v) => { void (async () => { s.noteSpells = v; await p.save(); p.indexSpells(); this.redraw(); })(); })); },
    });

    // ── the SRD ──
    const SRD_ATTR = 'Spells and creatures from the System Reference Documents 5.2.1 and 5.1 by Wizards of the Coast LLC, licensed under CC-BY-4.0 (https://creativecommons.org/licenses/by/4.0/legalcode).';
    srd.push({
      name: 'Built-in SRD spells',
      desc: `Every SRD spell can be cast, from the cast window and from statblocks, with no spell note of its own. A note or saved spell of yours with the same name is used instead. ${SRD_ATTR}`,
      render: (st) => { st.addToggle((t) => t.setValue(s.srdSpells).onChange((v) => { void (async () => { s.srdSpells = v; await p.save(); await p.readSrd(); this.redraw(); })(); })); },
    });
    srd.push({
      name: 'SRD edition',
      desc: 'Which rules the built-in spells and creatures follow.',
      render: (st) => { st.addDropdown((d) => d.addOption('2024', 'D&D 2024 (SRD 5.2.1)').addOption('2014', 'D&D 2014 (SRD 5.1)').setValue(s.srdEdition).onChange((v) => { void (async () => { s.srdEdition = v === '2014' ? '2014' : '2024'; await p.save(); await p.readSrd(); })(); })); },
    });
    srd.push({
      name: 'Add SRD notes to your vault',
      desc: 'Writes the SRD’s creatures as Atlas statblock notes (link a token to one), or its spells as spell notes you can edit, into the folder below. Notes already there are left alone.',
      render: (st) => {
        st.addButton((b) => b.setButtonText('Creatures…').onClick(() => { void p.pickSrdCreatures(); }));
        st.addButton((b) => b.setButtonText('All spells').onClick(() => { void p.writeSrd('spells').then((n) => new Notice(`Combat+: ${n} SRD spell notes added.`)); }));
      },
    });
    srd.push({
      name: 'SRD folder',
      desc: 'Where SRD notes are written.',
      render: (st) => { st.addText((t) => {
        t.setPlaceholder('Combat+ SRD').setValue(s.srdFolder).onChange((v) => { void (async () => { s.srdFolder = v.trim() || 'Combat+ SRD'; await p.save(); })(); });
        new FolderSuggest(this.app, t.inputEl, async (v) => { s.srdFolder = v.trim() || 'Combat+ SRD'; await p.save(); });
      }); },
    });

    // ── animations ──
    const remote = p.files.filter((f) => f.remote).length;
    anims.push({
      name: 'Offer every JB2A animation',
      desc: `Show all of JB2A’s free animations in the cast window${remote ? ` (${remote} not downloaded yet: each is fetched the first time you use it)` : ''}.`,
      render: (st) => { st.addToggle((t) => t.setValue(s.jb2aOffer).onChange((v) => { void (async () => { s.jb2aOffer = v; await p.save(); p.indexVault(); this.redraw(); })(); })); },
    });
    anims.push({
      name: 'JB2A folder',
      desc: 'Where JB2A animations are kept in your vault.',
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
      desc: `Other folders with animations (.webm, .gif, .png…), separated by commas. Empty: any folder with “JB2A” in its name, or called “Spell Effects”. Found: ${p.files.length - remote} files.`,
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
    game.push({ name: 'Snap to grid', desc: 'Areas land on the nearest grid corner, as the rules place them. Hold Alt to do the opposite once.', render: (st) => { st.addToggle((t) => t.setValue(s.snap).onChange((v) => { void (async () => { s.snap = v; await p.save(); })(); })); } });
    players.push(toggle('Show players the area while you aim', 'The player window shows where a spell will land before you cast it. Also in the ✨ button’s menu.', () => s.showAim, (v) => { s.showAim = v; }));
    map.push(toggle('Spells as Atlas areas', 'Each spell is also one of Atlas’s own areas: lit, saved with the scene, stopped by walls and seen by online players. Move or delete it in Atlas and the spell follows.', () => s.atlasAreas, (v) => { s.atlasAreas = v; }));
    map.push({ name: 'Spells over tokens', desc: 'Draw spells under the tokens, or on top of them. Tokens can still be moved, and their bars and names stay on top either way.', render: (st) => { st.addDropdown((d) => d.addOption('none', 'Under the tokens').addOption('instant', 'Instant spells and bolts over them').addOption('all', 'All over them').setValue(s.above).onChange((v) => { void (async () => { s.above = v === 'all' || v === 'instant' ? v : 'none'; await p.save(); p.wake(); })(); })); } });
    main.push(toggle('Spell effects', 'Play animations for spells and abilities. Off: casting still places the area so you can see who it catches, and rolling, conditions and pushes still work.', () => s.animations, (v) => { s.animations = v; }));
    main.push({ name: 'Rolling (D&D 5e and 2024 only)', desc: `For D&D 5e (2014) and D&D 2024 only: other game systems aren’t supported yet.${p.systemOf() && !p.systemOf().startsWith('builtin:dnd5e') ? ' Your open map isn’t D&D 5e, so rolls there may be wrong.' : ''} Rolls spells, abilities and weapon attacks against the creatures they hit, using their statblocks, with the results on a card. Apply damage takes it off their HP (Ctrl+Z undoes it). Turns on Attack buttons in statblocks. NPCs only: player characters’ own attacks, spells and saves are left to their players (their saves get Saved and Failed buttons on the card).`, render: (st) => { st.addDropdown((d) => d.addOption('off', 'Off').addOption('npcs', 'NPCs only (players roll their own)').addOption('all', 'Everyone').setValue(!s.rolling ? 'off' : s.rollWho).onChange((v) => { void (async () => { s.rolling = v !== 'off'; if (v === 'npcs' || v === 'all') s.rollWho = v; await p.save(); p.wake(); p.rescanStatblocks(); this.redraw(); })(); })); } });
    if (s.rolling) {
    rolls.push({ name: 'Temporary HP resource', desc: 'Temporary HP is kept in the Atlas resource with this name. Add a resource called this in Atlas to see it as a bar on tokens.', render: (st) => { st.addText((t) => t.setPlaceholder('Temp HP').setValue(s.tempResource).onChange((v) => { void (async () => { s.tempResource = v.trim() || 'Temp HP'; await p.save(); })(); })); } });
    rolls.push(toggle('Post rolls to the table log', 'Also send each card’s rolls to Atlas’s table log when an online table is running.', () => s.rollPost, (v) => { s.rollPost = v; }));
    }
    map.push(toggle('Areas go through walls', 'Every area ignores walls and catches the creatures behind them. Off: areas stop at walls, unless you turn that off for one spell in the cast window.', () => s.throughWalls, (v) => { s.throughWalls = v; }));
    map.push(toggle('Mark creatures in spells', 'Creatures inside a lasting spell get an “In a spell” condition, plus any the spell gives (Silence: Deafened). Creatures hit by an instant spell are listed on a card beside the map.', () => s.markCreatures, (v) => { s.markCreatures = v; }));
    game.push(toggle('Count rounds on lasting spells', 'In a fight, each lasting spell shows how long it has been up (“Round 3”), on your screen only. Spells never end on their own.', () => s.showRounds, (v) => { s.showRounds = v; }));
    // a round's length: the game system's, as you set it (game systems differ; some have none)
    const sid = p.systemOf();
    const own = ROUND_SECS[sid];
    game.push({
      name: 'Round length',
      desc: sid
        ? `For the round counter (“Round 3 · 12 s”): “6 seconds”, “1 minute”… Empty: rounds only.${own ? ` The game’s own: ${timeOf(own)}.` : ''}`
        : 'Open an Atlas map first: it’s set for each game system.',
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
    players.push({
      name: 'Preview style',
      desc: 'What players see while you aim: an outline, a filled area, or the spell’s animation, see-through.',
      render: (st) => { st.addDropdown((d) => d.addOptions({ outline: 'Outline', filled: 'Filled', animation: 'Animation' }).setValue(s.aimLook).onChange((v) => { void (async () => { s.aimLook = v === 'filled' || v === 'animation' ? v : 'outline'; await p.save(); p.wake(); })(); })); },
    });
    const sys = p.atlasSystem;
    game.unshift({
      name: 'Your game system',
      desc: sys
        ? `From Atlas: ${sys.perSquare} ${sys.unit} to a square, ${Math.round(sys.cone * 100) / 100}° cones${sys.bands.length ? `, range bands ${sys.bands.join(', ')}` : ''}. Change it in Atlas, in the collection’s settings.`
        : 'Read from Atlas once a map is open.',
      render: (st) => { void p.systemName().then((n) => { if (n) st.setName(`Your game system: ${n}`); }); },
    });
    game.splice(1, 0, {
      name: 'Cone angle',
      desc: 'Empty: your game system’s (53° in D&D 5e). Each spell can still have its own in the cast window.',
      render: (st) => { st.addText((t) => {
        t.setPlaceholder(`${Math.round(p.coneAngle(true) * 100) / 100} (from Atlas)`);
        t.setValue(s.coneAngle > 0 ? String(Math.round(s.coneAngle * 100) / 100) : '');
        t.inputEl.type = 'number'; t.inputEl.min = '1'; t.inputEl.max = '170';
        t.onChange((v) => { void (async () => { const n = Number(v); if (!v.trim()) s.coneAngle = 0; else if (n >= 1 && n <= 170) s.coneAngle = n; else return; await p.save(); })(); });
      }); },
    });
    return ([{ rows: main }, { heading: 'Spells', rows: spells }, { heading: 'On the map', rows: map }, { heading: 'Players', rows: players }, { heading: 'Your game', rows: game }, { heading: 'Rolling', rows: rolls }, { heading: 'Built-in SRD (D&D 5e)', rows: srd }, { heading: 'Animation files', rows: anims }] as { heading?: string; rows: Row[] }[]).filter((x) => x.rows.length);
  }
}
