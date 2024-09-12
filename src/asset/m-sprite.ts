import { Asset, AssetNode } from "@/asset/node";
import { Eastward } from "@/eastward";
import { writeFileSync } from "fs";
import fs from "fs/promises";

export class MSpriteAsset extends Asset {
  constructor(eastward: Eastward, node: AssetNode) {
    super(eastward, node);
  }

  get type(): string {
    return Asset.Type.Text;
  }

  async load() {}

  async saveFile(filePath: string) {
    super.beforeSave(filePath);
  }

  saveFileSync(filePath: string) {
    super.beforeSave(filePath);
  }
}
