import { Buffer } from "node:buffer";
import { deflateSync } from "node:zlib";
import { cropHMG, type HMG } from "#util/hmg";
import { spriteModuleAtlas } from "#util/sprite";

/** A flattened RGB PSD with an alpha channel; discarded editing layers are not invented. */
export function imageToPSD(image: HMG): Uint8Array {
  const { width, height, data } = image;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width > 30000 ||
    height > 30000 ||
    data.length !== width * height * 4
  ) {
    throw new Error("Invalid PSD image");
  }
  const header = Buffer.alloc(40);
  header.write("8BPS");
  header.writeUInt16BE(1, 4);
  header.writeUInt16BE(4, 12);
  header.writeUInt32BE(height, 14);
  header.writeUInt32BE(width, 18);
  header.writeUInt16BE(8, 22);
  header.writeUInt16BE(3, 24);
  // Empty color data, resources and layer/mask section; raw merged image follows.
  const planes = Buffer.alloc(width * height * 4);
  for (let channel = 0; channel < 4; channel++) {
    for (let i = 0; i < width * height; i++) {
      planes[channel * width * height + i] = data[i * 4 + channel];
    }
  }
  return Buffer.concat([header, planes]);
}

export type PSDSourceLayer = {
  name: string;
  x?: number;
  y?: number;
  image?: HMG;
  children?: PSDSourceLayer[];
};

export function tilesetToPSD(data: any, atlas: HMG): Uint8Array {
  return layersToPSD(
    data.themes.map((theme: any) => ({
      name: theme.raw_name,
      children: theme.groups.map((group: any) => ({
        name: group.raw_name,
        children: [...group.tiles]
          .sort((a: any, b: any) => b.raw_index - a.raw_index)
          .map((tile: any) => {
            const [x, y, w, h] = tile.rect,
              [left, top, right, bottom] = tile.raw_rect;
            if (right - left !== w || bottom - top !== h) {
              throw new Error("Tileset source and atlas dimensions differ");
            }
            return {
              name: tile.basename,
              x: left,
              y: top,
              image: cropHMG(atlas, { x, y, w, h }),
            };
          }),
      })),
    })),
  );
}

/** Derived editing layers, with PSD section dividers and exact RGBA channels. */
export function layersToPSD(layers: PSDSourceLayer[]): Uint8Array {
  const entries: { layer: PSDSourceLayer; divider?: number }[] = [];
  let width = 1,
    height = 1;
  const collect = (items: PSDSourceLayer[]) => {
    for (const layer of items) {
      if (layer.children) {
        entries.push({ layer, divider: 1 });
        collect(layer.children);
        entries.push({ layer: { name: "</Layer group>" }, divider: 3 });
      } else {
        if (!layer.image) {
          throw new Error("Missing PSD layer pixels");
        }
        imageToPSD(layer.image); // Validate dimensions and buffer length.
        const x = layer.x ?? 0,
          y = layer.y ?? 0;
        if (!Number.isInteger(x) || !Number.isInteger(y)) {
          throw new Error("Invalid PSD layer position");
        }
        width = Math.max(width, x + layer.image.width);
        height = Math.max(height, y + layer.image.height);
        entries.push({ layer });
      }
    }
  };
  collect(layers);
  if (
    !entries.length ||
    entries.length > 32767 ||
    width > 30000 ||
    height > 30000
  ) {
    throw new Error("Unsupported PSD layer document size");
  }
  const u32 = (n: number) => {
    const b = Buffer.alloc(4);
    b.writeUInt32BE(n);
    return b;
  };
  const tagged = (key: string, data: Buffer) =>
    Buffer.concat([
      Buffer.from("8BIM" + key),
      u32(data.length),
      data,
      Buffer.alloc(data.length % 2),
    ]);
  const records: Buffer[] = [],
    channels: Buffer[] = [];
  // PSD stores bottom layers first; Gii reverses them into display order.
  for (const { layer, divider } of entries.reverse()) {
    const image = layer.image,
      x = layer.x ?? 0,
      y = layer.y ?? 0;
    const n = image ? image.width * image.height : 0;
    const geometry = Buffer.alloc(18);
    geometry.writeInt32BE(image ? y : 0);
    geometry.writeInt32BE(image ? x : 0, 4);
    geometry.writeInt32BE(image ? y + image.height : 0, 8);
    geometry.writeInt32BE(image ? x + image.width : 0, 12);
    geometry.writeUInt16BE(image ? 4 : 0, 16);
    const descriptors: Buffer[] = [];
    if (image) {
      for (let c = 0; c < 4; c++) {
        const descriptor = Buffer.alloc(6);
        descriptor.writeInt16BE(c === 3 ? -1 : c);
        descriptor.writeUInt32BE(n + 2, 2);
        descriptors.push(descriptor);
        const pixels = Buffer.alloc(n + 2);
        for (let i = 0; i < n; i++) {
          pixels[i + 2] = image.data[i * 4 + c];
        }
        channels.push(pixels);
      }
    }
    const name = Buffer.from(layer.name, "utf8").subarray(0, 255);
    const pascal = Buffer.alloc(Math.ceil((name.length + 1) / 4) * 4);
    pascal[0] = name.length;
    name.copy(pascal, 1);
    const unicode = Buffer.alloc(4 + layer.name.length * 2);
    unicode.writeUInt32BE(layer.name.length);
    for (let i = 0; i < layer.name.length; i++) {
      unicode.writeUInt16BE(layer.name.charCodeAt(i), 4 + i * 2);
    }
    const extra = Buffer.concat([
      Buffer.alloc(8),
      pascal,
      tagged("luni", unicode),
      ...(divider ? [tagged("lsct", u32(divider))] : []),
    ]);
    records.push(
      Buffer.concat([
        geometry,
        ...descriptors,
        Buffer.from("8BIMnorm"),
        Buffer.from([255, 0, 0, 0]),
        u32(extra.length),
        extra,
      ]),
    );
  }
  const count = Buffer.alloc(2);
  count.writeInt16BE(records.length);
  let info = Buffer.concat([count, ...records, ...channels]);
  if (info.length % 2) {
    info = Buffer.concat([info, Buffer.alloc(1)]);
  }
  const section = Buffer.concat([u32(info.length), info, Buffer.alloc(4)]);
  const merged = Buffer.from(
    imageToPSD({ width, height, data: new Uint8Array(width * height * 4) }),
  );
  return Buffer.concat([
    merged.subarray(0, 34),
    u32(section.length),
    section,
    merged.subarray(38),
  ]);
}

const chunk = (type: number, body: Buffer) => {
  const header = Buffer.alloc(6);
  header.writeUInt32LE(body.length + 6);
  header.writeUInt16LE(type, 4);
  return Buffer.concat([header, body]);
};
const string = (value: string) => {
  const bytes = Buffer.from(value);
  const size = Buffer.alloc(2);
  size.writeUInt16LE(bytes.length);
  return Buffer.concat([size, bytes]);
};

/** One animation per ASE file; module parts remain separate feature-labelled layers. */
export function animationToASE(
  def: any,
  animation: any,
  atlas: HMG | Record<string, HMG>,
  tags: { name: string; from: number; to: number }[] = [],
): Uint8Array {
  if (!animation.seq.length || animation.seq.length > 65535) {
    throw new Error("Invalid ASE frame count");
  }
  let minX = 0,
    minY = 0,
    maxX = 1,
    maxY = 1;
  const frames = animation.seq.map((entry: any[]) => {
    const frame = def.frames[entry[0]];
    if (!frame) {
      throw new Error("Missing sprite frame: " + entry[0]);
    }
    const parts = frame.parts.map((part: any[]) => {
      const module = def.modules[part[0]];
      if (!module) {
        throw new Error("Missing sprite module: " + part[0]);
      }
      const [x, y, w, h] = module.rect;
      const px = part[1] + (entry[2] ?? 0),
        py = part[2] + (entry[3] ?? 0);
      minX = Math.min(minX, px);
      minY = Math.min(minY, py);
      maxX = Math.max(maxX, px + w);
      maxY = Math.max(maxY, py + h);
      return {
        image: cropHMG(
          "data" in atlas
            ? (atlas as HMG)
            : spriteModuleAtlas(atlas as Record<string, HMG>, module.atlas),
          { x, y, w, h },
        ),
        x: px,
        y: py,
        feature: module.feature,
      };
    });
    const duration = Math.round(entry[1] * 1000);
    if (!Number.isInteger(duration) || duration < 0 || duration > 65535) {
      throw new Error("Unsupported ASE frame duration");
    }
    return { parts, duration, anchors: frame.meta?.anchors ?? {} };
  });
  const width = maxX - minX,
    height = maxY - minY;
  if (width > 32767 || height > 32767) {
    throw new Error("ASE canvas too large");
  }
  const featureName = (id: number) =>
    def.features?.find((f: any) => f.id === id)?.name ?? "";
  // Separate each part position AND feature: changing a feature never changes another layer.
  const layers: string[] = [
    ...new Set<string>(
      frames.flatMap((frame: any) =>
        frame.parts.map(
          (part: any, index: number) => index + ":" + part.feature,
        ),
      ),
    ),
  ].sort((a, b) => Number(a.split(":")[0]) - Number(b.split(":")[0]));
  const layerChunks: Buffer[] = [],
    layerIndices = new Map<string, number>();
  const addLayer = (name: string, level = 0, group = false) => {
    const index = layerChunks.length,
      body = Buffer.alloc(16);
    body.writeUInt16LE(3);
    body.writeUInt16LE(group ? 1 : 0, 2);
    body.writeUInt16LE(level, 4);
    body[12] = 255;
    layerChunks.push(chunk(0x2004, Buffer.concat([body, string(name)])));
    return index;
  };
  for (const [index, key] of layers.entries()) {
    const feature = featureName(Number(key.split(":")[1])),
      parts = feature.split(".");
    if (feature) {
      for (let level = 0; level < parts.length - 1; level++) {
        addLayer("#" + parts[level], level, true);
      }
    }
    layerIndices.set(
      key,
      addLayer(
        feature ? "#" + parts.at(-1) : "part_" + index,
        feature ? parts.length - 1 : 0,
      ),
    );
  }
  const originLayerIndex = addLayer("@origin");
  const anchorLayers = new Map<string, number>();
  for (const frame of frames) {
    for (const name of Object.keys(frame.anchors)) {
      if (!anchorLayers.has(name)) {
        anchorLayers.set(name, addLayer("@anchor:" + name));
      }
    }
  }
  const cel = (layer: number, x: number, y: number, image: HMG) => {
    const body = Buffer.alloc(20);
    body.writeUInt16LE(layer);
    body.writeInt16LE(x, 2);
    body.writeInt16LE(y, 4);
    body[6] = 255;
    body.writeUInt16LE(2, 7);
    body.writeUInt16LE(image.width, 16);
    body.writeUInt16LE(image.height, 18);
    return chunk(0x2005, Buffer.concat([body, deflateSync(image.data)]));
  };
  if (tags.length) {
    const body = Buffer.alloc(10);
    body.writeUInt16LE(tags.length);
    const entries = tags.map((tag) => {
      const entry = Buffer.alloc(17);
      entry.writeUInt16LE(tag.from);
      entry.writeUInt16LE(tag.to, 2);
      return Buffer.concat([entry, string(tag.name)]);
    });
    layerChunks.push(chunk(0x2018, Buffer.concat([body, ...entries])));
  }
  const encodedFrames = frames.map((frame: any, index: number) => {
    const chunks = index === 0 ? [...layerChunks] : [];
    for (let p = 0; p < frame.parts.length; p++) {
      const part = frame.parts[p];
      chunks.push(
        cel(
          layerIndices.get(p + ":" + part.feature)!,
          part.x - minX,
          part.y - minY,
          part.image,
        ),
      );
    }
    // Gii takes the marker's bottom edge as origin Y.
    chunks.push(
      cel(originLayerIndex, -minX, -minY - 1, {
        width: 1,
        height: 1,
        data: Uint8Array.of(255, 255, 255, 255),
      }),
    );
    for (const [name, points] of Object.entries<any>(frame.anchors)) {
      if (!points?.length) {
        continue;
      }
      const left = Math.min(...points.map((p: any) => p[0])),
        top = Math.min(...points.map((p: any) => p[1]));
      const w = Math.max(...points.map((p: any) => p[0])) - left + 1,
        h = Math.max(...points.map((p: any) => p[1])) - top + 1;
      const data = new Uint8Array(w * h * 4);
      for (const [x, y, color] of points) {
        const offset = ((y - top) * w + x - left) * 4;
        data.set(
          [
            parseInt(color.slice(1, 3), 16),
            parseInt(color.slice(3, 5), 16),
            parseInt(color.slice(5, 7), 16),
            255,
          ],
          offset,
        );
      }
      chunks.push(
        cel(anchorLayers.get(name)!, left - minX, top - minY, {
          width: w,
          height: h,
          data,
        }),
      );
    }
    const header = Buffer.alloc(16);
    header.writeUInt32LE(16 + chunks.reduce((sum, b) => sum + b.length, 0));
    header.writeUInt16LE(0xf1fa, 4);
    header.writeUInt16LE(chunks.length, 6);
    header.writeUInt16LE(frame.duration, 8);
    return Buffer.concat([header, ...chunks]);
  });
  const header = Buffer.alloc(128);
  header.writeUInt32LE(
    128 + encodedFrames.reduce((sum: number, b: Buffer) => sum + b.length, 0),
  );
  header.writeUInt16LE(0xa5e0, 4);
  header.writeUInt16LE(frames.length, 6);
  header.writeUInt16LE(width, 8);
  header.writeUInt16LE(height, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(1, 14);
  header.writeUInt16LE(100, 18);
  header[34] = 1;
  header[35] = 1;
  return Buffer.concat([header, ...encodedFrames]);
}
