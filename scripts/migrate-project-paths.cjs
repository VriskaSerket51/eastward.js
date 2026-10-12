// Migrate the legacy a-/percent-encoded layout without regenerating image data.
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID, createHash } = require("node:crypto");
const { projectAssetPaths, projectAssetPath } = require("../dist");
const { projectResourceName } = require("../dist/project-reconstruct");

const root = fs.realpathSync(process.argv[2] || ".");
const safe = (relative) => {
  const absolute = path.resolve(root, relative);
  if (!absolute.toLowerCase().startsWith(root.toLowerCase() + path.sep))
    throw new Error(`Unsafe output path: ${relative}`);
  return absolute;
};
const manifest = JSON.parse(fs.readFileSync(safe("project.json")));
if (manifest.format !== "eastward-recovery-project")
  throw new Error("Not a recovery project");
if (manifest.pathLayout === "logical" && process.argv[3] !== "--resource-names")
  throw new Error("Already migrated");
const names = projectAssetPaths(Object.keys(manifest.assets));
const folderMap = new Map(
  Object.entries(manifest.assets).map(([logical, entry]) => [
    entry.folder,
    "assets/" + names[logical],
  ]),
);
const fileMap = new Map();
const rewritePath = (value) => {
  if (fileMap.has(value)) return fileMap.get(value);
  let prefix = value;
  while (prefix) {
    if (folderMap.has(prefix))
      return folderMap.get(prefix) + value.slice(prefix.length);
    const slash = prefix.lastIndexOf("/");
    if (slash < 0) break;
    prefix = prefix.slice(0, slash);
  }
  return value;
};
const rewrite = (value) => {
  if (typeof value === "string") return rewritePath(value);
  if (Array.isArray(value)) return value.map(rewrite);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        ["original", "sourceDefinition"].includes(key) ? child : rewrite(child),
      ]),
    );
  return value;
};
const levels = new Map();
for (const [oldFolder, newFolder] of folderMap) {
  safe(oldFolder);
  safe(newFolder);
  if (
    !oldFolder.startsWith("assets/") ||
    !fs.statSync(safe(oldFolder)).isDirectory()
  )
    throw new Error(`Missing source: ${oldFolder}`);
  if (oldFolder === newFolder) continue;
  const depth = oldFolder.split("/").length;
  const operations = levels.get(depth) || [];
  operations.push({
    source: oldFolder,
    target:
      path.posix.dirname(oldFolder) + "/" + path.posix.basename(newFolder),
    temporary: path.posix.dirname(oldFolder) + "/.rename-" + randomUUID(),
  });
  levels.set(depth, operations);
}
fs.writeFileSync(
  safe("path-migration.json"),
  JSON.stringify({ folders: [...folderMap], levels: [...levels] }),
);
let moved = 0;
for (const depth of [...levels.keys()].sort((a, b) => b - a)) {
  const operations = levels.get(depth);
  const sources = new Set(
    operations.map((op) => safe(op.source).toLowerCase()),
  );
  for (const op of operations)
    if (
      fs.existsSync(safe(op.target)) &&
      !sources.has(safe(op.target).toLowerCase())
    )
      throw new Error(`Target occupied: ${op.target}`);
  for (const op of operations)
    fs.renameSync(safe(op.source), safe(op.temporary));
  for (const op of operations)
    fs.renameSync(safe(op.temporary), safe(op.target));
  moved += operations.length;
  console.log(`Moved ${moved}/${folderMap.size} asset directories`);
}
let updated = 0;
for (const [logical, record] of Object.entries(manifest.assets)) {
  const oldFolder = record.folder;
  const folder = folderMap.get(oldFolder);
  const assetFile = safe(folder + "/asset.json");
  let entry = JSON.parse(fs.readFileSync(assetFile));
  const usedNames = new Map();
  for (const [ref, oldFile] of Object.entries(
    entry.reconstructed?.resourceOutputs ?? {},
  )) {
    const image = oldFile.startsWith(oldFolder + "/images/");
    if (!image && !oldFile.startsWith(oldFolder + "/definitions/")) continue;
    let name = projectResourceName(ref, entry.original, image);
    const base = folder + (image ? "/images/" : "/definitions/");
    if (usedNames.has(base + name) && usedNames.get(base + name) !== ref) {
      const ext = path.posix.extname(name);
      name =
        name.slice(0, name.length - ext.length) +
        "~" +
        createHash("sha256").update(ref).digest("hex").slice(0, 8) +
        ext;
    }
    const target = base + name;
    usedNames.set(target, ref);
    const source = rewritePath(oldFile);
    if (source !== target) {
      if (fs.existsSync(safe(target)))
        throw new Error(`Target occupied: ${target}`);
      fs.renameSync(safe(source), safe(target));
      fileMap.set(oldFile, target);
      if (image && fs.existsSync(safe(source + ".json"))) {
        fs.renameSync(safe(source + ".json"), safe(target + ".json"));
        fileMap.set(oldFile + ".json", target + ".json");
      }
    }
  }
  for (const oldFile of entry.decoded || []) {
    const name = path.posix.basename(oldFile);
    if (!name.startsWith("a-")) continue;
    const target =
      folder + "/" + projectAssetPath(decodeURIComponent(name.slice(2)));
    const source = rewritePath(oldFile);
    if (source !== target) {
      if (fs.existsSync(safe(target)))
        throw new Error(`Target occupied: ${target}`);
      fs.renameSync(safe(source), safe(target));
      fileMap.set(oldFile, target);
    }
  }
  entry = rewrite(entry);
  fs.writeFileSync(assetFile, JSON.stringify(entry, null, 2));
  record.folder = folder;
  const spriteFile = folder + "/sprite.json";
  if (fs.existsSync(safe(spriteFile)))
    fs.writeFileSync(
      safe(spriteFile),
      JSON.stringify(
        rewrite(JSON.parse(fs.readFileSync(safe(spriteFile)))),
        null,
        2,
      ),
    );
  const linkFile = folder + "/source-link.json";
  if (fs.existsSync(safe(linkFile)))
    fs.writeFileSync(
      safe(linkFile),
      JSON.stringify(
        rewrite(JSON.parse(fs.readFileSync(safe(linkFile)))),
        null,
        2,
      ),
    );
  if (record.type === "deck2d.msprite_seq") {
    const definition = folder + "/definition.json";
    if (fs.existsSync(safe(definition))) {
      const data = JSON.parse(fs.readFileSync(safe(definition)));
      data.sprite = rewritePath(data.sprite);
      fs.writeFileSync(safe(definition), JSON.stringify(data, null, 2));
    }
  }
  if (++updated % 5000 === 0)
    console.log(`Updated references ${updated}/${folderMap.size}`);
}
manifest.pathLayout = "logical";
fs.writeFileSync(safe("project.json"), JSON.stringify(manifest, null, 2));
fs.writeFileSync(
  safe("path-map.json"),
  JSON.stringify(
    Object.fromEntries(
      Object.entries(manifest.assets).map(([logical, entry]) => [
        logical,
        entry.folder,
      ]),
    ),
    null,
    2,
  ),
);
console.log(
  `Migrated ${updated} assets; original names preserved except Windows restrictions and case collisions.`,
);
