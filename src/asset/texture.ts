import { Asset, AssetNode } from "@/asset/node";
import { Eastward } from "@/eastward";
import { decodeHMG, HMG } from "@/util/hmg";
import sharp from "sharp";

export class TextureAsset extends Asset {
  hmg: HMG | null = null;

  constructor(eastward: Eastward, node: AssetNode) {
    super(eastward, node);
  }

  async load() {
    let pixmap;
    const texture = this.eastward.findTexture(this.node.path);
    if (!texture) {
      throw new Error(this.node.path);
    }
    const textureGroup = texture.parent;
    if (textureGroup.atlasMode) {
      if (!textureGroup.atlasTexturesCache) {
        const base = textureGroup.atlasCachePath;
        const configPath = `${base}/atlas.json`;
        const data = await this.eastward.loadJSONFile(configPath);
        const atlasTexturesCache = [];
        for (const atlasInfo of data.atlases) {
          const texpath = atlasInfo.name;
          atlasTexturesCache.push(
            await this.eastward.loadFile(`${base}/${texpath}`)
          );
        }
        textureGroup.atlasTexturesCache = atlasTexturesCache;
      }
      const atlasId = texture.atlasId;
      pixmap = textureGroup.atlasTexturesCache[atlasId - 1];
    } else {
      pixmap = await this.eastward.loadFile(this.node.objectFiles.pixmap);
    }
    if (!pixmap) {
      // console.error(`null pixmap at ${node.path}`);
      return;
    }
    this.hmg = decodeHMG(pixmap);
  }

  async saveFile(filePath: string) {
    if (!this.hmg) {
      return;
    }
    super.beforeSave(filePath);
    const { width, height, data } = this.hmg;
    await sharp(data, { raw: { width, height, channels: 4 } })
      .png()
      .toFile(filePath);
    // const image = await new Promise<Jimp>((resolve, reject) => {
    //   new Jimp({ data, width, height }, (err, image) => {
    //     if (err) {
    //       reject(err);
    //     }
    //     resolve(image);
    //   });
    // });
    // await image.writeAsync(filePath);
  }

  saveFileSync(filePath: string) {
    if (!this.hmg) {
      return;
    }
    super.beforeSave(filePath);
    const { width, height, data } = this.hmg;
    // const image = new Jimp({ data, width, height });
    // image.write(filePath);
  }
}
