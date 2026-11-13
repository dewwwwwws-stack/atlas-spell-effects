// What the add-on reads and writes of Atlas VTT: the parts of its map store, its lights, walls and tokens, and its
// canvas, as Atlas has them. Atlas gives add-ons no API, so all of it is optional: whatever isn't there is left be.

import type { WorkspaceLeaf, View } from 'obsidian';
import type { Point } from './geometry';

/** A light's look in Atlas (its editor sets more than these; they are kept as they are). */
export interface AtlasEmission {
  bright?: number; dim?: number; color?: string; intensity?: number; animation?: string; angle?: number;
  sourceRadius?: number; darkness?: boolean; kind?: string;
  [field: string]: unknown;
}
export interface AtlasLight { x: number; y: number; rotation?: number; area?: Point[]; emission?: AtlasEmission; [field: string]: unknown }
export interface AtlasLightInput { x: number; y: number; rotation?: number; area?: Point[]; emission: AtlasEmission }
export interface AtlasWall { p1?: Point; p2?: Point; type?: string; blocks?: string; chainId?: string; [field: string]: unknown }
export interface AtlasWallInput { type: 'solid'; p1: Point; p2: Point; blocks?: 'sight' | 'movement'; chainId?: string }
export interface AtlasToken {
  x: number; y: number; size?: number; rotation?: number; name?: string; label?: string; offMap?: boolean;
  isHidden?: boolean; side?: string; vision?: { enabled?: boolean }; statblockName?: string;
  /** The statblock note it is linked to. */
  statblockPath?: string;
  /** Its conditions (ids of its collection's conditions). */
  conditions?: string[];
  [field: string]: unknown;
}

/** Atlas's map store's state: what is on the map, and its actions. */
export interface AtlasState {
  mapPath?: string;
  grid?: { size?: number; offsetX?: number; offsetY?: number };
  objects?: { tokens?: Record<string, AtlasToken>; lights?: Record<string, AtlasLight>; walls?: Record<string, AtlasWall> };
  selectedIds?: string[];
  activeTool?: string;
  selectionMode?: string;
  lightPopover?: string | null;
  addLight: (light: AtlasLightInput) => string | undefined;
  updateLight: (id: string, changes: Partial<AtlasLightInput> & Record<string, unknown>) => void;
  deleteLight: (id: string) => void;
  addWall: (wall: AtlasWallInput) => string | undefined;
  deleteWall: (id: string) => void;
  deleteWalls: (ids: string[]) => void;
  openLightPopover?: (id: string) => void;
  /** Moves a token (its middle) to a spot on the map. */
  moveToken?: (id: string, x: number, y: number) => void;
  /** Adds or takes off a condition on these tokens (one store write). */
  setTokensCondition?: (tokenIds: string[], conditionId: string, active: boolean) => void;
  /** Atlas's initiative tracker: whether a fight is on, and its round. */
  initiative?: { isActive?: boolean; round?: number };
  currentCollectionId?: string;
  isPlayerView?: boolean;
}

/** Atlas's collections (its asset service): a collection's settings, its conditions among them. */
export interface AtlasAssets {
  getCollectionSettings(collectionId: string): { conditions?: { id: string; name: string; color?: string; icon?: string }[]; [k: string]: unknown };
  updateCollectionSettings(collectionId: string, settings: Record<string, unknown>): Promise<void>;
}

/** Atlas's undo history (a store of its own). */
export interface AtlasHistoryState { pastStates?: unknown[]; futureStates?: unknown[]; undo?: () => void; redo?: () => void; untracked?: (fn: () => void) => void }
export interface AtlasHistory {
  getState(): AtlasHistoryState;
  subscribe?(listener: (state: AtlasHistoryState) => void): () => void;
  untracked?<T>(fn: () => T): T;
}

export interface AtlasStore {
  getState(): AtlasState;
  /** Atlas's store edits a draft: what the function changes is the change. */
  setState?(change: (draft: AtlasState) => void): void;
  subscribe?(listener: () => void): () => void;
  temporal?: AtlasHistory;
}

/** A node of Atlas's canvas (pixi): only what the add-on looks at. */
export interface CanvasNode {
  label?: string;
  children?: CanvasNode[];
  parent?: CanvasNode | null;
  position?: { x: number; y: number };
  visible?: boolean;
  destroyed?: boolean;
  /** Hidden by this add-on (one of its lights' markers). */
  sfxHidden?: boolean;
}

/** Atlas's map viewport (pixi-viewport). */
export interface AtlasViewport extends CanvasNode {
  x?: number; y?: number;
  scale?: { x: number; y: number };
  toWorld?(x: number, y: number): Point;
  toScreen?(x: number, y: number): Point;
  on?(event: string, fn: () => void): void;
  off?(event: string, fn: () => void): void;
}

/** Atlas's map view (an Obsidian view): its store and its renderer, found through its services. */
export interface AtlasView extends View {
  atlasStore?: AtlasStore;
  serviceManager?: unknown;
}

/** The players' view on a map: what part of it they see (Atlas's renderer's `playersView`). */
export interface PlayersView { view?: { left: number; top: number; right: number; bottom: number }; rotation?: number }

/** The map's measurement, as Atlas's drag ruler reads it. */
export interface Measurement {
  unitDistance?: number; unitType?: string;
  /** Game units one rules square spans (the collection's, whatever the scene sets). */
  ruleDistance?: number;
  /** The game system's range bands (Daggerheart, Shadowdark), and its cone's angle. */
  rangeBands?: readonly { name: string; maxSquares: number }[];
  coneAngle?: number;
}

/** What the add-on reads of one Atlas map tab. */
export interface Tab { leaf: WorkspaceLeaf; view: AtlasView; store: AtlasStore; renderer: unknown; viewport: AtlasViewport; canvas: HTMLCanvasElement }

/** Calls `target[method](...args)` if there is such a method; whatever it gives (undefined if none, or it threw). */
export function call<T = unknown>(target: unknown, method: string, ...args: unknown[]): T | undefined {
  if (!target || (typeof target !== 'object' && typeof target !== 'function')) return undefined;
  const f = (target as Record<string, unknown>)[method];
  if (typeof f !== 'function') return undefined;
  try { return (f as (...a: unknown[]) => T).apply(target, args); } catch { return undefined; }
}

/** A field of something unknown, if it is an object. */
export function field(target: unknown, name: string): unknown {
  return target && (typeof target === 'object' || typeof target === 'function') ? (target as Record<string, unknown>)[name] : undefined;
}
