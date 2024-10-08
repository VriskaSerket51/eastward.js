import { Asset, AssetNode } from "@/asset/node";
import { Eastward } from "@/eastward";
import { writeFileSync } from "fs";
import fs from "fs/promises";

export class GLSLAsset extends Asset {
  src: string | null = null;

  constructor(eastward: Eastward, node: AssetNode) {
    super(eastward, node);
  }

  get type(): string {
    return Asset.Type.GLSL;
  }

  async toString(): Promise<string | null> {
    return this.src;
  }

  async load() {
    this.src = await this.eastward.loadTextFile(this.node.objectFiles!.src);
  }

  async saveFile(filePath: string) {
    if (!this.src) {
      return;
    }
    super.beforeSave(filePath);
    await fs.writeFile(filePath, this.src);
  }

  saveFileSync(filePath: string) {
    if (!this.src) {
      return;
    }
    super.beforeSave(filePath);
    writeFileSync(filePath, this.src);
  }
}
