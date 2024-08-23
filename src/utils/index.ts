import fs from "fs";
import path from "path";

export const readAllFiles = (
  dirName: string,
  fileNames: string[],
  filter?: (fileName: string) => boolean
) => {
  fs.readdirSync(dirName, { withFileTypes: true }).forEach((dir) => {
    if (dir.isDirectory()) {
      readAllFiles(path.join(dirName, dir.name), fileNames, filter);
    } else if (!filter || filter(dir.name)) {
      fileNames.push(path.join(dirName, dir.name));
    }
  });
};
