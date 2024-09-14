import fs from "fs/promises";

export async function exists(path: string) {
  try {
    await fs.stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function readDirectory(dirPath: string) {
  return await fs.readdir(dirPath);
}

export async function readFile(filePath: string): Promise<Uint8Array> {
  return await fs.readFile(filePath);
}
