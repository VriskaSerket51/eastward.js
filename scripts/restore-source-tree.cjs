// Offline adapter: restoration uses the normal Eastward API and Asset loaders.
const fs = require("node:fs/promises");
const path = require("node:path");
const { Eastward, AssetNode } = require("../dist");
async function restoreSourceTree(input, destination, options = {}) {
  const source = await fs.realpath(input);
  const safe = (relative) => {
    const target = path.resolve(source, relative);
    const rel = path.relative(source, target);
    if (rel === ".." || rel.startsWith(".." + path.sep) || path.isAbsolute(rel))
      throw new Error("Unsafe path: " + relative);
    return target;
  };
  const manifest = JSON.parse(await fs.readFile(safe("project.json"), "utf8"));
  if (manifest.format !== "eastward-recovery-project")
    throw new Error("Unsupported recovery input");
  const game = new Eastward({ root: source });
  game.loadFile = async (ref) => {
    try {
      return await fs.readFile(safe("resources/" + ref));
    } catch (e) {
      if (["ENOENT", "EISDIR"].includes(e.code)) return null;
      throw e;
    }
  };
  game.checkFileExists = async (ref) => {
    try {
      return (await fs.stat(safe("resources/" + ref))).isFile();
    } catch (e) {
      if (e.code === "ENOENT") return false;
      throw e;
    }
  };
  game.loadDirectory = async (ref) => {
    try {
      return await fs.readdir(safe("resources/" + ref), { recursive: true });
    } catch (e) {
      if (["ENOENT", "ENOTDIR"].includes(e.code)) return null;
      throw e;
    }
  };
  for (const [logical, item] of Object.entries(manifest.assets)) {
    const entry = JSON.parse(
      await fs.readFile(safe(item.folder + "/asset.json"), "utf8"),
    );
    game.nodes[logical] = Object.assign(
      new AssetNode(logical),
      entry.original,
      { name: path.posix.basename(logical) },
    );
    if (entry.resources.script?.length === 1)
      game.scriptLibrary[logical] = entry.resources.script[0];
  }
  for (const node of Object.values(game.nodes)) {
    const parent = node.path.includes("/")
      ? node.path.slice(0, node.path.lastIndexOf("/"))
      : "";
    node.parent = parent;
    node.parentNode = game.nodes[parent] ?? null;
    if (node.parentNode) node.parentNode.children[node.name] = node;
  }
  try {
    const config = JSON.parse(
      await fs.readFile(safe("metadata/game-config.json"), "utf8"),
    );
    await game._loadTextureLibrary(config.texture_library);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  return game.exportSourceProject(destination, options);
}
module.exports = { restoreSourceTree };
if (require.main === module)
  restoreSourceTree(process.argv[2], process.argv[3])
    .then((r) => {
      console.log(
        JSON.stringify({
          restored: Object.keys(r.restored).length,
          unavailable: Object.keys(r.unavailable).length,
          virtualAssets: r.virtualAssets,
        }),
      );
    })
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    });
