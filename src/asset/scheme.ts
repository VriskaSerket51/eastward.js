import { Asset, AssetNode } from "@/asset/node";
import { Eastward } from "@/eastward";
import { generateGraphML } from "@/util/fsm";
import { Lua } from "wasmoon-lua5.1";
import { writeFileSync } from "fs";
import fs from "fs/promises";

export class FSMSchemeAsset extends Asset {
  ml: string | null = null;

  constructor(eastward: Eastward, node: AssetNode) {
    super(eastward, node);
  }

  get type(): string {
    return Asset.Type.Lua;
  }

  async toString(): Promise<string | null> {
    return this.ml;
  }

  async load() {
    const def = await this.eastward.loadTextFile(this.node.objectFiles!.def);
    if (!def) {
      return;
    }
    this.ml =def;

    // const lua = await Lua.create();
    // const value = await lua.doString(def);
    // const fsm: Map<string, any> = value.$detach();
    // lua.global.close();

    // function helper(map: Map<string, any>) {
    //   for (const key of map.keys()) {
    //     const value = map.get(key);
    //     if (value instanceof Map) {
    //       helper(value);
    //       map.set(key, Object.fromEntries(value));
    //     }
    //   }
    // }

    // helper(fsm);
    // this.ml = generateGraphML(Object.fromEntries(fsm));
  }

  async saveFile(filePath: string) {
    if (!this.ml) {
      return;
    }
    super.beforeSave(filePath);
    await fs.writeFile(filePath, this.ml);
  }
}

export class QuestSchemeAsset extends Asset {
  def: string | null = null;

  constructor(eastward: Eastward, node: AssetNode) {
    super(eastward, node);
  }

  get type(): string {
    return Asset.Type.Text;
  }

  async toString(): Promise<string | null> {
    return this.def;
  }

  async load() {
    this.def = await this.eastward.loadTextFile(this.node.objectFiles!.def);
  }

  async saveFile(filePath: string) {
    if (!this.def) {
      return;
    }
    super.beforeSave(filePath);
    await fs.writeFile(filePath, this.def);
  }

  saveFileSync(filePath: string) {
    if (!this.def) {
      return;
    }
    super.beforeSave(filePath);
    writeFileSync(filePath, this.def);
  }
}

export class TBSchemeAsset extends Asset {
  data: string | null = null;

  constructor(eastward: Eastward, node: AssetNode) {
    super(eastward, node);
  }

  get type(): string {
    return Asset.Type.Text;
  }

  async toString(): Promise<string | null> {
    return this.data;
  }

  async load() {
    this.data = await this.eastward.loadTextFile(this.node.objectFiles!.data);
  }

  async saveFile(filePath: string) {
    if (!this.data) {
      return;
    }
    super.beforeSave(filePath);
    await fs.writeFile(filePath, this.data);
  }

  saveFileSync(filePath: string) {
    if (!this.data) {
      return;
    }
    super.beforeSave(filePath);
    writeFileSync(filePath, this.data);
  }
}
