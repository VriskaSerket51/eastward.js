import { decode } from "@msgpack/msgpack";
import fs from "fs";
import path from "path";
import { Asset, AssetNode } from "@/asset/node";
import { GArchive } from "@/g-archive";

type Package = {
  compress: boolean;
  hash_pack: string;
  hash_src: string;
  id: string;
  mode: string;
};

type AssetIndex = {
  type: string;
  filePath: string;
  tags: string[];
  properties: any;
  objectFiles: any;
  deployMeta: any;
  dependency: any;
};

type LoaderFunc = new (eastward: Eastward, node: AssetNode) => Asset;

type AssetLoader = {
  loader: LoaderFunc;
  skipParent: boolean;
};

export class Eastward {
  root;
  archives: { [key: string]: GArchive } = {};
  nodes: { [key: string]: AssetNode } = {};
  assetLoaders: { [key: string]: AssetLoader } = {};

  constructor(root: string) {
    this.root = root;
    const filePath = path.join(root, "content", "packages.json");
    const json = JSON.parse(fs.readFileSync(filePath, "utf8"));
    for (const [_, { mode, id }] of Object.entries<Package>(json.packages)) {
      if (mode == "packed" && id != "_system") {
        const filePath = path.join(root, "content", "game", `${id}.g`);
        this.archives[id] = new GArchive(filePath);
        // console.log(`${id}.g loaded`);
      }
    }

    const config = this.loadJSONFile("config/game_config");
    const assetLibraryIndex = config.asset_library;
    const textureLibraryIndex = config.texture_library;

    this._loadAssetLibrary(assetLibraryIndex);
  }

  private _skipEmptyTable(obj: any) {
    if (!obj) {
      return null;
    }
    if (Object.keys(obj).length == 0) {
      return null;
    }
    return obj;
  }

  private _affirmAssetNode(path: string) {
    return this.nodes[path] || new AssetNode(path);
  }

  private _loadAssetLibrary(indexPath: string) {
    const msgpackPath = `${indexPath}.packed`;
    let indexData;
    if (this.checkFileExists(msgpackPath)) {
      indexData = this.loadMsgPackFile(msgpackPath);
    } else {
      indexData = this.loadJSONFile(indexPath);
    }

    for (const [
      path,
      { type, filePath, tags, properties, objectFiles, deployMeta, dependency },
    ] of Object.entries<AssetIndex>(indexData)) {
      const [name, ...rest] = path.split("/").reverse();
      const ppath = rest.reverse().join("/");

      const node = this._affirmAssetNode(path);
      node.name = name;
      node.parent = ppath;
      node.path = path;
      node.type = type;
      node.filePath = filePath;
      node.tags = tags.length > 0 ? tags : null;
      node.properties = this._skipEmptyTable(properties);
      node.objectFiles = this._skipEmptyTable(objectFiles);
      node.deployMeta = this._skipEmptyTable(deployMeta);
      node.dependency = this._skipEmptyTable(dependency);

      this.nodes[path] = node;

      if (ppath) {
        const pnode = this._affirmAssetNode(ppath);
        node.parentNode = pnode;
        pnode.children[name] = node;
      }
    }
  }

  checkFileExists(filePath: string) {
    const physicalPath = path.join(this.root, filePath);
    if (fs.existsSync(physicalPath)) {
      return true;
    }
    const [archive, ...rest] = filePath.split("/");
    if (!this.archives[archive]) {
      return false;
    }
    const virtualPath = rest.join("/");
    return this.archives[archive].checkFileData(virtualPath);
  }

  loadFile(filePath: string) {
    const physicalPath = path.join(this.root, filePath);
    if (fs.existsSync(physicalPath)) {
      return fs.readFileSync(physicalPath);
    }
    const [archive, ...rest] = filePath.split("/");
    if (!this.archives[archive]) {
      return null;
    }
    const virtualPath = rest.join("/");
    return this.archives[archive].getFileData(virtualPath);
  }

  loadMsgPackFile(filePath: string) {
    const data = this.loadFile(filePath);
    if (!data) {
      return null;
    }
    return decode(data);
  }

  loadJSONFile(filePath: string) {
    const data = this.loadFile(filePath);
    if (!data) {
      return null;
    }
    return JSON.parse(data.toString());
  }

  loadTextFile(filePath: string) {
    const data = this.loadFile(filePath);
    if (!data) {
      return null;
    }
    return data.toString();
  }

  loadAsset(path: string) {
    const node = this.nodes[path];
    if (!node) {
      return null;
    }
    const type = node.type;
    const assetLoader = this.assetLoaders[type];
    if (!assetLoader) {
      // console.error(`asset with type '${type}' hasn't been registered`);
      return null;
    }

    if (node.parent && !assetLoader.skipParent) {
      this.loadAsset(node.parent);
    }

    if (node.cachedAsset) {
      return node.cachedAsset;
    }

    const asset = new assetLoader.loader(this, node);
    node.cachedAsset = asset;
    return asset;
  }

  registerAll() {}

  registerAssetLoader(type: string, loader: LoaderFunc, skipParent?: boolean) {
    this.assetLoaders[type] = {
      loader,
      skipParent: Boolean(skipParent),
    };
  }

  extractTo(dst: string) {
    for (const [filePath, node] of Object.entries(this.nodes)) {
      const asset = this.loadAsset(filePath);
      if (asset && typeof node.filePath == "string") {
        const dstPath = path.join(dst, node.filePath);
        const dstDir = path.dirname(dstPath);
        if (!fs.existsSync(dstDir)) {
          fs.mkdirSync(dstDir, {recursive: true});
        }
        asset.saveFile(dstPath);
      }
    }
  }
}
