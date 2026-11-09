// JB2A's free animations (Jules & Ben's Animated Assets, CC BY-NC-SA 4.0): every one of them is listed in the
// add-on, and each is fetched from JB2A's own GitHub the first time it is used, into a folder in your vault.
// "Download everything" fetches the whole pack at once. The list is of one fixed version of the pack, so a
// file's name never changes under you.
import { requestUrl, TFile, type App } from 'obsidian';
import LIST from './jb2a-list.json';
import { indexFile } from './library';

const REPO = 'Jules-Bens-Aa/JB2A_DnD5e';
export const JB2A_SHA: string = (LIST as { sha: string }).sha;
const raw = (rel: string) => `https://raw.githubusercontent.com/${REPO}/${JB2A_SHA}/${rel.split('/').map(encodeURIComponent).join('/')}`;

/** One of JB2A's animations: its path in the pack, and its still preview (an address), if it has one. */
export interface Jb2aFile { rel: string; thumb: string | null }

let all: Jb2aFile[] | null = null;
/** Every animation in the free pack. */
export function jb2aFiles(): Jb2aFile[] {
  if (all) return all;
  const out: Jb2aFile[] = [];
  for (const [dir, names] of Object.entries((LIST as { dirs: Record<string, string[]> }).dirs)) {
    for (const n of names) {
      const [file, flag] = n.split('|');
      const rel = `${dir}/${file}`;
      const stem = file.replace(/\.[^.]+$/, '').replace(/_\d+x\d+$/, '');
      if (indexFile(rel)) out.push({ rel, thumb: flag === 't' ? raw(`${dir}/${stem}_Thumb.webp`) : null });   // only what the add-on can play
    }
  }
  return (all = out);
}

export const CREDIT = `# JB2A animations

These animations are from **JB2A — Jules & Ben's Animated Assets** (free pack), by Jules, Ben, gazkhan and wassily.

- Source: https://github.com/${REPO}
- Licence: Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0),
  https://creativecommons.org/licenses/by-nc-sa/4.0/
- Support them and get the full pack: https://www.patreon.com/jb2a

Downloaded by Atlas Spell Effects, unchanged.
`;

async function folderFor(app: App, path: string): Promise<void> {
  const parts = path.split('/').slice(0, -1);
  for (let i = 1; i <= parts.length; i++) {
    const p = parts.slice(0, i).join('/');
    if (!app.vault.getAbstractFileByPath(p)) { try { await app.vault.createFolder(p); } catch { /* made meanwhile */ } }
  }
}

/** The credit and licence beside the downloaded files. */
export async function writeCredit(app: App, root: string): Promise<void> {
  const p = `${root}/JB2A credit and licence.md`;
  if (app.vault.getAbstractFileByPath(p)) return;
  await folderFor(app, p);
  try { await app.vault.create(p, CREDIT); } catch { /* there already */ }
}

/** Fetches one animation into `root` (the vault folder for JB2A), unless it is there already. Its vault path. */
export async function fetchJb2a(app: App, root: string, rel: string): Promise<string> {
  const path = `${root}/${rel}`;
  if (app.vault.getAbstractFileByPath(path) instanceof TFile) return path;
  const res = await requestUrl({ url: raw(rel), method: 'GET', throw: false });
  if (res.status !== 200 || !res.arrayBuffer || res.arrayBuffer.byteLength < 64) throw new Error(`JB2A said ${res.status} for ${rel.split('/').pop()}`);
  await folderFor(app, path);
  if (!app.vault.getAbstractFileByPath(path)) await app.vault.createBinary(path, res.arrayBuffer);
  await writeCredit(app, root);
  return path;
}

/** Fetches every animation not yet in the vault, a few at a time. `progress(done, total, failed)`; `stopped()` ends it early. */
export async function fetchAll(app: App, root: string, progress: (done: number, total: number, failed: number) => void, stopped: () => boolean): Promise<{ done: number; failed: number; total: number }> {
  const todo = jb2aFiles().filter((f) => !(app.vault.getAbstractFileByPath(`${root}/${f.rel}`) instanceof TFile));
  let next = 0, done = 0, failed = 0;
  const total = todo.length;
  const worker = async () => {
    while (!stopped()) {
      const f = todo[next++]; if (!f) return;
      try { await fetchJb2a(app, root, f.rel); done++; } catch { failed++; }
      progress(done, total, failed);
    }
  };
  await writeCredit(app, root);
  await Promise.all([worker(), worker(), worker(), worker()]);
  return { done, failed, total };
}
