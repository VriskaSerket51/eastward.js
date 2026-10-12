import { Asset, AssetNode } from "#asset/node";
import { Eastward } from "#eastward";
import { writeFileSync } from "node:fs";
import fs from "node:fs/promises";

export class TextAsset extends Asset {
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
    const ref = this.node.objectFiles?.data;
    if (!ref)
      throw new Error(
        "Text source is absent from the installed asset index: " +
          this.node.path,
      );
    this.data = await this.eastward.loadTextFile(ref);
  }

  async saveFile(filePath: string) {
    if (this.data == null) {
      return;
    }
    super.beforeSave(filePath);
    await fs.writeFile(filePath, this.data);
  }

  saveFileSync(filePath: string) {
    if (this.data == null) {
      return;
    }
    super.beforeSave(filePath);
    writeFileSync(filePath, this.data);
  }
}
