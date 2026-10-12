import fs from "node:fs/promises";
import path from "node:path";
import type { Buffer } from "node:buffer";

export async function mkdir(path: string) {
  await fs.mkdir(path, { recursive: true });
}

export async function exists(path: string) {
  try {
    await fs.stat(path);
    return true;
  } catch (error) {
    if (!["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code!))
      throw error;
    return false;
  }
}

export async function isFile(path: string) {
  try {
    const stat = await fs.stat(path);
    return stat.isFile();
  } catch (error) {
    if (!["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code!))
      throw error;
    return false;
  }
}

export async function isDir(path: string) {
  try {
    const stat = await fs.stat(path);
    return stat.isDirectory();
  } catch (error) {
    if (!["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code!))
      throw error;
    return false;
  }
}

export async function readDirectory(dirPath: string) {
  return (await fs.readdir(dirPath, { recursive: true })).map((file) =>
    file.replace(/\\/g, "/"),
  );
}

export async function readFile(filePath: string): Promise<Buffer> {
  return await fs.readFile(filePath);
}

export async function readFiles(dirPath: string) {
  return (await fs.readdir(dirPath, { recursive: true, withFileTypes: true }))
    .filter((e) => e.isFile())
    .map((e) => path.join(e.parentPath, e.name));
}

export async function writeFile(filePath: string, data: Uint8Array) {
  await fs.writeFile(filePath, data);
}

export function resolveWithin(root: string, relative: string) {
  if (
    !relative ||
    path.isAbsolute(relative) ||
    /^[A-Za-z]:/.test(relative) ||
    relative.replace(/\\/g, "/").split("/").includes("..")
  )
    throw new Error("Unsafe relative path: " + relative);
  const target = path.resolve(root, relative);
  const rel = path.relative(path.resolve(root), target);
  if (rel === ".." || rel.startsWith(".." + path.sep) || path.isAbsolute(rel))
    throw new Error("Path escapes root: " + relative);
  return target;
}
