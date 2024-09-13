import { Asset, AssetNode } from "@/asset/node";
import { Eastward } from "@/eastward";
import { writeFileSync } from "fs";
import fs from "fs/promises";

export class EffectAsset extends Asset {
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
