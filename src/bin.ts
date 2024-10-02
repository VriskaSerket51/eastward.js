#!/usr/bin/env node
import { Eastward, LOG_LEVEL } from "@/eastward";
import { GArchive } from "@/g-archive";
import { ASSET_TYPES, AssetType, register, registerAll } from "@/util/register";
import arg from "arg";
import path, { basename, dirname } from "path";
import { decodeHMG, encodeHMG, hmg2png, png2hmg } from "./util/hmg";
import { mkdir, readFile, readFiles, writeFile } from "./util/filesystem";
import { encode } from "@msgpack/msgpack";

function help() {
  console.log("Usage: eastward [MODE] [OPTION]... [FILE]...");
  console.log("Mode and Option:");
  console.log(
    "\textract\t\tExtract all assets with types from game root directory to output directory. Without explicit --type option, all assets will be extracted."
  );
  console.log("\t\t--root\t\tgame root directory");
  console.log("\t\t-T, --type\tasset type; eastward --help type to get list");
  console.log("\t\t--out\t\toutput directory");

  console.log("\tunzip\t\tExtract data from .g files to output directory.");
  console.log("\t\t--out\t\toutput directory");
  console.log("\t\t[FILE]\t\t.g files");

  console.log(
    "\tzip\t\tArchive all data from root directory to output .g file."
  );
  console.log("\t\t--root\t\troot directory");
  console.log("\t\t--out\t\toutput .g file");

  console.log("\thmg2png\t\tRead hmg files and convert to png files.");
  console.log("\t\t-r\t\tRead recursive in directory");
  console.log("\t\t--in\t\tInput directory or file");
  console.log("\t\t--out\t\tOutput directory or file");

  console.log("\tpng2hmg\t\tRead png files and convert to hmg files.");
  console.log("\t\t-r\t\tRead recursive in directory");
  console.log("\t\t--in\t\tInput directory or file");
  console.log("\t\t--out\t\tOutput directory or file");

  console.log("\tjson2msg\t\tRead JSON files and convert to msgpack files.");
  console.log("\t\t-r\t\tRead recursive in directory");
  console.log("\t\t--in\t\tInput directory or file");
  console.log("\t\t--out\t\tOutput directory or file");

  console.log("\tinject\t\tRead files from root and inject them into .g file.");
  console.log("\t\t--root\t\tInput directory");
  console.log("\t\t--in\t\tInput .g file");
  console.log("\t\t--out\t\tOutput .g file");

  process.exit();
}

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
      "--in": String,
      "--out": String,
      "--type": [String],
      "-r": Boolean,
      "-v": "--verbose",
      "-T": "--type",
    });

    const others = args["_"];

    if (args["--help"]) {
      if (others.shift() == "type") {
        ASSET_TYPES.forEach((type) => console.log(type));
        process.exit();
      }

      help();
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

          const types = (args["--type"] || []) as AssetType[];
          if (types.length == 0) {
            registerAll(eastward);
          } else {
            types.forEach((type) => register(eastward, type as AssetType));
          }

          await eastward.extractTo(out, ...types);
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

          const files = await readFiles(root);

          const archive = new GArchive({ verbose });
          for (const file of files) {
            try {
              const data = await readFile(file);
              await archive.setFileData(
                path.relative(root, file).replace(/\\/g, "/"),
                data
              );
              if (verbose >= LOG_LEVEL.INFO) {
                console.info(file);
              }
            } catch (err) {
              const e = err as Error;
              if (verbose >= LOG_LEVEL.ERROR) {
                console.error(`Error at ${file}: ${e.message}`);
              }
            }
          }

          await archive.saveFile(out);
        }
        break;

      case "hmg2png":
        {
          const recursive = args["-r"];
          const inPath = args["--in"];
          if (!inPath) {
            throw new Error("Required option: --in");
          }
          const out = args["--out"];
          if (!out) {
            throw new Error("Required option: --out");
          }

          if (recursive) {
            const files = await readFiles(inPath);

            for (const file of files) {
              try {
                const data = await readFile(file);
                const png = await hmg2png(decodeHMG(data));
                const outputPath = path.join(out, path.relative(inPath, file));
                await mkdir(dirname(outputPath));
                await writeFile(outputPath, png);
              } catch (err) {
                const e = err as Error;
                if (verbose >= LOG_LEVEL.ERROR) {
                  console.error(`Error at ${file}: ${e.message}`);
                }
              }
            }
          } else {
            const data = await readFile(inPath);
            const png = await hmg2png(decodeHMG(data));
            await mkdir(dirname(out));
            await writeFile(out, png);
          }
        }
        break;

      case "png2hmg":
        {
          const recursive = args["-r"];
          const inPath = args["--in"];
          if (!inPath) {
            throw new Error("Required option: --in");
          }
          const out = args["--out"];
          if (!out) {
            throw new Error("Required option: --out");
          }

          if (recursive) {
            const files = await readFiles(inPath);

            for (const file of files) {
              try {
                const data = await readFile(file);
                const png = encodeHMG(await png2hmg(data));
                const outputPath = path.join(out, path.relative(inPath, file));
                await mkdir(dirname(outputPath));
                await writeFile(outputPath, png);
              } catch (err) {
                const e = err as Error;
                if (verbose >= LOG_LEVEL.ERROR) {
                  console.error(`Error at ${file}: ${e.message}`);
                }
              }
            }
          } else {
            const data = await readFile(inPath);
            const png = encodeHMG(await png2hmg(data));
            await writeFile(out, png);
          }
        }
        break;

      case "json2msg":
        {
          const recursive = args["-r"];
          const inPath = args["--in"];
          if (!inPath) {
            throw new Error("Required option: --in");
          }
          const out = args["--out"];
          if (!out) {
            throw new Error("Required option: --out");
          }

          if (recursive) {
            const files = await readFiles(inPath);

            for (const file of files) {
              try {
                const data = await readFile(file);
                const msg = encode(JSON.parse(new TextDecoder().decode(data)));
                const outputPath =
                  path.join(out, path.relative(inPath, file)) + ".packed";
                await mkdir(dirname(outputPath));
                await writeFile(outputPath, msg);
              } catch (err) {
                const e = err as Error;
                if (verbose >= LOG_LEVEL.ERROR) {
                  console.error(`Error at ${file}: ${e.message}`);
                }
              }
            }
          } else {
            const data = await readFile(inPath);
            const msg = encode(JSON.parse(new TextDecoder().decode(data)));
            await writeFile(out, msg);
          }
        }
        break;

      case "inject":
        {
          const root = args["--root"];
          if (!root) {
            throw new Error("Required option: --root");
          }
          const inPath = args["--in"];
          if (!inPath) {
            throw new Error("Required option: --in");
          }
          const out = args["--out"];
          if (!out) {
            throw new Error("Required option: --out");
          }

          const archive = new GArchive({ verbose });
          await archive.load(inPath);
          const files = await readFiles(root);
          for (const file of files) {
            const name = path.relative(root, file).replace(/\\/g, "/");
            const data = await readFile(file);
            await archive.setFileData(name, data);
          }

          await archive.saveFile(out);
        }
        break;

      default:
        console.warn(`Unknown mode: ${mode}`);
        help();
    }
  } catch (err) {
    const e = err as Error;
    console.error(e.message);
  }
}

main();
