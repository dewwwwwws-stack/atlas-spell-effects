// Suggestions as you type in the settings: the vault's folders, or its .base files (Obsidian's own pop-up list).
import { AbstractInputSuggest, TFile, TFolder, type App } from 'obsidian';

/** Paths in the vault that match what is typed: every word of it, anywhere in the path; the closest first. */
function matching(paths: string[], typed: string): string[] {
  const words = typed.toLowerCase().split(/[\s/]+/).filter(Boolean);
  return paths
    .filter((p) => words.every((w) => p.toLowerCase().includes(w)))
    .sort((a, b) => (a.toLowerCase().startsWith(typed.toLowerCase()) ? 0 : 1) - (b.toLowerCase().startsWith(typed.toLowerCase()) ? 0 : 1) || a.length - b.length || a.localeCompare(b))
    .slice(0, 40);
}

/**
 * Folders, for a field that holds one folder, or several separated by commas (`list`): then the suggestion
 * replaces only the one being typed.
 */
export class FolderSuggest extends AbstractInputSuggest<string> {
  constructor(private readonly vaultApp: App, private readonly input: HTMLInputElement, private readonly picked: (value: string) => void | Promise<void>, private readonly list = false) { super(vaultApp, input); }
  private part(): string { const v = this.input.value; return this.list ? v.slice(v.lastIndexOf(',') + 1).trim() : v.trim(); }
  getSuggestions(): string[] {
    const folders = this.vaultApp.vault.getAllLoadedFiles().filter((f) => f instanceof TFolder && f.path !== '/' && f.path !== '').map((f) => f.path);
    return matching(folders, this.part());
  }
  renderSuggestion(path: string, el: HTMLElement): void { el.setText(path); }
  selectSuggestion(path: string): void {
    const v = this.input.value;
    const value = this.list && v.includes(',') ? v.slice(0, v.lastIndexOf(',') + 1) + ' ' + path : path;
    this.setValue(value); this.input.dispatchEvent(new Event('input')); void this.picked(value); this.close();
  }
}

/** The vault's .base files. */
export class BaseSuggest extends AbstractInputSuggest<string> {
  constructor(private readonly vaultApp: App, input: HTMLInputElement, private readonly picked: (path: string) => void | Promise<void>) { super(vaultApp, input); }
  getSuggestions(typed: string): string[] {
    const bases = this.vaultApp.vault.getAllLoadedFiles().filter((f) => f instanceof TFile && f.extension === 'base').map((f) => f.path);
    return matching(bases, typed);
  }
  renderSuggestion(path: string, el: HTMLElement): void { el.setText(path); }
  selectSuggestion(path: string): void { this.setValue(''); void this.picked(path); this.close(); }
}
