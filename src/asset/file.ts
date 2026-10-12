import { Asset, AssetNode } from "#asset/node";
import { Eastward } from "#eastward";
import { writeFileSync } from "node:fs";
import fs from "node:fs/promises";
import { uint8ArrayToBase64 } from "#util/base64";

/** An opaque source file. No editor source is invented when deployment omitted it. */
export class FileAsset extends Asset {
  data: Uint8Array | null = null;

  get type(): string {
    return this.data === null ? Asset.Type.None : Asset.Type.Binary;
  }

  async toString(): Promise<string | null> {
    if (this.data === null) {
      return null;
    }

    return uint8ArrayToBase64(this.data);
  }

  async load() {
    const refs = Object.values(this.node.objectFiles ?? {});
    const source =
      this.node.objectFiles?.data ?? (refs.length === 1 ? refs[0] : undefined);
    this.data = await this.eastward.loadFile(source);
  }

  async saveFile(filePath: string) {
    if (this.data === null) {
      return;
    }
    this.beforeSave(filePath);
    await fs.writeFile(filePath, this.data);
  }

  saveFileSync(filePath: string) {
    if (this.data === null) {
      return;
    }
    this.beforeSave(filePath);
    writeFileSync(filePath, this.data);
  }
}
