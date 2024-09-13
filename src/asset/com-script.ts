import { Asset, AssetNode } from "@/asset/node";
import { Eastward } from "@/eastward";
import { writeFileSync } from "fs";
import fs from "fs/promises";

export class ComScriptAsset extends Asset {
  script: string | null = null;

  constructor(eastward: Eastward, node: AssetNode) {
    super(eastward, node);
  }

  get type(): string {
    return Asset.Type.Text;
  }

  async toString(): Promise<string | null> {
    return this.script;
  }

  async load() {
    this.script = await this.eastward.loadTextFile(this.node.objectFiles!.src);
  }

  async saveFile(filePath: string) {
    if (!this.script) {
      return;
    }
    super.beforeSave(filePath);
    await fs.writeFile(filePath, this.script);
  }

  saveFileSync(filePath: string) {
    if (!this.script) {
      return;
    }
    super.beforeSave(filePath);
    writeFileSync(filePath, this.script);
  }
}
