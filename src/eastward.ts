import { decode } from "@msgpack/msgpack";
import { Asset, AssetNode } from "@/asset/node";
import { GArchive } from "@/g-archive";
import { deserialize } from "@/util/serializer";
import { exists, readFile } from "@/util/filesystem";
import path from "path";

export type LuaObject = { [key: string]: string };

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
  properties: LuaObject;
  objectFiles: LuaObject;
  deployMeta: LuaObject;
  dependency: LuaObject;
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
  textureLibrary: any = {};

  constructor(root: string) {
    this.root = root;
  }

  async init() {
    const filePath = path.join(this.root, "content", "packages.json");
    const json = JSON.parse(new TextDecoder().decode(await readFile(filePath)));
    for (const [_, { mode, id }] of Object.entries<Package>(json.packages)) {
      if (mode == "packed" && id != "_system") {
        const filePath = path.join(this.root, "content", "game", `${id}.g`);
        this.archives[id] = new GArchive();
        await this.archives[id].load(filePath);
        // console.log(`${id}.g loaded`);
      }
    }

    const config = await this.loadJSONFile("config/game_config");
    const assetLibraryIndex = config.asset_library;
    const textureLibraryIndex = config.texture_library;

    await this._loadAssetLibrary(assetLibraryIndex);
    await this._loadTextureLibrary(textureLibraryIndex);
  }

  getArchive(name: string) {
    if (this.archives[name]) {
      return this.archives[name];
    }
    return null;
  }

  private _skipEmptyTable(obj: LuaObject) {
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

  private async _loadAssetLibrary(indexPath: string) {
    const msgpackPath = `${indexPath}.packed`;
    let indexData;
    if (await this.checkFileExists(msgpackPath)) {
      indexData = await this.loadMsgPackFile(msgpackPath);
    } else {
      indexData = await this.loadJSONFile(indexPath);
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

  async _loadTextureLibrary(indexPath: string) {
    const data = await this.loadJSONFile(indexPath);
    deserialize(this.textureLibrary, data);

    for (const group of this.textureLibrary.groups) {
      if (group.default) {
        this.textureLibrary.defaultGroup = group;
      }
    }

    const textureMap: any = {};

    for (const group of this.textureLibrary.groups) {
      const newTextures = [];
      if (Array.isArray(group.textures)) {
        for (const texture of group.textures) {
          if (this.nodes[texture.path]) {
            newTextures.push(texture.path);

            textureMap[texture.path] = texture;
          }
        }
      }

      group.textures = newTextures;
    }

    this.textureLibrary.textureMap = textureMap;
  }

  async checkFileExists(filePath: string) {
    const physicalPath = path.join(this.root, filePath);
    if (await exists(physicalPath)) {
      return true;
    }
    const [archive, ...rest] = filePath.split("/");
    if (!this.archives[archive]) {
      return false;
    }
    const virtualPath = rest.join("/");
    return this.archives[archive].checkFileData(virtualPath);
  }

  async loadFile(filePath: string) {
    const physicalPath = path.join(this.root, "content", "game", filePath);
    if (await exists(physicalPath)) {
      return await readFile(physicalPath);
    }
    const [archive, ...rest] = filePath.split("/");
    if (!this.archives[archive]) {
      return null;
    }
    const virtualPath = rest.join("/");
    return await this.archives[archive].getFileData(virtualPath);
  }

  async loadMsgPackFile(filePath: string) {
    const data = await this.loadFile(filePath);
    if (!data) {
      return null;
    }
    return decode(data);
  }

  async loadJSONFile(filePath: string) {
    const data = await this.loadTextFile(filePath);
    if (!data) {
      return null;
    }
    return JSON.parse(data);
  }

  async loadTextFile(filePath: string) {
    const data = await this.loadFile(filePath);
    if (!data) {
      return null;
    }
    return new TextDecoder().decode(data);
  }

  async loadAsset<T extends Asset>(path: string): Promise<T | null> {
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
      await this.loadAsset<Asset>(node.parent);
    }

    if (node.cachedAsset) {
      return node.cachedAsset as T;
    }

    const asset = new assetLoader.loader(this, node);
    await asset.load();
    node.cachedAsset = asset;
    return asset as T;
  }

  findTexture(path: string) {
    return this.textureLibrary.textureMap[path];
  }

  registerAssetLoader(type: string, loader: LoaderFunc, skipParent?: boolean) {
    this.assetLoaders[type] = {
      loader,
      skipParent: Boolean(skipParent),
    };
  }

  getAssetNodes(type?: string) {
    return Object.values(this.nodes).filter(
      (node) => typeof node.filePath == "string" && (!type || node.type == type)
    );
  }

  async extractTo(dst: string) {
    for (const [filePath, node] of Object.entries(this.nodes)) {
      const asset = await this.loadAsset(filePath);
      if (asset && typeof node.filePath == "string") {
        const dstPath = path.join(dst, node.filePath);
        await asset.saveFile(dstPath);
      }
    }
  }
}
