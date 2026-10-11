import { Asset, AssetNode } from "#asset/node";
import { Eastward } from "#eastward";
import { writeFileSync } from "node:fs";
import fs from "node:fs/promises";
import path from 'node:path';
import { decodeHMG, hmg2png, png2hmg, HMG } from '#util/hmg';

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
    if (!this.data) {
      return;
    }
    super.beforeSave(filePath);
    await fs.writeFile(filePath, this.data);
  }

  saveFileSync(filePath: string) {
    if (!this.data) {
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
    this.atlas = raw ? (raw[0] === 0x89 && raw[1] === 0x50 ? await png2hmg(raw) : decodeHMG(raw)) : null;
  }

  async saveFile(filePath: string) {
    if (!this.def) {
      return;
    }
    await fs.mkdir(filePath, { recursive: true });
    await fs.writeFile(path.join(filePath, 'tileset.json'), this.def);
    if (this.atlas) await fs.writeFile(path.join(filePath, 'atlas.png'), await hmg2png(this.atlas));
  }

  saveFileSync(filePath: string) {
    if (!this.def) {
      return;
    }
    super.beforeSave(filePath);
    writeFileSync(filePath, this.def);
  }
}

export class NamedTilesetAsset extends Asset {
  data: any = null;
  pack: NamedTilesetPackAsset | null = null;
  get type() { return Asset.Type.JSON; }
  async load() {
    this.pack = await this.eastward.loadAsset<NamedTilesetPackAsset>(this.node.parent);
    this.data = this.pack?.data?.themes.find((theme: any) => theme.name === this.node.name) || null;
    if (!this.data) throw new Error(`tileset not found: ${this.node.path}`);
  }
  async toString() { return JSON.stringify(this.data); }
  async saveFile(filePath: string) {
    if (!this.data) return;
    this.beforeSave(filePath);
    await fs.writeFile(filePath, JSON.stringify(this.data, null, 2));
  }
}
