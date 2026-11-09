// Spells from Obsidian Bases: you pick .base files, and every note a Base shows (in any of its views, or by its
// own filters) is a spell. Nothing in Obsidian runs a Base's query for a plugin directly, so, as Atlas does for
// its loot bases, each view is rendered off screen with this add-on's own view type, and Obsidian hands that view
// the notes it finds, now and again whenever the vault changes.
import { BasesView, Component, MarkdownRenderer, requireApiVersion, stringifyYaml, parseYaml, TFile, type App, type Plugin, type QueryController } from 'obsidian';

const VIEW = 'atlas-spell-effects';
const HOST = 'data-sfx-base-query';
const routes = new Map<string, { found: (paths: string[]) => void; attached: () => void }>();
let owner: Plugin | null = null;
let ready = false;

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Registers the add-on's (hidden-use) Bases view; true once Bases can run it (Obsidian 1.10+, Bases on). */
export function basesReady(plugin?: Plugin): boolean {
  if (plugin) owner = plugin;
  if (ready || !owner || typeof (owner as unknown as Record<string, unknown>)['registerBasesView'] !== 'function') return ready;
  if (!requireApiVersion('1.10.0')) return false;
  class SpellQueryView extends BasesView {
    type = VIEW;
    private route: { found: (paths: string[]) => void; attached: () => void } | undefined;
    constructor(controller: QueryController, el: HTMLElement) {
      super(controller);
      this.route = routes.get(el.closest(`[${HOST}]`)?.getAttribute(HOST) ?? '');
      this.route?.attached();
      if (!this.route) el.createDiv({ text: 'Atlas Spell Effects reads this view’s notes as spells. Pick another view type to see them.' });
    }
    onDataUpdated(): void { this.route?.found(this.data.data.map((e) => e.file.path)); }
  }
  ready = !!owner.registerBasesView?.(VIEW, { name: 'Spell effects (read by the add-on)', icon: 'sparkles', factory: (c, el) => new SpellQueryView(c, el) });
  return ready;
}

/** The queries to run for a Base: each of its views, and its own filters with nothing more. */
export function queriesOf(base: unknown): Record<string, unknown>[] {
  if (!isRecord(base)) return [];
  const { filters, formulas, properties } = base;
  const common = { ...(filters !== undefined ? { filters } : {}), ...(isRecord(formulas) ? { formulas } : {}), ...(isRecord(properties) ? { properties } : {}) };
  const views = Array.isArray(base['views']) ? base['views'].filter(isRecord) : [];
  const out = views.map((v) => ({ ...common, views: [{ ...v, name: String(v['name'] ?? 'view'), type: VIEW }] }));
  const hasFilter = (f: unknown): boolean => typeof f === 'string' ? f.trim() !== '' : isRecord(f) && Object.values(f).some((g) => Array.isArray(g) && g.some(hasFilter));
  if (hasFilter(filters)) out.push({ ...common, views: [{ name: 'all', type: VIEW }] });
  return out;
}

/** One Base, read live: `changed(paths)` with every note it shows, now and after each change. */
export class BaseReader {
  private parts: { id: string; host: HTMLElement; c: Component }[] = [];
  private found = new Map<string, string[]>();
  constructor(private readonly app: App, readonly path: string, private readonly changed: (paths: string[]) => void) {}

  async start(): Promise<'ok' | 'missing' | 'no-bases'> {
    this.stop();
    const f = this.app.vault.getAbstractFileByPath(this.path);
    if (!(f instanceof TFile)) return 'missing';
    if (!basesReady()) return 'no-bases';
    let base: unknown;
    try { base = parseYaml(await this.app.vault.cachedRead(f)); } catch { return 'missing'; }
    for (const q of queriesOf(base)) {
      const id = Math.random().toString(36).slice(2);
      routes.set(id, { found: (paths) => { this.found.set(id, paths); this.report(); }, attached: () => undefined });
      const host = document.body.createDiv({ cls: 'sfx-base-query' });
      host.setAttribute(HOST, id); host.setAttribute('aria-hidden', 'true');
      const c = new Component(); c.load();
      this.parts.push({ id, host, c });
      await MarkdownRenderer.render(this.app, '```base\n' + stringifyYaml(q) + '```', host, this.path, c);
    }
    return 'ok';
  }

  private report(): void { this.changed([...new Set([...this.found.values()].flat())]); }

  stop(): void {
    for (const p of this.parts) { routes.delete(p.id); p.c.unload(); p.host.remove(); }
    this.parts = []; this.found.clear();
  }
}
