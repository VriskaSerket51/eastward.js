import { decode } from "@msgpack/msgpack";
import { Asset, AssetNode } from "@/asset/node";
import { GArchive } from "@/g-archive";
import { deserialize } from "@/util/serializer";
import { exists, readDirectory, readFile } from "@/util/filesystem";
import path from "path";
import { LuaObject } from "@/type";
import { readdir } from "fs/promises";
import { AssetType } from "./util/register";

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

export const LOG_LEVEL = {
  DEBUG: 3,
  INFO: 2,
  WARN: 1,
  ERROR: 0,
};

export type Config = {
  root: string;
  verbose?: number;
};

export class Eastward {
  config;
  archives: { [key: string]: GArchive } = {};
  nodes: { [key: string]: AssetNode } = {};
  assetLoaders: { [key: string]: AssetLoader } = {};
  textureLibrary: any = {};

  constructor(config: Config) {
    const { root, verbose = LOG_LEVEL.ERROR } = config;
    this.config = { root, verbose };
  }

  async init() {
    type Package = {
      compress: boolean;
      hash_pack: string;
      hash_src: string;
      id: string;
      mode: string;
    };

    const { root, verbose } = this.config;

    const filePath = path.join(root, "content", "packages.json");
    const json = JSON.parse(new TextDecoder().decode(await readFile(filePath)));
    for (const [_, { mode, id }] of Object.entries<Package>(json.packages)) {
      if (mode == "packed" && id != "_system") {
        const filePath = path.join(root, "content", "game", `${id}.g`);
        const archive = new GArchive({ verbose });
        archive.lazyLoad(filePath);
        this.archives[id] = archive;

        if (verbose >= LOG_LEVEL.INFO) {
          console.info(`${id}.g loaded`);
        }
      }
    }

    const dlcPath = path.join(root, "content_dlc");
    if (await exists(dlcPath)) {
      const files = await readdir(dlcPath);
      for (const file of files) {
        if (file.endsWith(".g")) {
          const id = path.parse(file).name;
          const archive = this.archives[id] ?? new GArchive({ verbose });
          archive.lazyLoad(path.join(dlcPath, file));
          this.archives[id] = archive;

          if (verbose >= LOG_LEVEL.INFO) {
            console.info(`DLC: ${file} loaded`);
          }
        }
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

  async loadDirectory(dirPath: string) {
    const { root } = this.config;

    const physicalPath = path.join(root, dirPath);
    if (await exists(physicalPath)) {
      return await readDirectory(physicalPath);
    }
    const [archive, ...rest] = dirPath.split("/");
    if (!this.archives[archive]) {
      return null;
    }
    const virtualPath = rest.join("/");
    return await this.archives[archive].getDirectoryData(virtualPath);
  }

  async checkFileExists(filePath: string) {
    const { root } = this.config;

    const physicalPath = path.join(root, filePath);
    if (await exists(physicalPath)) {
      return true;
    }
    const [archive, ...rest] = filePath.split("/");
    if (!this.archives[archive]) {
      return false;
    }
    const virtualPath = rest.join("/");
    return await this.archives[archive].checkFileData(virtualPath);
  }

  async loadFile(filePath: string) {
    const { root } = this.config;

    const physicalPath = path.join(root, "content", "game", filePath);
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
    return decode(data) as any;
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
    const { verbose } = this.config;

    const node = this.nodes[path];
    if (!node) {
      return null;
    }
    const type = node.type;
    if (type == "folder") {
      return null;
    }
    const assetLoader = this.assetLoaders[type];
    if (!assetLoader) {
      if (verbose >= LOG_LEVEL.WARN) {
        console.warn(`asset with type '${type}' hasn't been registered`);
      }
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

  getAssetNode(path: string) {
    const node = this.nodes[path];
    if (!node) {
      return null;
    }
    return node;
  }

  getAssetNodes(type?: AssetType) {
    return Object.values(this.nodes).filter(
      (node) => typeof node.filePath == "string" && (!type || node.type == type)
    );
  }

  getAssetNodesWith(...types: AssetType[]) {
    return Object.values(this.nodes).filter(
      (node) =>
        typeof node.filePath == "string" &&
        types.includes(node.type as AssetType)
    );
  }

  getAssetNodesExcept(...types: AssetType[]) {
    return Object.values(this.nodes).filter(
      (node) =>
        typeof node.filePath == "string" &&
        !types.includes(node.type as AssetType)
    );
  }

  async extractTo(dst: string, ...types: AssetType[]) {
    const { verbose } = this.config;

    const nodes =
      types && types.length > 0
        ? this.getAssetNodesWith(...types)
        : this.getAssetNodes();

    for (const node of nodes) {
      try {
        const asset = await this.loadAsset(node.path);
        if (asset && typeof node.filePath == "string") {
          const dstPath = path.join(dst, node.filePath);
          await asset.saveFile(dstPath);
          if (verbose >= LOG_LEVEL.INFO) {
            console.info(node.filePath);
          }
        }
      } catch (err) {
        const e = err as Error;
        if (verbose >= LOG_LEVEL.ERROR) {
          console.error(`Error at ${node.path}: ${e.message}`);
        }
      }
    }
  }
}
