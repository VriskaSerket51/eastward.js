import { Asset, AssetNode } from "@/asset/node";
import { Eastward } from "@/eastward";
import { uint8ArrayToBase64 } from "@/util/base64";
import { decodeHMG, HMG, hmg2png } from "@/util/hmg";
import { writeFileSync } from "fs";
import fs from "fs/promises";

export class TextureAsset extends Asset {
  hmg: HMG | null = null;

  constructor(eastward: Eastward, node: AssetNode) {
    super(eastward, node);
  }

  get type(): string {
    return Asset.Type.Image;
  }

  async toString(): Promise<string | null> {
    return await this.toPNGBase64();
  }

  async load() {
    let atlasInfo = { x: 0, y: 0, w: 0, h: 0 };
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
          const pixmap = await this.eastward.loadFile(`${base}/${texpath}`);
          atlasTexturesCache.push(pixmap && decodeHMG(pixmap));
        }
        textureGroup.atlasTexturesCache = atlasTexturesCache;
      }
      const atlasId = texture.atlasId;
      atlasInfo.x = Number(texture.x);
      atlasInfo.y = Number(texture.y);
      atlasInfo.w = Number(texture.w);
      atlasInfo.h = Number(texture.h);
      this.hmg = textureGroup.atlasTexturesCache[atlasId - 1];
    } else {
      const pixmap = await this.eastward.loadFile(
        this.node.objectFiles!.pixmap
      );
      if (pixmap) {
        this.hmg = decodeHMG(pixmap);
      }
    }
    if (!this.hmg) {
      return;
    }
    if (atlasInfo.w != 0 && atlasInfo.h != 0) {
      const { x, y, w: width, h: height } = atlasInfo;
      const data = new Uint8Array(width * height * 4);

      for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
          const sourceIndex = ((y + row) * this.hmg.width + (x + col)) * 4;
          const destIndex = (row * width + col) * 4;

          data[destIndex] = this.hmg.data[sourceIndex]; // R
          data[destIndex + 1] = this.hmg.data[sourceIndex + 1]; // G
          data[destIndex + 2] = this.hmg.data[sourceIndex + 2]; // B
          data[destIndex + 3] = this.hmg.data[sourceIndex + 3]; // A
        }
      }

      this.hmg = {
        width,
        height,
        data,
      };
    }
  }

  async saveFile(filePath: string) {
    if (!this.hmg) {
      return;
    }
    super.beforeSave(filePath);
    const data = await this.toPNG();
    if (!data) {
      return;
    }
    await fs.writeFile(filePath, data);
  }

  saveFileSync(filePath: string) {
    if (!this.hmg) {
      return;
    }
    super.beforeSave(filePath);
    const { width, height, data } = this.hmg;
  }

  async toPNG() {
    if (!this.hmg) {
      return null;
    }
    return await hmg2png(this.hmg);
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
    fileHeader.setUint8(1, "M".charCodeAt(0)); // Signature
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

  toBMPBase64() {
    const buffer = this.toBMP();
    if (!buffer) {
      return null;
    }
    return uint8ArrayToBase64(buffer);
  }

  async toPNGBase64() {
    const buffer = await this.toPNG();
    if (!buffer) {
      return null;
    }
    return uint8ArrayToBase64(buffer);
  }
}

export class LutTextureAsset extends Asset {
  texture: Uint8Array | null = null;

  constructor(eastward: Eastward, node: AssetNode) {
    super(eastward, node);
  }

  get type(): string {
    return Asset.Type.Image;
  }

  async toString(): Promise<string | null> {
    if (!this.texture) {
      return null;
    }
    return uint8ArrayToBase64(this.texture);
  }

  async load() {
    this.texture = await this.eastward.loadFile(this.node.objectFiles!.texture);
  }

  async saveFile(filePath: string) {
    if (!this.texture) {
      return;
    }
    super.beforeSave(filePath);
    await fs.writeFile(filePath, this.texture);
  }

  saveFileSync(filePath: string) {
    if (!this.texture) {
      return;
    }
    super.beforeSave(filePath);
    writeFileSync(filePath, this.texture);
  }
}

export class MultiTextureAsset extends Asset {
  data: string | null = null;

  constructor(eastward: Eastward, node: AssetNode) {
    super(eastward, node);
  }

  get type(): string {
    return Asset.Type.Text;
  }

  async toString(): Promise<string | null> {
    return this.data;
  }

  async load() {
    this.data = await this.eastward.loadTextFile(this.node.objectFiles!.data);
  }

  async saveFile(filePath: string) {
    if (!this.data) {
      return;
    }
    super.beforeSave(filePath);
    await fs.writeFile(filePath, this.data);
  }

  saveFileSync(filePath: string) {
    if (!this.data) {
      return;
    }
    super.beforeSave(filePath);
    writeFileSync(filePath, this.data);
  }
}
