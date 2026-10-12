import { Asset, AssetNode } from "#asset/node";
import { Eastward } from "#eastward";
import { writeFileSync, mkdirSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { decodeHMG, hmg2png, hmg2pngSync, png2hmg, HMG } from "#util/hmg";
import { tilesetToPSD } from "#util/source-image";

export class CodeTilesetAsset extends Asset {
  data: string | null = null;

  constructor(eastward: Eastward, node: AssetNode) {
    super(eastward, node);
  }

  get type(): string {
    return Asset.Type.Text;
  }

  async toString(): Promise<string | null> {
    return this.data;
  }

  async load() {
    this.data = await this.eastward.loadTextFile(this.node.objectFiles!.data);
  }

  async saveFile(filePath: string) {
    if (this.data == null) {
      return;
    }
    super.beforeSave(filePath);
    await fs.writeFile(filePath, this.data);
  }

  saveFileSync(filePath: string) {
    if (this.data == null) {
      return;
    }
    super.beforeSave(filePath);
    writeFileSync(filePath, this.data);
  }
}

export class NamedTilesetPackAsset extends Asset {
  def: string | null = null;
  atlas: HMG | null = null;
  data: any = null;

  constructor(eastward: Eastward, node: AssetNode) {
    super(eastward, node);
  }

  get type(): string {
    return Asset.Type.JSON;
  }

  async toString(): Promise<string | null> {
    return this.def;
  }

  async load() {
    this.def = await this.eastward.loadTextFile(this.node.objectFiles!.def);
    this.data = this.def ? JSON.parse(this.def) : null;
    const raw = await this.eastward.loadFile(this.node.objectFiles!.atlas);
    this.atlas = raw
      ? raw[0] === 0x89 && raw[1] === 0x50
        ? await png2hmg(raw)
        : decodeHMG(raw)
      : null;
  }

  async saveFile(filePath: string) {
    if (this.def == null) {
      return;
    }
    if (/\.psd$/i.test(filePath)) {
      if (!this.data || !this.atlas) {
        throw new Error("Missing tileset definition or atlas");
      }
      this.beforeSave(filePath);
      await fs.writeFile(filePath, tilesetToPSD(this.data, this.atlas));
      return;
    }
    await fs.mkdir(filePath, { recursive: true });
    await fs.writeFile(path.join(filePath, "tileset.json"), this.def);
    if (this.atlas) {
      await fs.writeFile(
        path.join(filePath, "atlas.png"),
        await hmg2png(this.atlas),
      );
    }
  }

  saveFileSync(filePath: string) {
    if (this.def == null) {
      return;
    }
    if (/\.psd$/i.test(filePath)) {
      if (!this.data || !this.atlas) {
        throw new Error("Missing tileset definition or atlas");
      }
      this.beforeSave(filePath);
      writeFileSync(filePath, tilesetToPSD(this.data, this.atlas));
      return;
    }
    mkdirSync(filePath, { recursive: true });
    writeFileSync(path.join(filePath, "tileset.json"), this.def);
    if (this.atlas) {
      writeFileSync(path.join(filePath, "atlas.png"), hmg2pngSync(this.atlas));
    }
  }
}

export class NamedTilesetAsset extends Asset {
  data: any = null;
  pack: NamedTilesetPackAsset | null = null;

  get type() {
    return Asset.Type.JSON;
  }

  async load() {
    this.pack = await this.eastward.loadAsset<NamedTilesetPackAsset>(
      this.node.parent,
    );
    this.data =
      this.pack?.data?.themes.find(
        (theme: any) => theme.name === this.node.name,
      ) || null;
    if (this.data == null) {
      throw new Error(`tileset not found: ${this.node.path}`);
    }
  }

  async toString() {
    return this.data === null ? null : JSON.stringify(this.data);
  }

  async saveFile(filePath: string) {
    if (this.data == null) {
      return;
    }
    this.beforeSave(filePath);
    await fs.writeFile(filePath, JSON.stringify(this.data, null, 2));
  }
}
