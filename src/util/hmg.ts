import { compressBlock, compressBound, decompressBlock } from "lz4js";
import { decodePng, encodePng } from "@lunapaint/png-codec";
import { Buffer } from "@/buffer";

export type HMG = {
  width: number;
  height: number;
  data: Uint8Array;
};

type Rect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export function cropHMG(hmg: HMG, crop: Rect) {
  const { x, y, w: width, h: height } = crop;
  const data = new Uint8Array(width * height * 4);

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const sourceIndex = ((y + row) * hmg.width + (x + col)) * 4;
      const destIndex = (row * width + col) * 4;

      data[destIndex] = hmg.data[sourceIndex]; // R
      data[destIndex + 1] = hmg.data[sourceIndex + 1]; // G
      data[destIndex + 2] = hmg.data[sourceIndex + 2]; // B
      data[destIndex + 3] = hmg.data[sourceIndex + 3]; // A
    }
  }

  return {
    width,
    height,
    data,
  } as HMG;
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

  let compressedData = new Uint8Array(compressBound(data.byteLength));

  const count = compressBlock(data, compressedData, 0, data.length, 0);
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
  decompressBlock(Uint8Array.from(compressedData), data, 0, compressedSize, 0);
  return {
    width,
    height,
    data,
  };
}
