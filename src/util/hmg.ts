import {
  compressBlock,
  compressBlockBound,
  uncompressBlock,
} from "@rinsuki/lz4-ts";
import { decodePng, encodePng } from "@lunapaint/png-codec";
import { Buffer } from "@/buffer";
import { Rect } from "@/type";

export type HMG = {
  width: number;
  height: number;
  data: Uint8Array;
};

export function emptyHMG(width: number, height: number) {
  const data = new Uint8Array(width * height * 4);
  return {
    width,
    height,
    data,
  } as HMG;
}

export function cropHMG(hmg: HMG, crop: Rect) {
  const { x, y, w: width, h: height } = crop;
  const data = new Uint8Array(width * height * 4);

  const bytesPerPixel = 4;
  const cropRowBytes = width * bytesPerPixel;

  for (let row = 0; row < height; row++) {
    const sourceRowStart = ((y + row) * hmg.width + x) * bytesPerPixel;
    const destRowStart = row * width * bytesPerPixel;
    data.set(
      hmg.data.subarray(sourceRowStart, sourceRowStart + cropRowBytes),
      destRowStart
    );
  }

  return {
    width,
    height,
    data,
  } as HMG;
}

type RGBA = {
  r: number;
  g: number;
  b: number;
  a: number;
};

export function mergeHMG(origin: HMG, hmg: HMG, x: number, y: number) {
  const { width, height } = hmg;

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const sourceIndex = (row * width + col) * 4;
      const destIndex = ((y + row) * origin.width + (x + col)) * 4;

      const src_r = hmg.data[sourceIndex] / 255; // R;
      const src_g = hmg.data[sourceIndex + 1] / 255; // G;
      const src_b = hmg.data[sourceIndex + 2] / 255; // B;
      const src_a = hmg.data[sourceIndex + 3] / 255; // A;
      const src = { r: src_r, g: src_g, b: src_b, a: src_a };

      const dst_r = origin.data[destIndex] / 255;
      const dst_g = origin.data[destIndex + 1] / 255;
      const dst_b = origin.data[destIndex + 2] / 255;
      const dst_a = origin.data[destIndex + 3] / 255;
      const dst = { r: dst_r, g: dst_g, b: dst_b, a: dst_a };

      const { r, g, b, a } = blendColor(dst, src);

      origin.data[destIndex] = r * 255;
      origin.data[destIndex + 1] = g * 255;
      origin.data[destIndex + 2] = b * 255;
      origin.data[destIndex + 3] = a * 255;
    }
  }

  return origin;
}

function blendColor(dst: RGBA, src: RGBA) {
  const { r: dst_r, g: dst_g, b: dst_b, a: dst_a } = dst;
  const { r: src_r, g: src_g, b: src_b, a: src_a } = src;
  const res_a = src_a + dst_a * (1 - src_a);
  const res_r =
    res_a == 0 ? 0 : (src_r * src_a + dst_r * dst_a * (1 - src_a)) / res_a;
  const res_g =
    res_a == 0 ? 0 : (src_g * src_a + dst_g * dst_a * (1 - src_a)) / res_a;
  const res_b =
    res_a == 0 ? 0 : (src_b * src_a + dst_b * dst_a * (1 - src_a)) / res_a;

  return { r: res_r, g: res_g, b: res_b, a: res_a } as RGBA;
}

export async function hmg2png(hmg: HMG) {
  const { width, height, data } = hmg;
  const encoded = await encodePng({ data, width, height });

  return encoded.data;
}

export async function png2hmg(png: Uint8Array) {
  const image = (await decodePng(png)).image;

  return image as HMG;
}

export function encodeHMG(hmg: HMG): Uint8Array {
  const { width, height, data } = hmg;

  let compressedData = new Uint8Array(compressBlockBound(data.byteLength));

  const count = compressBlock(data, compressedData, 0);
  compressedData = compressedData.slice(0, count);

  const result = new Uint8Array(24 + count);
  result.set(new TextEncoder().encode("PGF"), 0);
  result[3] = 0;
  result.set(
    new Uint8Array(Uint32Array.from([24 + count, count, width, height]).buffer),
    4
  );
  result[20] = 32;
  result[21] = 1;
  result[22] = 0;
  result[23] = 0;
  result.set(compressedData, 24);

  return result;
}

export function decodeHMG(raw: Uint8Array): HMG {
  const buffer = new Buffer(raw);
  if (buffer.readChars(3) != "PGF") {
    throw new Error("This file is not Hmg File!!!");
  }

  const dummyLen1 = buffer.readInt8();
  buffer.readInt32(); // File Size
  buffer.readBytes(dummyLen1); // Dummy Chunk

  const compressedSize = buffer.readInt32();
  const width = buffer.readInt32();
  const height = buffer.readInt32();
  buffer.readInt8(); // Fixed to 32, may means RGBA8888

  buffer.readInt8(); // Fixed to 1, may means TRUE_TYPE
  const dummyLen2 = buffer.readInt8();
  buffer.readInt8(); // Maybe Compression type, 0 is lz4
  buffer.readBytes(dummyLen2); // Another Dummy Chunk

  const compressedData = buffer.readBytes(compressedSize);
  const data = new Uint8Array(width * height * 4);
  uncompressBlock(Uint8Array.from(compressedData), data);
  return {
    width,
    height,
    data,
  };
}
