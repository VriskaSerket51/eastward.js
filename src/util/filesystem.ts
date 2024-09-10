import fs from "fs/promises";

export async function exists(filePath: string) {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readFile(filePath: string): Promise<Uint8Array> {
  return await fs.readFile(filePath);
}
