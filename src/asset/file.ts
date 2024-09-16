import { Asset, AssetNode } from "@/asset/node";
import { Eastward } from "@/eastward";

export class FileAsset extends Asset {
  constructor(eastward: Eastward, node: AssetNode) {
    super(eastward, node);
  }

  get type(): string {
    return Asset.Type.None;
  }

  async toString(): Promise<string | null> {
    return null;
  }

  async load() {}

  async saveFile(filePath: string) {}

  saveFileSync(filePath: string) {}
}
