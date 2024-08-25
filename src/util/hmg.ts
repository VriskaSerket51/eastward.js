import lz4 from "lz4";
import { BufferWrapper } from "@/buffer";

export type HMG = {
  width: number;
  height: number;
  data: Buffer;
};

export function decodeHMG(raw: Buffer): HMG {
  const buffer = new BufferWrapper(raw);
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
  const data = Buffer.alloc(width * height * 4);
  lz4.decodeBlock(Buffer.from(compressedData), data);
  return {
    width,
    height,
    data,
  };
}
