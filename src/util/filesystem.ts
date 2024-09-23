import fs from "fs/promises";
import path from "path";

export async function mkdir(path: string) {
  await fs.mkdir(path, { recursive: true });
}

export async function exists(path: string) {
  try {
    await fs.stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function isFile(path: string) {
  try {
    const stat = await fs.stat(path);
    return stat.isFile();
  } catch {
    return false;
  }
}

export async function isDir(path: string) {
  try {
    const stat = await fs.stat(path);
    return stat.isDirectory();
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
    .map((e) => path.join(e.path, e.name));
}

export async function writeFile(filePath: string, data: Uint8Array) {
  await fs.writeFile(filePath, data);
}
