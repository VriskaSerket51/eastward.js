import { Asset, AssetNode } from "#asset/node";
import { Eastward } from "#eastward";
import { decodeHMG, hmg2png, HMG } from "#util/hmg";
import path from "node:path";
import { writeFileSync } from "node:fs";
import fs from "node:fs/promises";

export class Deck2DAsset extends Asset {
  def: string | null = null;
  pack: { decks: any[] } | null = null;

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
    if (this.def) {
      const data = JSON.parse(this.def);
      const body = data.map?.[data.root]?.body;
      if (body?.decks) {
        this.pack = {
          decks: Object.values(body.decks).map(
            (item: any) => item.body || item,
          ),
        };
      }
    }
  }

  async saveFile(filePath: string) {
    if (this.def == null) {
      return;
    }
    super.beforeSave(filePath);
    await fs.writeFile(filePath, this.def);
  }

  saveFileSync(filePath: string) {
    if (this.def == null) {
      return;
    }
    super.beforeSave(filePath);
    writeFileSync(filePath, this.def);
  }
}

type MQuadDeck = {
  meshes: { uv: number[][]; verts: number[][] }[];
  name: string;
  type: string;
  [key: string]: any;
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
  atlas: HMG | null = null;
  normalAtlas: HMG | null = null;

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
    this.pack = await this.eastward.loadJSONFile(
      `${this.node.objectFiles!.export}/decks.json`,
    );
    if (!this.pack) {
      return;
    }
    const raw = await this.eastward.loadFile(
      `${this.node.objectFiles!.export}/decks.hmg`,
    );
    if (!raw) {
      return;
    }
    this.atlas = decodeHMG(raw);
    const normal = await this.eastward.loadFile(
      `${this.node.objectFiles!.export}/decks_n.hmg`,
    );
    this.normalAtlas = normal ? decodeHMG(normal) : null;
  }

  async saveFile(filePath: string) {
    if (!this.pack) {
      return;
    }
    await fs.mkdir(filePath, { recursive: true });
    await fs.writeFile(
      path.join(filePath, "decks.json"),
      JSON.stringify(this.pack, null, 2),
    );
    if (this.atlas) {
      await fs.writeFile(
        path.join(filePath, "decks.png"),
        await hmg2png(this.atlas),
      );
    }
    if (this.normalAtlas) {
      await fs.writeFile(
        path.join(filePath, "decks_n.png"),
        await hmg2png(this.normalAtlas),
      );
    }
  }
}

/** A child deck preserves the complete geometry and references its parent atlas. */
export class DeckPackItemAsset extends Asset {
  data: any = null;
  pack: DeckPackAsset | Deck2DAsset | null = null;

  get type() {
    return Asset.Type.JSON;
  }

  async load() {
    this.pack = await this.eastward.loadAsset<DeckPackAsset | Deck2DAsset>(
      this.node.parent,
    );
    this.data =
      this.pack?.pack?.decks.find((deck) => deck.name === this.node.name) ||
      null;
    if (this.data == null) {
      throw new Error(`deck not found: ${this.node.path}`);
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
