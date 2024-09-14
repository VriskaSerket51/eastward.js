import { Asset, AssetNode } from "@/asset/node";
import { Eastward } from "@/eastward";
import { writeFileSync } from "fs";
import fs from "fs/promises";

export class BTScriptAsset extends Asset {
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

export class COMScriptAsset extends Asset {
  script: string | null = null;

  constructor(eastward: Eastward, node: AssetNode) {
    super(eastward, node);
  }

  get type(): string {
    return Asset.Type.Text;
  }

  async toString(): Promise<string | null> {
    return this.script;
  }

  async load() {
    this.script = await this.eastward.loadTextFile(
      this.node.objectFiles!.script
    );
  }

  async saveFile(filePath: string) {
    if (!this.script) {
      return;
    }
    super.beforeSave(filePath);
    await fs.writeFile(filePath, this.script);
  }

  saveFileSync(filePath: string) {
    if (!this.script) {
      return;
    }
    super.beforeSave(filePath);
    writeFileSync(filePath, this.script);
  }
}

export class ShaderScriptAsset extends Asset {
  src: string | null = null;

  constructor(eastward: Eastward, node: AssetNode) {
    super(eastward, node);
  }

  get type(): string {
    return Asset.Type.Text;
  }

  async toString(): Promise<string | null> {
    return this.src;
  }

  async load() {
    this.src = await this.eastward.loadTextFile(this.node.objectFiles!.src);
  }

  async saveFile(filePath: string) {
    if (!this.src) {
      return;
    }
    super.beforeSave(filePath);
    await fs.writeFile(filePath, this.src);
  }

  saveFileSync(filePath: string) {
    if (!this.src) {
      return;
    }
    super.beforeSave(filePath);
    writeFileSync(filePath, this.src);
  }
}
