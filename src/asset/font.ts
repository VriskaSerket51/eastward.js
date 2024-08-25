import { Asset, AssetNode } from "@/asset/node";
import { Eastward } from "@/eastward";
import { writeFileSync } from "fs";
import fs from "fs/promises";

export class BMFontAsset extends Asset {
  fnt;

  constructor(eastward: Eastward, node: AssetNode) {
    super(eastward, node);
    this.fnt = eastward.loadTextFile(node.objectFiles.font);
  }

  async saveFile(filePath: string) {
    super.beforeSave(filePath);
    await fs.writeFile(filePath, this.fnt || "err");
  }

  saveFileSync(filePath: string) {
    super.beforeSave(filePath);
    writeFileSync(filePath, this.fnt || "err");
  }
}

export class TTFFontAsset extends Asset {
  ttf;

  constructor(eastward: Eastward, node: AssetNode) {
    super(eastward, node);
    this.ttf = eastward.loadFile(node.objectFiles.font);
  }

  async saveFile(filePath: string) {
    super.beforeSave(filePath);
    await fs.writeFile(filePath, this.ttf || "err");
  }

  saveFileSync(filePath: string) {
    super.beforeSave(filePath);
    writeFileSync(filePath, this.ttf || "err");
  }
}
