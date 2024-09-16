import { Asset, AssetNode } from "@/asset/node";
import { Eastward } from "@/eastward";
import { uint8ArrayToBase64 } from "@/util/base64";
import { writeFileSync } from "fs";
import fs from "fs/promises";

export class MovieAsset extends Asset {
  data: Uint8Array | null = null;

  constructor(eastward: Eastward, node: AssetNode) {
    super(eastward, node);
  }

  get type(): string {
    return Asset.Type.Text;
  }

  async toString(): Promise<string | null> {
    if (!this.data) {
      return null;
    }
    return uint8ArrayToBase64(this.data);
  }

  async load() {
    this.data = await this.eastward.loadFile(this.node.objectFiles!.data);
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
