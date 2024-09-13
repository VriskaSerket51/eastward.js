import { Asset, AssetNode } from "@/asset/node";
import { Eastward } from "@/eastward";
import { uint8ArrayToBase64 } from "@/util/base64";
import { writeFileSync } from "fs";
import fs from "fs/promises";

export class BMFontAsset extends Asset {
  fnt: string | null = null;

  constructor(eastward: Eastward, node: AssetNode) {
    super(eastward, node);
  }

  get type(): string {
    return Asset.Type.Text;
  }

  async toString(): Promise<string | null> {
    return this.fnt;
  }

  async load() {
    this.fnt = await this.eastward.loadTextFile(this.node.objectFiles!.font);
  }

  async saveFile(filePath: string) {
    if (!this.fnt) {
      return;
    }
    super.beforeSave(filePath);
    await fs.writeFile(filePath, this.fnt);
  }

  saveFileSync(filePath: string) {
    if (!this.fnt) {
      return;
    }
    super.beforeSave(filePath);
    writeFileSync(filePath, this.fnt);
  }
}

export class TTFFontAsset extends Asset {
  ttf: Uint8Array | null = null;

  constructor(eastward: Eastward, node: AssetNode) {
    super(eastward, node);
  }

  get type(): string {
    return Asset.Type.Binary;
  }

  async toString(): Promise<string | null> {
    if (!this.ttf) {
      return null;
    }
    return uint8ArrayToBase64(this.ttf);
  }

  async load() {
    this.ttf = await this.eastward.loadFile(this.node.objectFiles!.font);
  }

  async saveFile(filePath: string) {
    if (!this.ttf) {
      return;
    }
    super.beforeSave(filePath);
    await fs.writeFile(filePath, this.ttf);
  }

  saveFileSync(filePath: string) {
    if (!this.ttf) {
      return;
    }
    super.beforeSave(filePath);
    writeFileSync(filePath, this.ttf);
  }
}
