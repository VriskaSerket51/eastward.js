import { Asset, AssetNode } from "#asset/node";
import { FileAsset } from "#asset/file";
import { Eastward } from "#eastward";
import { uint8ArrayToBase64 } from "#util/base64";
import { cropHMG, decodeHMG, HMG, hmg2png, hmg2pngSync } from "#util/hmg";
import { writeFileSync, mkdirSync } from "node:fs";
import fs from "node:fs/promises";
import { resolveWithin } from "#util/filesystem";
import { layersToPSD } from "#util/source-image";

export class TextureAsset extends Asset {
  private static atlasLoads = new WeakMap<object, Promise<HMG[]>>();
  hmg: HMG | null = null;
  info: any = null;

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
    this.info = this.eastward.findTexture(this.node.path);
    if (!this.info) {
      throw new Error(`texture not found: ${this.node.path}`);
    }
    const textureGroup = this.info.parent;
    if (textureGroup.atlasMode) {
      if (!textureGroup.atlasTexturesCache) {
        let pending = TextureAsset.atlasLoads.get(textureGroup);
        if (!pending) {
          pending = (async () => {
            const base = textureGroup.atlasCachePath;
            const data = await this.eastward.loadJSONFile(`${base}/atlas.json`);
            if (!data?.atlases) {
              throw new Error("Missing texture atlas index: " + base);
            }
            const images: HMG[] = [];
            for (const atlasInfo of data.atlases) {
              const pixmap = await this.eastward.loadFile(
                `${base}/${atlasInfo.name}`,
              );
              if (!pixmap) {
                throw new Error("Missing texture atlas: " + atlasInfo.name);
              }
              images.push(decodeHMG(pixmap));
            }
            return images;
          })();
          TextureAsset.atlasLoads.set(textureGroup, pending);
        }
        try {
          textureGroup.atlasTexturesCache = await pending;
        } finally {
          TextureAsset.atlasLoads.delete(textureGroup);
        }
      }
      const atlasId = this.info.atlasId;
      atlasInfo.x = Number(this.info.x);
      atlasInfo.y = Number(this.info.y);
      atlasInfo.w = Number(this.info.w);
      atlasInfo.h = Number(this.info.h);
      this.hmg = textureGroup.atlasTexturesCache[atlasId - 1];
    } else {
      const pixmap = await this.eastward.loadFile(
        this.node.objectFiles!.pixmap,
      );
      if (pixmap) {
        this.hmg = decodeHMG(pixmap);
      }
    }
    if (!this.hmg) {
      return;
    }
    if (atlasInfo.w != 0 && atlasInfo.h != 0) {
      this.hmg = cropHMG(this.hmg, atlasInfo);
    }
  }

  getUV() {
    const { u0, v0, u1, v1 } = this.info;

    return {
      u0: Number(u0),
      v0: Number(v0),
      u1: Number(u1),
      v1: Number(v1),
    };
  }

  getSize() {
    const { x, y, w, h } = this.info;

    return {
      x: Number(x),
      y: Number(y),
      w: Number(w),
      h: Number(h),
    };
  }

  getOriginalSize() {
    const { ow, oh } = this.info;

    return {
      ow: Number(ow),
      oh: Number(oh),
    };
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

  /** Editable PNG pixels use straight alpha; the cached atlas stays untouched. */
  toSourceImage(): HMG {
    if (!this.hmg) {
      throw new Error("Missing texture pixels: " + this.node.path);
    }
    const image = { ...this.hmg, data: new Uint8Array(this.hmg.data) };
    if (this.info?.parent?.premultiplyAlpha) {
      for (let i = 0; i < image.data.length; i += 4) {
        const alpha = image.data[i + 3];
        for (let c = 0; c < 3; c++) {
          image.data[i + c] = alpha
            ? Math.min(255, Math.round((image.data[i + c] * 255) / alpha))
            : 0;
        }
      }
    }
    return image;
  }

  saveFileSync(filePath: string) {
    if (!this.hmg) {
      return;
    }
    super.beforeSave(filePath);
    writeFileSync(filePath, hmg2pngSync(this.toSourceImage()));
  }

  async toPNG() {
    if (!this.hmg) {
      return null;
    }
    return await hmg2png(this.toSourceImage());
  }

  toBMP() {
    if (!this.hmg) {
      return null;
    }
    const { width, height, data: raw } = this.toSourceImage();
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

    const result = new Uint8Array(fileSize);
    result.set(fHeader, 0);
    result.set(dHeader, fileHeaderSize);
    for (let i = 0; i < raw.byteLength; i += 4) {
      const offset = headerSize + i;
      result[offset] = raw[i + 2];
      result[offset + 1] = raw[i + 1];
      result[offset + 2] = raw[i];
      result[offset + 3] = raw[i + 3];
    }
    return result;
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
    if (this.data == null) {
      return;
    }
    super.beforeSave(filePath);
    await fs.writeFile(filePath, this.data);
  }

  saveFileSync(filePath: string) {
    if (this.data == null) {
      return;
    }
    super.beforeSave(filePath);
    writeFileSync(filePath, this.data);
  }
}

/** A PSD layer package: the deployed images live in its texture children. */
export class TexturePackAsset extends Asset {
  textures: TextureAsset[] = [];

  get type(): string {
    return Asset.Type.JSON;
  }

  async toString(): Promise<string> {
    return JSON.stringify(
      this.textures.map((texture) => ({
        name: texture.node.name,
        path: texture.node.path,
      })),
    );
  }

  async load() {
    const textures = await Promise.all(
      Object.values(this.node.children)
        .filter((node) => node.type === "texture")
        .map((node) => this.eastward.loadAsset<TextureAsset>(node.path)),
    );
    if (textures.some((texture) => texture === null)) {
      throw new Error("Missing texture pack child: " + this.node.path);
    }
    this.textures = textures as TextureAsset[];
  }

  private toPSD(): Uint8Array {
    if (!this.textures.length) {
      throw new Error("No texture pack children");
    }
    return layersToPSD(
      this.textures.map((texture) => ({
        name: texture.node.name,
        image: texture.toSourceImage(),
      })),
    );
  }

  async saveFile(filePath: string) {
    if (/\.psd$/i.test(filePath)) {
      const bytes = this.toPSD();
      this.beforeSave(filePath);
      await fs.writeFile(filePath, bytes);
      return;
    }
    await fs.mkdir(filePath, { recursive: true });
    for (const texture of this.textures) {
      const output = resolveWithin(filePath, texture.node.name + ".png");
      this.beforeSave(output);
      await fs.writeFile(output, await hmg2png(texture.toSourceImage()));
    }
  }

  saveFileSync(filePath: string) {
    if (/\.psd$/i.test(filePath)) {
      const bytes = this.toPSD();
      this.beforeSave(filePath);
      writeFileSync(filePath, bytes);
      return;
    }
    mkdirSync(filePath, { recursive: true });
    for (const texture of this.textures) {
      const output = resolveWithin(filePath, texture.node.name + ".png");
      this.beforeSave(output);
      writeFileSync(output, hmg2pngSync(texture.toSourceImage()));
    }
  }
}

/** Editor-only Python source, preserved as bytes when a source is supplied. */
export class TextureProcessorAsset extends FileAsset {}
