import fs from "fs/promises";

let rootHandle: FileSystemDirectoryHandle | null = null;

export function initBrowser(dirHandle: FileSystemDirectoryHandle) {
  rootHandle = dirHandle;
}

export async function exists(filePath: string) {
  try {
    if (typeof window != "undefined") {
      if (!rootHandle) {
        throw new Error("1");
      }
      const [root, ...rest] = filePath.split("/");
      if (root != rootHandle.name) {
        throw new Error("2");
      }
      let dirHandle = rootHandle;
      for (let i = 0; i < rest.length; i++) {
        const name = rest[i];
        if (i == rest.length - 1) {
          await dirHandle.getFileHandle(name);
        } else {
          dirHandle = await dirHandle.getDirectoryHandle(name);
        }
      }
    } else {
      await fs.stat(filePath);
    }
    return true;
  } catch {
    return false;
  }
}

export async function readFile(filePath: string) {
  if (typeof window != "undefined") {
    if (!rootHandle) {
      throw new Error("1");
    }
    const [root, ...rest] = filePath.split("/");
    if (root != rootHandle.name) {
      throw new Error("2");
    }
    const fileName = rest.pop();
    if (!fileName) {
      throw new Error("tried to read root dir");
    }
    let dirHandle = rootHandle;
    for (let i = 0; i < rest.length; i++) {
      const name = rest[i];
      dirHandle = await dirHandle.getDirectoryHandle(name);
    }
    const fileHandle = await dirHandle.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    return Buffer.from(await file.arrayBuffer());
  } else {
    return fs.readFile(filePath);
  }
}
