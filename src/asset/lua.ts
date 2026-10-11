import { Asset, AssetNode } from "#asset/node";
import { Eastward } from "#eastward";
import fs from "node:fs/promises";

export class LuaAsset extends Asset {
  lua: string | null = null;

  constructor(eastward: Eastward, node: AssetNode) {
    super(eastward, node);
  }

  get type(): string {
    return Asset.Type.Lua;
  }

  async toString(): Promise<string | null> {
    return this.lua;
  }

  async load() {
    const srcPath = this.eastward.findScript(this.node.path);
    const data = await this.eastward.loadFile(srcPath);
    if (!data) {
      return;
    }
    const { decompileAsync } = await import("luajit-decompiler");
    this.lua = await decompileAsync(data);
  }

  async saveFile(filePath: string) {
    if (!this.lua) {
      return;
    }
    super.beforeSave(filePath);
    await fs.writeFile(filePath, this.lua);
  }
}
