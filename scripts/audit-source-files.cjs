// Compare restored source bytes and scene/package outputs with installed resources.
// Never launches the game or writes to the extracted source tree.
const fs = require("node:fs/promises");
const path = require("node:path");
const { Eastward, registerAll } = require("../dist");
const { remapSourceFile } = require("../dist/util/source-reference");
const { resolveWithin, readFiles, isDir } = require("../dist/util/filesystem");

async function main() {
  const root = path.resolve(process.argv[2] || "extract/eastward-source-final");
  const game = new Eastward({
    root:
      process.argv[3] ||
      "C:/Program Files (x86)/Steam/steamapps/common/Eastward",
  });
  registerAll(game);
  await game.init();
  const metadata = JSON.parse(
    await fs.readFile(path.join(root, ".eastward-project.json"), "utf8"),
  );
  const cache = path.resolve("node_modules/.cache");
  await fs.mkdir(cache, { recursive: true });
  const staging = await fs.mkdtemp(path.join(cache, "source-compare-"));
  const counts = {},
    errors = {};
  const compare = async (expected, actual) => {
    await remapSourceFile(expected, metadata.pathRemappings);
    if (!(await fs.readFile(expected)).equals(await fs.readFile(actual))) {
      throw Error("Restored bytes differ: " + path.relative(root, actual));
    }
  };
  try {
    for (const [logical, record] of Object.entries(metadata.assets)) {
      const node = game.nodes[logical];
      const actual = resolveWithin(root, record);
      const expected = resolveWithin(staging, path.basename(actual));
      try {
        if (["bt_script", "material", "physics_body_def", "physics_material", "effect", "prefab", "render_target", "ui_style", "stylesheet", "deck2d", "glsl", "shader_script", "com_script", "data_json", "animator_data", "raw", "tb_scheme", "font_ttf", "font_bmfont", "movie"].includes(node.type)) {
          let matched = false;
          for (const ref of Object.values(node.objectFiles ?? {})) {
            const bytes = await game.loadFile(ref);
            if (bytes === null) continue;
            await fs.writeFile(expected, bytes);
            await remapSourceFile(expected, metadata.pathRemappings);
            if (
              (await fs.readFile(expected)).equals(await fs.readFile(actual))
            ) {
              matched = true;
              break;
            }
          }
          if (!matched)
            throw Error("No original resource matches the restored source");
          await fs.unlink(expected);
        } else if (["scene", "mesh", "fs_project"].includes(node.type)) {
          const asset = await game.loadAsset(logical);
          if (!asset) throw Error("Missing asset loader result");
          await asset.saveFile(expected);
          if (await isDir(expected)) {
            for (const file of await readFiles(expected)) {
              await compare(
                file,
                resolveWithin(actual, path.relative(expected, file)),
              );
            }
            resolveWithin(staging, path.relative(staging, expected));
            await fs.rm(expected, { recursive: true, force: true });
          } else {
            await compare(expected, actual);
            await fs.unlink(expected);
          }
          node.cachedAsset = null;
        } else {
          continue;
        }
        counts[node.type] = (counts[node.type] ?? 0) + 1;
      } catch (error) {
        errors[logical] = String(error);
        // Stop rather than reuse a partially generated temporary output.
        break;
      }
    }
  } finally {
    resolveWithin(cache, path.relative(cache, staging));
    await fs.rm(staging, { recursive: true, force: true });
  }
  console.log(JSON.stringify({ counts, errors }));
  if (Object.keys(errors).length) process.exitCode = 1;
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
