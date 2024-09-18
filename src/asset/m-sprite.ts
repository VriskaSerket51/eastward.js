import { Asset, AssetNode } from "@/asset/node";
import { Eastward } from "@/eastward";
import { writeFileSync } from "fs";
import fs from "fs/promises";
import { TextureAsset } from "./texture";

export class MSpriteAsset extends Asset {
  def: any = null;
  texture: TextureAsset | null = null;

  constructor(eastward: Eastward, node: AssetNode) {
    super(eastward, node);
  }

  get type(): string {
    return Asset.Type.Text;
  }

  async toString(): Promise<string | null> {
    return null;
  }

  async load() {
    // TODO
    this.def = await this.eastward.loadMsgPackFile(
      this.node.objectFiles!.packed_def
    );

    if (!this.def) {
      this.def = await this.eastward.loadJSONFile(this.node.objectFiles!.def);
    }

    const textNodePath = `${this.node.path}_texture`;
    this.texture = await this.eastward.loadAsset<TextureAsset>(textNodePath);

    if (!this.texture) {
      throw new Error(`cannot find texture: ${textNodePath}`);
    }

    
  }

  async saveFile(filePath: string) {
    super.beforeSave(filePath);
  }

  saveFileSync(filePath: string) {
    super.beforeSave(filePath);
  }
}
