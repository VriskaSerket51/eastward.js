import { Asset, AssetNode } from "@/asset/node";
import { Eastward } from "@/eastward";
import { decodeHMG, HMG } from "@/util/hmg";

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
    const sharp = (await import("sharp")).default;
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

  toBMP() {
    if (!this.hmg) {
      return null;
    }
    const { width, height, data: raw } = this.hmg;
    const fileHeaderSize = 14;
    const dibHeaderSize = 40;
    const headerSize = fileHeaderSize + dibHeaderSize;
    const pixelArraySize = width * height * 4; // 4 bytes per pixel (RGBA)
    const fileSize = headerSize + pixelArraySize;

    // BMP File Header
    const fileHeader = Buffer.alloc(fileHeaderSize);
    fileHeader.write("BM"); // Signature
    fileHeader.writeUInt32LE(fileSize, 2); // File size
    fileHeader.writeUInt32LE(0, 6); // Reserved
    fileHeader.writeUInt32LE(headerSize, 10); // Pixel data offset

    // DIB Header (BITMAPINFOHEADER)
    const dibHeader = Buffer.alloc(dibHeaderSize);
    dibHeader.writeUInt32LE(dibHeaderSize, 0); // DIB header size
    dibHeader.writeInt32LE(width, 4); // Width
    dibHeader.writeInt32LE(-height, 8); // Height (negative for top-down bitmap)
    dibHeader.writeUInt16LE(1, 12); // Color planes
    dibHeader.writeUInt16LE(32, 14); // Bits per pixel (32 for RGBA)
    dibHeader.writeUInt32LE(0, 16); // Compression method (0 = BI_RGB, no compression)
    dibHeader.writeUInt32LE(pixelArraySize, 20); // Image size (may be 0 for BI_RGB)
    dibHeader.writeInt32LE(0, 24); // Horizontal resolution (pixels per meter)
    dibHeader.writeInt32LE(0, 28); // Vertical resolution (pixels per meter)
    dibHeader.writeUInt32LE(0, 32); // Number of colors in the palette
    dibHeader.writeUInt32LE(0, 36); // Important colors (0 = all colors are important)

    for (let i = 0; i < raw.byteLength; i += 4) {
      const tmp = raw[i];
      raw[i] = raw[i + 2];
      raw[i + 2] = tmp;
    }

    // Combine headers and pixel data into one buffer
    return Buffer.concat([fileHeader, dibHeader, raw]);
  }
}
