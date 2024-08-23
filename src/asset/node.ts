import { Eastward } from "@/eastward";

export class AssetNode {
  name = "";
  parent = "";
  path;
  type = "";
  filePath: string | boolean = false;
  tags: string[] | null = null;
  properties: any;
  objectFiles: any;
  deployMeta: any;
  dependency: any;
  parentNode: AssetNode | null = null;
  children: { [key: string]: AssetNode } = {};
  cachedAsset: Asset | null = null;

  constructor(path: string) {
    this.path = path;
  }
}

export class Asset {
  constructor(eastward: Eastward, node: AssetNode) {}

  async saveFile(filePath: string) {}
  saveFileSync(filePath: string) {}

}
