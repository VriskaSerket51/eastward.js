import { Buffer as BufferWrapper } from "./buffer";
import { readFile } from "@/util/filesystem";
import { compress, decompress } from "@metastable/cppzst";
import { createWriteStream, WriteStream } from "fs";

type File = {
  name: string;
  isCompressed: boolean;
  data: Uint8Array;
  decompressedSize: number;
};

export class GArchive {
  assets: { [key: string]: File } = {};

  async load(filePath: string) {
    const buffer = new BufferWrapper(await readFile(filePath));

    if (buffer.readInt32() != 27191) {
      throw new Error(`${filePath} is not GArchive!!!`);
    }

    const length = buffer.readInt32();
    for (let i = 0; i < length; i++) {
      const name = buffer.readZString();
      const offset = buffer.readInt32();
      const isCompressed = buffer.readInt32() == 2;
      const decompressedSize = buffer.readInt32();
      const compressedSize = buffer.readInt32();
      const data = buffer.raw.subarray(offset, offset + compressedSize);

      this.assets[name] = {
        name,
        isCompressed,
        data,
        decompressedSize,
      };
    }
  }

  getFileNames() {
    return Object.keys(this.assets);
  }

  checkFileData(name: string) {
    return this.assets[name] != null;
  }

  async getFileData(name: string) {
    const assets = this.assets[name];
    if (!assets) {
      return null;
    }
    const { isCompressed, data } = assets;
    if (isCompressed) {
      assets.isCompressed = false;
      assets.data = await decompress(Buffer.from(data));
    }
    return assets.data;
  }

  async setFileData(name: string, data: Uint8Array) {
    const assets = this.assets[name];
    if (!assets) {
      this.assets[name] = {
        name,
        isCompressed: false,
        data: data,
        decompressedSize: data.byteLength,
      };
      return;
    }
    assets.isCompressed = false;
    assets.data = data;
    assets.decompressedSize = data.byteLength;
  }

  async saveFile(filePath: string) {
    const write = (
      stream: WriteStream,
      chunk: string | Buffer | Uint8Array
    ) => {
      return new Promise<void>((resolve, reject) => {
        stream.write(chunk, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    };

    let offset =
      Object.values(this.assets)
        .map((asset) => asset.name.length + 1 + 16)
        .reduce((a, b) => a + b, 8);

    const stream = createWriteStream(filePath);
    await write(stream, new Uint8Array(Uint32Array.from([27191]).buffer));
    await write(
      stream,
      new Uint8Array(Uint32Array.from([Object.keys(this.assets).length]).buffer)
    );

    for (const asset of Object.values(this.assets)) {
      const { name, isCompressed, decompressedSize } = asset;
      if (!isCompressed) {
        asset.isCompressed = true;
        asset.data = await compress(Buffer.from(asset.data));
      }

      await write(stream, name);
      await write(stream, Uint8Array.from([0]));
      await write(
        stream,
        new Uint8Array(
          Uint32Array.from([
            offset,
            2,
            decompressedSize,
            asset.data.byteLength,
          ]).buffer
        )
      );

      offset += asset.data.byteLength;
    }

    for (const asset of Object.values(this.assets)) {
      const { data } = asset;

      await write(stream, data);
    }
  }
}
