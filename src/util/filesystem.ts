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

export async function readFile(filePath: string) {
  return await fs.readFile(filePath);
}

export async function readFiles(dirPath: string) {
  return (await fs.readdir(dirPath, { recursive: true, withFileTypes: true }))
    .filter((e) => e.isFile())
    .map((e) => e.name);
}

export async function writeFile(filePath: string, data: Uint8Array) {
  await fs.writeFile(filePath, data);
}
