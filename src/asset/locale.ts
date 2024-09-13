import { Asset, AssetNode } from "@/asset/node";
import { Eastward } from "@/eastward";
import { writeFileSync } from "fs";
import fs from "fs/promises";
import { Lua } from "wasmoon-lua5.1";

export class LocalePackAsset extends Asset {
  langs: string[] = [];
  config: any | null = null;
  data: { [key: string]: any } = {};

  constructor(eastward: Eastward, node: AssetNode) {
    super(eastward, node);
  }

  get type(): string {
    return Asset.Type.Json;
  }

  async toString(): Promise<string | null> {
    const config = this.config;
    const data = this.data;
    return JSON.stringify({ config, data });
  }

  async load() {
    const langs = ["en", "ko", "de", "es", "fr", "zh-TW", "zh-CN", "ja"];
    this.config = await this.eastward.loadJSONFile(
      this.node.objectFiles!.config
    );
    for (const lang of langs) {
      const luaData = await this.eastward.loadTextFile(
        `${this.node.objectFiles!.data}/${lang}`
      );
      if (!luaData) {
        return;
      }
      const lua = await Lua.create();
      const value = await lua.doString(luaData);
      const i18n: Map<string, any> = value.$detach();
      lua.global.close();
      this.langs.push(lang);
      for (const key of i18n.keys()) {
        i18n.set(key, Object.fromEntries(i18n.get(key)));
      }
      this.data[lang] = Object.fromEntries(i18n);
    }
  }

  async saveFile(filePath: string) {
    super.beforeSave(filePath);
    const config = this.config;
    const data = this.data;
    await fs.writeFile(filePath, JSON.stringify({ config, data }));
  }

  saveFileSync(filePath: string) {
    super.beforeSave(filePath);
    const config = this.config;
    const data = this.data;
    writeFileSync(filePath, JSON.stringify({ config, data }));
  }
}
