#!/usr/bin/env node
import { Eastward, LOG_LEVEL } from "@/eastward";
import { GArchive } from "@/g-archive";
import { exists } from "@/util/filesystem";
import { ASSET_TYPES, AssetType, register, registerAll } from "@/util/register";
import arg from "arg";
import { mkdir, readdir, readFile, stat, writeFile } from "fs/promises";
import path from "path";

async function main() {
  console.log(`eastward.js by IREVES`);
  console.log("https://github.com/VriskaSerket51/eastward.js");
  console.log();
  console.log();

  try {
    const args = arg({
      "--help": Boolean,
      "--verbose": arg.COUNT,
      "--root": String,
      "--out": String,
      "--type": [String],
      "-v": "--verbose",
      "-T": "--type",
    });

    const others = args["_"];

    if (args["--help"]) {
      if (others.shift() == "type") {
        ASSET_TYPES.forEach(console.log);
        process.exit();
      }

      console.log("Usage: eastward [MODE] [OPTION]... [FILE]...");
      console.log("Mode and Option:");
      console.log(
        "\textract\t\tExtract all assets with types from game root directory to output directory. Without explicit --type option, all assets will be extracted."
      );
      console.log("\t\t--root\t\tgame root directory");
      console.log("\t\t-T, --type\tasset type; --help type to get list");
      console.log("\t\t--out\t\toutput directory");

      console.log("\tunzip\t\tExtract data from .g files to output directory.");
      console.log("\t\t--out\t\toutput directory");
      console.log("\t\t[FILE]\t\t.g files");

      console.log(
        "\tzip\t\tArchive all data from root directory to output .g file."
      );
      console.log("\t\t--root\t\troot directory");
      console.log("\t\t--out\t\toutput .g file");

      process.exit();
    }

    const mode = others.shift();
    if (!mode) {
      throw new Error("Required option: [MODE]");
    }
    const verbose = args["--verbose"] ?? LOG_LEVEL.ERROR;

    switch (mode) {
      case "extract":
        {
          const root = args["--root"];
          if (!root) {
            throw new Error("Required option: --root");
          }
          const out = args["--out"];
          if (!out) {
            throw new Error("Required option: --out");
          }

          const eastward = new Eastward({ root, verbose });
          await eastward.init();

          const types = args["--type"];
          if (!types || types.length == 0) {
            registerAll(eastward);
          } else {
            types.forEach((type) => register(eastward, type as AssetType));
          }

          await eastward.extractTo(out);
        }
        break;

      case "unzip":
        {
          const out = args["--out"];
          if (!out) {
            throw new Error("Required option: --out");
          }
          const files = others;
          for (const file of files) {
            const dir = path.parse(file).name;
            const archive = new GArchive({ verbose });
            await archive.load(file);
            await archive.extracTo(path.join(out, dir));
          }
        }
        break;

      case "zip":
        {
          const root = args["--root"];
          if (!root) {
            throw new Error("Required option: --root");
          }
          const out = args["--out"];
          if (!out) {
            throw new Error("Required option: --out");
          }

          async function readAll(dir: string, files: string[]) {
            for (const file of await readdir(dir)) {
              const abs = path.join(dir, file);
              const dirStat = await stat(abs);
              if (dirStat.isDirectory()) {
                await readAll(abs, files);
              } else {
                const fileName = path.relative(root!, abs).replace(/\\/g, "/");
                files.push(fileName);
              }
            }
          }

          const files: string[] = [];
          await readAll(root, files);

          const archive = new GArchive({ verbose });
          for (const file of files) {
            const data = await readFile(path.join(root, file));
            await archive.setFileData(file, data);
            if (verbose >= LOG_LEVEL.INFO) {
              console.info(file);
            }
          }

          await archive.saveFile(out);
        }
        break;

      default:
        throw new Error(`Unknown mode: ${mode}\n try eastward --help`);
    }
  } catch (err) {
    const e = err as Error;
    console.error(e.message);
  }
}

main();
