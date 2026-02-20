import {App, PluginSettingTab} from "obsidian";
import AliasSuggestPlugin from "./main";

export interface AliasSuggestSettings {
}

export const DEFAULT_SETTINGS: AliasSuggestSettings = {
}

export class AliasSuggestSettingTab extends PluginSettingTab {
	plugin: AliasSuggestPlugin;

	constructor(app: App, plugin: AliasSuggestPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();
	}
}
