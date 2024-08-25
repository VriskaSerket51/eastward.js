import { compressSync, decompressSync } from "@skhaz/zstd";
import { BufferWrapper } from "./buffer";
import { readFile } from "@/util/filesystem";

type File = {
  name: string;
  isCompressed: boolean;
  data: Buffer;
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
      };
    }
  }

  checkFileData(name: string) {
    return this.assets[name] != null;
  }

  getFileData(name: string) {
    if (!this.assets[name]) {
      return null;
    }
    const { isCompressed, data } = this.assets[name];
    if (isCompressed) {
      return decompressSync(data);
    }
    return data;
  }

  setFileData(name: string, data: Buffer) {
    this.assets[name] = {
      name,
      isCompressed: true,
      data: compressSync(data),
    };
  }
}
