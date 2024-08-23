import { Asset, AssetNode } from "@/asset/node";
import { Eastward } from "@/eastward";
import { decodeHMG } from "@/util/hmg";
import Jimp from "jimp";

export class TextureAsset extends Asset {
  hmg;

  constructor(eastward: Eastward, node: AssetNode) {
    super(eastward, node);
    if (!node.objectFiles) {
      return;
    }
    const pixmap = eastward.loadFile(node.objectFiles.pixmap);
    if (!pixmap) {
      return;
      // throw new Error(`null pixmap at ${node.path}`);
    }
    this.hmg = decodeHMG(pixmap);
  }

  async saveFile(filePath: string) {
    if (!this.hmg) {
      return;
    }
    const { width, height, data } = this.hmg;
    const image = await new Promise<Jimp>((resolve, reject) => {
      new Jimp({ data, width, height }, (err, image) => {
        if (err) {
          reject(err);
        }
        resolve(image);
      });
    });
    await image.writeAsync(filePath);
  }

  saveFileSync(filePath: string) {
    if (!this.hmg) {
      return;
    }
    const { width, height, data } = this.hmg;
    new Jimp({ data, width, height }, (err, image) => {
      if (err) {
        console.log(err);
      }
      if (!err && image) {
        image.write(filePath);
      }
    });
  }
}
