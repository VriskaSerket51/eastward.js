import { Asset, AssetNode } from "#asset/node";
import { Eastward } from "#eastward";
import fs from "node:fs/promises";
import path from "node:path";
import { Lua } from "wasmoon-lua5.1";
import { localeToPO } from "#util/i18n";

type LocaleConfig = {
  guid: string;
  source_locale?: string;
  items: { name: string; path: string }[];
};

export class LocalePackAsset extends Asset {
  langs: string[] = [];
  config: LocaleConfig | null = null;
  data: { [key: string]: any } = {};

  constructor(eastward: Eastward, node: AssetNode) {
    super(eastward, node);
  }

  get type(): string {
    return Asset.Type.JSON;
  }

  async toString(): Promise<string | null> {
    const config = this.config;
    const data = this.data;
    return JSON.stringify({ config, data });
  }

  async load() {
    this.langs = [];
    this.data = {};
    this.config = await this.eastward.loadJSONFile(
      this.node.objectFiles!.config
    );
    const available = await this.eastward.loadDirectory(this.node.objectFiles!.data);
    const langs = [...new Set([
      this.config?.source_locale,
      ...(available || []).filter(name => name && !name.includes("/")),
      "en", "ko", "de", "es", "fr", "zh-TW", "zh-CN", "ja",
    ].filter((lang): lang is string => Boolean(lang)))];
    for (const lang of langs) {
      const luaData = await this.eastward.loadTextFile(
        `${this.node.objectFiles!.data}/${lang}`
      );
      if (!luaData) {
        continue;
      }
      const lua = await Lua.create();
      try {
        const value = await lua.doString(luaData);
        const i18n: Map<string, any> = value.$detach();
        for (const key of i18n.keys()) {
          i18n.set(key, Object.fromEntries(i18n.get(key)));
        }
        this.data[lang] = Object.fromEntries(i18n);
        this.langs.push(lang);
      } finally {
        lua.global.close();
      }
    }
  }

  findNameByPath(path: string) {
    if (!this.config) {
      return null;
    }

    const item = this.config.items.find(
      ({ path: itemPath }) => itemPath == path
    );

    return item ? item.name : null;
  }

  getTranslation(name: string, lang: string) {
    if (!this.data || !this.langs.includes(lang)) {
      return null;
    }

    return this.data[lang][name];
  }

  async saveFile(filePath: string) {
    if (!this.config || !this.data) {
      return;
    }

    this.langs.forEach((lang) => {
      super.beforeSave(path.join(filePath, "locales", lang, "template"));
    });

    const config = this.config;
    const data = this.data;
    await fs.writeFile(
      path.join(filePath, "locale_pack.json"),
      JSON.stringify(config, null, 2)
    );

    for (const lang in data) {
      const i18n = data[lang];
      for (const name in i18n) {
        const locale = i18n[name];

        const po = localeToPO(locale);

        await fs.writeFile(
          path.join(filePath, "locales", lang, `${name}.po`),
          po
        );
      }
    }
  }
}
