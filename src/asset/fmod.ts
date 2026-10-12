import { Asset, AssetNode } from "#asset/node";
import { resolveWithin } from "#util/filesystem";
import fs from "node:fs/promises";

/** Built FMOD resources; no native playback or original .fspro reconstruction. */
export class FMODProjectAsset extends Asset {
  config: Record<string, unknown> | null = null;
  resourceRoot = "";
  files: string[] = [];
  banks: string[] = [];

  get type(): string {
    return Asset.Type.JSON;
  }

  async toString(): Promise<string | null> {
    if (this.config === null) {
      return null;
    }

    return JSON.stringify({
      config: this.config,
      files: this.files,
      banks: this.banks,
    });
  }

  async load() {
    this.resourceRoot = this.node.objectFiles?.data ?? "";
    if (!this.resourceRoot) {
      throw new Error("Missing FMOD project resource: " + this.node.path);
    }
    this.config = await this.eastward.loadJSONFile(
      this.resourceRoot + "/fs_project.json",
    );
    if (!this.config) {
      throw new Error("Missing FMOD project configuration: " + this.node.path);
    }
    const entries =
      (await this.eastward.loadDirectory(this.resourceRoot)) ?? [];
    // Archive indices can also contain explicit directory entries.
    const present = await Promise.all(
      entries.map((file) =>
        this.eastward.checkFileExists(this.resourceRoot + "/" + file),
      ),
    );
    this.files = entries.filter((_, index) => present[index]);
    this.banks = this.files.filter((file) => file.endsWith(".bank"));
  }

  async saveFile(directory: string) {
    for (const file of this.files) {
      const data = await this.eastward.loadFile(this.resourceRoot + "/" + file);
      if (data === null) {
        throw new Error("Missing FMOD resource: " + file);
      }
      const target = resolveWithin(directory, file);
      this.beforeSave(target);
      await fs.writeFile(target, data);
    }
  }
}

export class FMODFolderAsset extends Asset {
  items: AssetNode[] = [];

  get type(): string {
    return Asset.Type.JSON;
  }

  async toString(): Promise<string> {
    return JSON.stringify(
      this.items.map((node) => ({
        name: node.name,
        path: node.path,
        type: node.type,
      })),
    );
  }

  async load() {
    this.items = Object.values(this.node.children);
  }

  async saveFile(filePath: string) {
    this.beforeSave(filePath);
    await fs.writeFile(filePath, await this.toString());
  }
}

/** Events and snapshots are references into banks, not individual audio files. */
export class FMODEventAsset extends Asset {
  guid = "";
  eventPath = "";
  projectNode: AssetNode | null = null;

  get type(): string {
    return Asset.Type.JSON;
  }

  async toString(): Promise<string | null> {
    if (this.projectNode === null) {
      return null;
    }

    return JSON.stringify({
      guid: this.guid,
      path: this.eventPath,
      project: this.projectNode.path,
    });
  }

  async load() {
    this.guid = this.node.properties?.guid ?? "";
    this.eventPath = this.node.properties?.path ?? "";
    if (!this.guid || !/^(event|snapshot):\//.test(this.eventPath)) {
      throw new Error("Invalid FMOD event reference: " + this.node.path);
    }
    let parent = this.node.parentNode;
    while (parent && parent.type !== "fs_project") {
      parent = parent.parentNode;
    }
    if (!parent) {
      throw new Error("Missing FMOD event project: " + this.node.path);
    }
    this.projectNode = parent;
  }

  async saveFile(filePath: string) {
    const text = await this.toString();
    if (text === null) {
      return;
    }

    this.beforeSave(filePath);
    await fs.writeFile(filePath, text);
  }
}
