import { Asset } from "./node";
import fs from "node:fs/promises";

/** Preserves the serialized entity graph without executing game scripts. */
export class ProtoAsset extends Asset {
  data: any = null;
  get type() {
    return Asset.Type.JSON;
  }
  async load() {
    const files = this.node.objectFiles;
    this.data = files?.packed_def
      ? await this.eastward.loadMsgPackFile(files.packed_def)
      : null;
    if (!this.data && files?.def)
      this.data = await this.eastward.loadJSONFile(files.def);
    if (this.data == null)
      throw new Error(`proto data not found: ${this.node.path}`);
  }
  async toString() {
    return JSON.stringify(this.data);
  }
  async saveFile(filePath: string) {
    if (this.data == null) return;
    this.beforeSave(filePath);
    await fs.writeFile(filePath, JSON.stringify(this.data, null, 2));
  }
}

export class RawAsset extends Asset {
  data: Uint8Array | null = null;
  get type() {
    return Asset.Type.Binary;
  }
  async load() {
    const source = this.node.objectFiles?.data;
    this.data = source ? await this.eastward.loadFile(source) : null;
    if (this.data == null)
      throw new Error(`raw data not found: ${this.node.path}`);
  }
  async saveFile(filePath: string) {
    if (this.data == null) return;
    this.beforeSave(filePath);
    await fs.writeFile(filePath, this.data);
  }
}
