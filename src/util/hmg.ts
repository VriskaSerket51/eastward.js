import {
  compressBlock,
  compressBlockBound,
  uncompressBlock,
} from "@rinsuki/lz4-ts";
import { decodePng, encodePng } from "@lunapaint/png-codec";
import { Rect } from "#type";
import { Buffer as NodeBuffer } from "node:buffer";
import { crc32, deflateSync } from "node:zlib";

export type HMG = {
  width: number;
  height: number;
  data: Uint8Array;
};

export function emptyHMG(width: number, height: number) {
  imageBytes(width, height);
  const data = new Uint8Array(width * height * 4);
  return {
    width,
    height,
    data,
  } as HMG;
}

export function cropHMG(hmg: HMG, crop: Rect) {
  const { x, y, w: width, h: height } = crop;
  validateImage(hmg);
  imageBytes(width, height);
  if (
    ![x, y].every(Number.isInteger) ||
    x < 0 ||
    y < 0 ||
    x + width > hmg.width ||
    y + height > hmg.height
  )
    throw new RangeError("Crop exceeds image bounds");
  const data = new Uint8Array(width * height * 4);

  const bytesPerPixel = 4;
  const cropRowBytes = width * bytesPerPixel;

  for (let row = 0; row < height; row++) {
    const sourceRowStart = ((y + row) * hmg.width + x) * bytesPerPixel;
    const destRowStart = row * width * bytesPerPixel;
    data.set(
      hmg.data.subarray(sourceRowStart, sourceRowStart + cropRowBytes),
      destRowStart,
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
  validateImage(origin);
  validateImage(hmg);
  if (
    ![x, y].every(Number.isInteger) ||
    x < 0 ||
    y < 0 ||
    x + hmg.width > origin.width ||
    y + hmg.height > origin.height
  )
    throw new RangeError("Merge exceeds image bounds");
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
  // RGB+tRNS cannot distinguish opaque and transparent pixels of the same RGB.
  const encoded = await encodePng({ data, width, height }, { colorType: 6 });

  return encoded.data;
}

export function hmg2pngSync(image: HMG): Uint8Array {
  validateImage(image);
  if (!image.width || !image.height)
    throw new RangeError("PNG dimensions must be positive");
  const chunk = (name: string, data: Uint8Array) => {
    const output = NodeBuffer.alloc(data.length + 12);
    output.writeUInt32BE(data.length, 0);
    output.write(name, 4, "ascii");
    output.set(data, 8);
    output.writeUInt32BE(
      crc32(output.subarray(4, 8 + data.length)),
      8 + data.length,
    );
    return output;
  };
  const header = NodeBuffer.alloc(13);
  header.writeUInt32BE(image.width);
  header.writeUInt32BE(image.height, 4);
  header[8] = 8;
  header[9] = 6;
  const stride = image.width * 4;
  const scanlines = NodeBuffer.alloc((stride + 1) * image.height);
  for (let y = 0; y < image.height; y++)
    scanlines.set(
      image.data.subarray(y * stride, (y + 1) * stride),
      y * (stride + 1) + 1,
    );
  return NodeBuffer.concat([
    NodeBuffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(scanlines)),
    chunk("IEND", new Uint8Array()),
  ]);
}

export async function png2hmg(png: Uint8Array) {
  const image = (await decodePng(png)).image;

  return image as HMG;
}

export function encodeHMG(hmg: HMG): Uint8Array {
  validateImage(hmg);
  if (!hmg.width || !hmg.height)
    throw new RangeError("HMG dimensions must be positive");
  const { width, height, data } = hmg;

  let compressedData = new Uint8Array(compressBlockBound(data.byteLength));

  let count = compressBlock(data, compressedData, 0);
  if (count === 0) {
    // LZ4 compressors return zero for short/incompressible input. Encode a
    // literal-only block rather than emitting an empty, invalid image.
    const extensionCount =
      data.length >= 15 ? Math.floor((data.length - 15) / 255) + 1 : 0;
    compressedData = new Uint8Array(1 + extensionCount + data.length);
    compressedData[0] = Math.min(data.length, 15) << 4;
    let offset = 1;
    if (data.length >= 15) {
      let remaining = data.length - 15;
      while (remaining >= 255) {
        compressedData[offset++] = 255;
        remaining -= 255;
      }
      compressedData[offset++] = remaining;
    }
    compressedData.set(data, offset);
    count = compressedData.length;
  } else {
    compressedData = compressedData.slice(0, count);
  }

  // Zero padding is valid; native writers choose random 1–4 byte padding.
  const result = new Uint8Array(24 + count);
  const header = new DataView(result.buffer);
  result.set(new TextEncoder().encode("PGF"), 0);
  result[3] = 0;
  header.setUint32(4, result.length, true);
  header.setUint32(8, count, true);
  header.setUint32(12, width, true);
  header.setUint32(16, height, true);
  result[20] = 32;
  result[21] = 1; // LZ4 compression acceleration metadata.
  result[22] = 0;
  result[23] = 0;
  result.set(compressedData, 24);

  return result;
}

export function decodeHMG(raw: Uint8Array): HMG {
  const { width, height, payloadOffset, compressedSize } = readHMGHeader(raw);
  const compressedData = raw.subarray(
    payloadOffset,
    payloadOffset + compressedSize,
  );
  // Preserve stored RGBA bytes; atlas alpha conversion belongs to TextureAsset.
  const data = new Uint8Array(imageBytes(width, height));
  if (uncompressBlock(compressedData, data) !== data.length)
    throw new Error("HMG decoded pixel size mismatch");
  return { width, height, data };
}

/** PGF has a 24-byte base header plus two variable-length padding regions. */
function readHMGHeader(raw: Uint8Array) {
  if (raw.length < 24) throw new RangeError("Truncated HMG header");
  if (raw[0] !== 0x50 || raw[1] !== 0x47 || raw[2] !== 0x46)
    throw new Error("Invalid HMG magic (expected PGF)");
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  if (view.getUint32(4, true) !== raw.length)
    throw new Error("HMG file size mismatch");
  const paddingLengthA = raw[3];
  const fieldsOffset = 8 + paddingLengthA;
  if (fieldsOffset + 16 > raw.length)
    throw new RangeError("Truncated HMG header padding");
  const compressedSize = view.getUint32(fieldsOffset, true);
  const width = view.getUint32(fieldsOffset + 4, true);
  const height = view.getUint32(fieldsOffset + 8, true);
  if (width <= 0 || height <= 0)
    throw new RangeError("HMG dimensions must be positive");
  // Declaration and acceleration are ignored by the native decoder.
  const paddingLengthB = raw[fieldsOffset + 14];
  const alternateCopyFlag = raw[fieldsOffset + 15];
  if (alternateCopyFlag !== 0)
    throw new Error(
      "Unsupported HMG alternate-copy flag: " + alternateCopyFlag,
    );
  const payloadOffset = fieldsOffset + 16 + paddingLengthB;
  if (payloadOffset > raw.length)
    throw new RangeError("Truncated HMG header padding");
  if (compressedSize === 0 || compressedSize !== raw.length - payloadOffset)
    throw new Error("HMG payload size mismatch");
  return { width, height, payloadOffset, compressedSize };
}

function imageBytes(width: number, height: number) {
  const bytes = width * height * 4;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 0 ||
    height < 0 ||
    !Number.isSafeInteger(bytes) ||
    bytes > 0xffffffff
  )
    throw new RangeError("Invalid image dimensions");
  return bytes;
}

function validateImage(image: HMG) {
  if (image.data.length !== imageBytes(image.width, image.height))
    throw new RangeError("Image pixel size mismatch");
}
