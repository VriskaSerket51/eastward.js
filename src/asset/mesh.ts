import { Asset, AssetNode } from "@/asset/node";
import { Eastward } from "@/eastward";
import { xml2mesh } from "@/util/mesh";
import fs from "fs/promises";
import path from "path";

export class MeshAsset extends Asset {
  mesh: { obj: string; mtl: string; tex: string[] } | null = null;

  constructor(eastward: Eastward, node: AssetNode) {
    super(eastward, node);
  }

  get type(): string {
    return Asset.Type.JSON;
  }

  async toString(): Promise<string | null> {
    if (!this.mesh) {
      return null;
    }
    return JSON.stringify(this.mesh);
  }

  async load() {
    const meshXml = await this.eastward.loadTextFile(
      `${this.node.objectFiles!.mesh}/mesh`
    );
    if (!meshXml) {
      return;
    }

    this.mesh = await xml2mesh(meshXml);
  }

  async saveFile(filePath: string) {
    if (!this.mesh) {
      return;
    }
    const { obj, mtl, tex } = this.mesh;
    super.beforeSave(path.join(filePath, "template"));
    const objOp = fs.writeFile(path.join(filePath, "output.obj"), obj);
    const mtlOp = fs.writeFile(path.join(filePath, "output.mtl"), mtl);
    const texOp = tex.map(async (tex) => {
      const texture = await this.eastward.loadFile(
        `${this.node.objectFiles!.mesh}/${tex}`
      );
      if (texture) {
        await fs.writeFile(path.join(filePath, tex), texture);
      }
    });
    await Promise.allSettled([objOp, mtlOp, ...texOp]);
  }
}
