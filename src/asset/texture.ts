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
    const fHeader = new Uint8Array(fileHeaderSize);
    const fileHeader = new DataView(fHeader.buffer);
    fileHeader.setUint8(0, "B".charCodeAt(0)); // Signature
    fileHeader.setUint8(0, "B".charCodeAt(0)); // Signature
    fileHeader.setUint32(2, fileSize, true); // File size
    fileHeader.setUint32(6, 0, true); // Reserved
    fileHeader.setUint32(10, headerSize, true); // Pixel data offset

    // DIB Header (BITMAPINFOHEADER)
    const dHeader = new Uint8Array(dibHeaderSize);
    const dibHeader = new DataView(dHeader.buffer);
    dibHeader.setUint32(0, dibHeaderSize, true); // DIB header size
    dibHeader.setInt32(4, width, true); // Width
    dibHeader.setInt32(8, -height, true); // Height (negative for top-down bitmap)
    dibHeader.setUint16(12, 1, true); // Color planes
    dibHeader.setUint16(14, 32, true); // Bits per pixel (32 for RGBA)
    dibHeader.setUint32(16, 0, true); // Compression method (0 = BI_RGB, no compression)
    dibHeader.setUint32(20, pixelArraySize, true); // Image size (may be 0 for BI_RGB)
    dibHeader.setInt32(24, 0, true); // Horizontal resolution (pixels per meter)
    dibHeader.setInt32(28, 0, true); // Vertical resolution (pixels per meter)
    dibHeader.setUint32(32, 0, true); // Number of colors in the palette
    dibHeader.setUint32(36, 0, true); // Important colors (0 = all colors are important)

    for (let i = 0; i < raw.byteLength; i += 4) {
      const tmp = raw[i];
      raw[i] = raw[i + 2];
      raw[i + 2] = tmp;
    }

    // Combine headers and pixel data into one buffer
    return new Uint8Array([...fHeader, ...dHeader, ...raw]);
  }
}
