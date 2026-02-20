import {App, Plugin, TFile, Editor, EditorPosition, EditorSuggest, EditorSuggestContext, EditorSuggestTriggerInfo, Notice} from 'obsidian';
import {DEFAULT_SETTINGS, AliasSuggestSettings, AliasSuggestSettingTab} from "./settings";

export default class AliasSuggestPlugin extends Plugin {
	settings: AliasSuggestSettings;
	private suggestPatches: { suggest: any; originalOnTrigger: Function }[] = [];

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new AliasSuggestSettingTab(this.app, this));

		const aliasSuggest = new AliasSuggest(this.app);
		this.registerEditorSuggest(aliasSuggest);
		this.patchBuiltInSuggests(aliasSuggest);
	}

	onunload() {
		for (const { suggest, originalOnTrigger } of this.suggestPatches) {
			suggest.onTrigger = originalOnTrigger;
		}
		this.suggestPatches = [];
	}

	/**
	 * Monkey-patch built-in EditorSuggest instances so they return null
	 * when the cursor is after "|" inside a wikilink. This prevents
	 * the built-in display-text suggest from stealing focus.
	 */
	private patchBuiltInSuggests(ownSuggest: AliasSuggest) {
		// @ts-ignore – internal API: workspace.editorSuggest.suggests
		const suggests: any[] | undefined = this.app.workspace?.editorSuggest?.suggests;
		if (!Array.isArray(suggests)) return;

		for (const suggest of suggests) {
			if (suggest === ownSuggest) continue;
			const originalOnTrigger = suggest.onTrigger;
			if (typeof originalOnTrigger !== 'function') continue;

			this.suggestPatches.push({ suggest, originalOnTrigger });

			suggest.onTrigger = function (
				cursor: EditorPosition, editor: Editor, file: TFile | null
			) {
				const line = editor.getLine(cursor.line);
				const before = line.substring(0, cursor.ch);
				if (/\[\[[^\]]*\|/.test(before)) return null;
				return originalOnTrigger.call(this, cursor, editor, file);
			};
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<AliasSuggestSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class AliasSuggest extends EditorSuggest<{ alias: string, note: string }> {
	constructor(app: App) {
		super(app);
	}

	private getNoteNameFromContext(context: EditorSuggestContext): string {
		const line = context.editor.getLine(context.start.line);
		const textBeforeAlias = line.substring(0, context.start.ch);
		const match = textBeforeAlias.match(/\[\[([^\|\]]+)\|$/);
		return match ? match[1]! : '';
	}

	onTrigger(cursor: EditorPosition, editor: Editor, file: TFile | null): EditorSuggestTriggerInfo | null {
		if (!file) return null;
		const line = editor.getLine(cursor.line);
		const textBeforeCursor = line.substring(0, cursor.ch);
		
		const match = textBeforeCursor.match(/\[\[([^\|\]]+)\|([^\s\[\]\|][^\[\]\|]*)$/);
		if (!match) return null;
		// established correct text situation
		
		const noteName = match[1]!;
		const aliasInProgress = match[2]!;
		
		const target = this.app.metadataCache.getFirstLinkpathDest(noteName, file.path as string);
		if (!target) return null;
		// established referenced note exists
		
		const cache = this.app.metadataCache.getFileCache(target);
		const existingAliases: string[] = cache?.frontmatter?.aliases ?? [];
		
		if (existingAliases.includes(aliasInProgress)) return null;
		
		return {
			start: { line: cursor.line, ch: cursor.ch - aliasInProgress.length },
			end: cursor,
			query: aliasInProgress,
		};
	}
	getSuggestions(context: EditorSuggestContext) {
		const noteName = this.getNoteNameFromContext(context);
		return[{
			alias: context.query,
			note: noteName
		}];
	}
	
	renderSuggestion(s: {alias: string, note: string}, el: HTMLElement) {
		el.createEl("div", {
			text: `Add alias "${s.alias}" to ${s.note}?`
		});
	}
	
	async selectSuggestion(s: { alias: string, note: string }, evt: MouseEvent | KeyboardEvent) {
		const alias = s.alias;
		const noteName = s.note;
	
		const target = this.app.metadataCache.getFirstLinkpathDest(noteName, "");
		if (!target) {
			new Notice("Note not found");
			return;
		}
	
		let text = await this.app.vault.read(target);
	
		const hasFrontmatter = text.startsWith("---");
		if (!hasFrontmatter) {
			text = `---\naliases: [${alias}]\n---\n` + text;
		} else {
			const end = text.indexOf("---", 3);
			const frontmatter = text.substring(3, end);
	
			if (frontmatter.match(/aliases:/)) {
				// Update existing list
				text = text.replace(/aliases:\s*\[(.*?)\]/, (full, inside) => {
					const list = inside.split(",").map((s: string) => s.trim())	.filter((s: string) => s.length);
					if (!list.includes(alias)) list.push(alias);
					return `aliases: [${list.join(", ")}]`;
				});
			} else {
				// Add new aliases property inside existing frontmatter
				const newFm = frontmatter + `\naliases: [${alias}]`;
				text = `---\n${newFm}\n---` + text.substring(end + 3);
			}
		}
	
		await this.app.vault.modify(target, text);
	
		new Notice(`Added alias "${alias}" to ${target.basename}`);
	
		this.close();
	}
	
	

}