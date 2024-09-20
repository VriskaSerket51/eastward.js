import { Asset, AssetNode } from "@/asset/node";
import { Eastward } from "@/eastward";
import { cropHMG, decodeHMG, hmg2png } from "@/util/hmg";
import { writeFileSync } from "fs";
import fs from "fs/promises";

export class Deck2DAsset extends Asset {
  def: string | null = null;

  constructor(eastward: Eastward, node: AssetNode) {
    super(eastward, node);
  }

  get type(): string {
    return Asset.Type.Text;
  }

  async toString(): Promise<string | null> {
    return this.def;
  }

  async load() {
    this.def = await this.eastward.loadTextFile(this.node.objectFiles!.def);
  }

  async saveFile(filePath: string) {
    if (!this.def) {
      return;
    }
    super.beforeSave(filePath);
    await fs.writeFile(filePath, this.def);
  }

  saveFileSync(filePath: string) {
    if (!this.def) {
      return;
    }
    super.beforeSave(filePath);
    writeFileSync(filePath, this.def);
  }
}

type MQuadDeck = {
  meshes: { uv: number[][]; verts: number[][] }[];
  name: string;
  type: "deck2d.mquad";
};

type DeckPack = {
  atlas: {
    w: number;
    h: number;
  };
  decks: MQuadDeck[];
};

export class DeckPackAsset extends Asset {
  pack: DeckPack | null = null;

  constructor(eastward: Eastward, node: AssetNode) {
    super(eastward, node);
  }

  get type(): string {
    return Asset.Type.JSON;
  }

  async toString(): Promise<string | null> {
    return JSON.stringify(this.pack);
  }

  async load() {
    // TODO
    this.pack = await this.eastward.loadJSONFile(
      `${this.node.objectFiles!.export}/decks.json`
    );
    if (!this.pack) {
      return;
    }
    const raw = await this.eastward.loadFile(
      `${this.node.objectFiles!.export}/decks.hmg`
    );
    if (!raw) {
      return;
    }
    const atlas = decodeHMG(raw);
    for (const deck of this.pack.decks) {
    }
  }

  async saveFile(filePath: string) {
    // if (!this.export) {
    //   return;
    // }
    // super.beforeSave(filePath);
    // await fs.writeFile(filePath, this.export);
  }
}
