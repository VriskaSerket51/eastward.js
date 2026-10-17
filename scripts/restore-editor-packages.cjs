// Refresh existing editor sources using production restorers; never launch the game.
const fs = require("node:fs/promises"),
  path = require("node:path");
const { Eastward, registerAll } = require("../dist");
const { restoreEditableAsset } = require("../dist/project-reconstruct");
const { projectAssetPath } = require("../dist/project");
const { resolveWithin, readFiles } = require("../dist/util/filesystem");
const { remapSourceFile } = require("../dist/util/source-reference");
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
  metadata.pathRemappings ??= {};
  const cache = path.resolve("node_modules/.cache");
  await fs.mkdir(cache, { recursive: true });
  const staging = await fs.mkdtemp(path.join(cache, "source-refresh-"));
  let regenerated = 0,
    changedFiles = 0;
  try {
    const refreshTypes = process.argv.includes("--references-only")
      ? []
      : [
          "msprite",
          "fsm_scheme",
          "quest_scheme",
          "scene_portal_graph",
          "story_graph",
        ];
    for (const [logical, node] of Object.entries(game.nodes)) {
      const existing = metadata.assets[logical];
      const packageUpgrade =
        !existing &&
        ["deck_pack", "named_tileset_pack", "texture_pack"].includes(node.type);
      if (!packageUpgrade && !refreshTypes.includes(node.type)) continue;
      if (!node.filePath) continue;
      const name =
        node.type === "deck_pack"
          ? logical.replace(/\.decks\.psd$/i, "") + ".deckpack"
          : logical;
      const target = existing ?? "game/asset/" + projectAssetPath(name);
      let result;
      try {
        result = await restoreEditableAsset(
          game,
          logical,
          target,
          async (file, bytes) => {
            const absolute = resolveWithin(staging, file);
            await fs.mkdir(path.dirname(absolute), { recursive: true });
            await fs.writeFile(absolute, bytes, { flag: "wx" });
          },
          projectAssetPath,
          staging,
        );
      } catch (error) {
        if (existing || packageUpgrade) throw error;
        console.error(logical, String(error));
        continue;
      }
      if (!result?.native) throw Error("Source refresh failed: " + logical);
      metadata.assets[logical] = result.path;
      if (name !== logical) metadata.pathRemappings[logical] = name;
      regenerated++;
      if (regenerated % 100 === 0)
        console.log("Regenerated", regenerated, "assets");
    }
    for (const file of await readFiles(staging)) {
      const target = resolveWithin(root, path.relative(staging, file));
      const bytes = await fs.readFile(file);
      let original;
      try {
        original = await fs.readFile(target);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      if (original?.equals(bytes)) continue;
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, bytes);
      changedFiles++;
    }
  } finally {
    // Only the fresh temporary directory under this workspace cache is removed.
    resolveWithin(cache, path.relative(cache, staging));
    await fs.rm(staging, { recursive: true, force: true });
  }
  let referencesChanged = 0;
  for (const record of Object.values(metadata.assets)) {
    const file = resolveWithin(root, record);
    if (await remapSourceFile(file, metadata.pathRemappings)) {
      referencesChanged++;
    }
  }
  await fs.writeFile(path.join(root, ".eastward-project.json"), JSON.stringify(metadata, null, 2));
  console.log(
    JSON.stringify({
      regenerated,
      changedFiles,
      referencesChanged,
      restored: Object.keys(metadata.assets).length,
    }),
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
