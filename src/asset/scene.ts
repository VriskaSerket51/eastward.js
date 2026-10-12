import { Asset, AssetNode } from "#asset/node";
import { Eastward } from "#eastward";
import fs from "node:fs/promises";
import path from "node:path";

export class SceneAsset extends Asset {
  index: any = null;
  groups: { [key: string]: any } | undefined = undefined;

  constructor(eastward: Eastward, node: AssetNode) {
    super(eastward, node);
  }

  get type(): string {
    return Asset.Type.JSON;
  }

  async toString(): Promise<string | null> {
    if (!this.index) {
      return null;
    }
    return JSON.stringify({ index: this.index, groups: this.groups });
  }

  async load() {
    const scenePath = this.node.objectFiles!.def;
    const compiledPath = this.node.objectFiles!.compiled;

    if (await this.eastward.checkFileExists(`${scenePath}/scene_index.json`)) {
      this.index = await this.eastward.loadJSONFile(
        `${scenePath}/scene_index.json`,
      );
      const files = await this.eastward.loadDirectory(scenePath);
      if (files) {
        const groups = files.filter(
          (file) =>
            !file.includes("/") &&
            !file.includes("\\") &&
            file.endsWith(".scene_group"),
        );
        if (groups.length > 0) {
          this.groups = {};
          for (const groupName of groups) {
            let group = await this.eastward.loadJSONFile(
              `${scenePath}/${groupName}`,
            );
            if (!group) {
              group = await this.eastward.loadMsgPackFile(
                `${compiledPath}/${groupName}.packed`,
              );
            }
            if (!group) {
              throw new Error(`cannot find group: ${groupName}`);
            }

            this.groups[groupName] = group;
          }
        }
      }
    } else if (await this.eastward.checkFileExists(scenePath)) {
      this.index = await this.eastward.loadJSONFile(scenePath);
    } else if (
      compiledPath &&
      (await this.eastward.checkFileExists(
        `${compiledPath}/scene_index.json.packed`,
      ))
    ) {
      this.index = await this.eastward.loadMsgPackFile(
        `${compiledPath}/scene_index.json.packed`,
      );
      this.groups = {};
      for (const file of (await this.eastward.loadDirectory(compiledPath)) ??
        []) {
        if (
          !file.includes("/") &&
          !file.includes("\\") &&
          file.endsWith(".scene_group.packed")
        )
          this.groups[file.replace(/\.packed$/, "")] =
            await this.eastward.loadMsgPackFile(`${compiledPath}/${file}`);
      }
    } else {
      throw new Error("scene load unavailable");
    }
  }

  async saveFile(filePath: string) {
    if (!this.index) {
      return;
    }
    if (await this.eastward.checkFileExists(this.node.objectFiles!.def)) {
      super.beforeSave(filePath);
      await fs.writeFile(filePath, JSON.stringify(this.index, null, 2));
      return;
    }
    super.beforeSave(path.join(filePath, "template"));
    // Preserve editor sidecars (including asset_temp PSDs) at their actual paths.
    const scenePath = this.node.objectFiles!.def;
    for (const entry of (await this.eastward.loadDirectory(scenePath)) ?? []) {
      const relative = entry.replace(/\\/g, "/");
      if (
        relative
          .split("/")
          .some((segment) => !segment || segment === "." || segment === "..")
      )
        throw new Error("Unsafe scene file: " + entry);
      if (
        !relative.includes("/") &&
        (relative === "scene_index.json" || relative.endsWith(".scene_group"))
      )
        continue;
      const bytes = await this.eastward.loadFile(scenePath + "/" + relative);
      if (!bytes) continue;
      const target = path.join(filePath, relative);
      super.beforeSave(target);
      await fs.writeFile(target, bytes);
    }
    await fs.writeFile(
      path.join(filePath, "scene_index.json"),
      JSON.stringify(this.index, null, 2),
    );
    if (this.groups) {
      const asyncOps = Object.keys(this.groups).map(async (groupName) => {
        await fs.writeFile(
          path.join(filePath, groupName),
          JSON.stringify(this.groups![groupName], null, 2),
        );
      });

      await Promise.all(asyncOps);
    }
  }
}

export class ScenePortalGraphAsset extends Asset {
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
    if (this.def == null) {
      return;
    }
    super.beforeSave(filePath);
    await fs.writeFile(filePath, this.def);
  }
}
