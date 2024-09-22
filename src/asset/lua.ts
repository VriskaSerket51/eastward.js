import { Asset, AssetNode } from "@/asset/node";
import { Eastward } from "@/eastward";
import fs from "fs/promises";
import { decompile } from "luajit-decompiler";
import os from "os";
import path from "path";

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
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "eastward.js-"));
    const filePath = path.join(tmpDir, this.node.name);
    await fs.writeFile(filePath, data);
    this.lua = decompile(filePath);
    fs.unlink(filePath); // No need to await
  }

  async saveFile(filePath: string) {
    if (!this.lua) {
      return;
    }
    super.beforeSave(filePath);
    await fs.writeFile(filePath, this.lua);
  }
}
