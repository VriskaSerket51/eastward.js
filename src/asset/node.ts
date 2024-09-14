import { Eastward } from "@/eastward";
import path from "path";
import fs from "fs";
import { LuaObject } from "@/type";

export class AssetNode {
  name = "";
  parent = "";
  path;
  type = "";
  filePath: string | boolean = false;
  tags: string[] | null = null;
  properties: LuaObject | null = null;
  objectFiles: LuaObject | null = null;
  deployMeta: LuaObject | null = null;
  dependency: LuaObject | null = null;
  parentNode: AssetNode | null = null;
  children: { [key: string]: AssetNode } = {};
  cachedAsset: Asset | null = null;

  constructor(path: string) {
    this.path = path;
  }
}

export class Asset {
  eastward;
  node;

  constructor(eastward: Eastward, node: AssetNode) {
    this.eastward = eastward;
    this.node = node;
  }

  static Type = {
    Text: "text",
    Json: "json",
    Image: "image",
    Binary: "binary",
    None: "none",
  };

  get type() {
    return Asset.Type.None;
  }

  async toString(): Promise<string | null> {
    return null;
  }

  async load() {}

  beforeSave(filePath: string) {
    const dstDir = path.dirname(filePath);
    if (!fs.existsSync(dstDir)) {
      fs.mkdirSync(dstDir, { recursive: true });
    }
  }
  async saveFile(filePath: string) {}
  saveFileSync(filePath: string) {}
}
