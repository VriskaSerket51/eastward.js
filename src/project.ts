import { register, type AssetType } from "#util/register";
import { TextureAsset } from "#asset/texture";
import { hmg2png } from "#util/hmg";
import type { Eastward } from "#eastward";
import fs from "node:fs/promises";
import path from "node:path";
import { decode } from "@msgpack/msgpack";
import { reconstructAsset, restoreEditableAsset } from "#project-reconstruct";
import { createHash } from "node:crypto";
import { remapSourceFile } from "#util/source-reference";

export type ProjectExportOptions = {
  assetPaths?: string[];
  onProgress?: (completed: number, total: number, asset: string) => void;
};

// Keep familiar source names; escape only characters Windows cannot represent.
export function projectAssetPath(
  logicalPath: string,
  collisions: ReadonlySet<string> = new Set(),
) {
  const segments = logicalPath.split("/");
  return segments
    .map((segment, index) => {
      if (!segment || segment === "." || segment === "..") {
        throw new Error(`Invalid asset path: ${logicalPath}`);
      }
      let name = segment.replace(
        /[%<>:"\\|?*\x00-\x1f]/g,
        (c) =>
          "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"),
      );
      name = name.replace(/[. ]+$/, (tail) =>
        [...tail]
          .map((c) => "%" + c.charCodeAt(0).toString(16).toUpperCase())
          .join(""),
      );
      if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name)) {
        name =
          "%" + name.charCodeAt(0).toString(16).toUpperCase() + name.slice(1);
      }
      const prefix = segments.slice(0, index + 1).join("/");
      if (collisions.has(prefix)) {
        name +=
          "~" + createHash("sha256").update(prefix).digest("hex").slice(0, 8);
      }
      return name;
    })
    .join("/");
}

export function projectAssetPaths(logicalPaths: string[]) {
  const prefixes = new Set<string>();
  for (const logical of logicalPaths) {
    const segments = logical.split("/");
    for (let i = 1; i <= segments.length; i++) {
      prefixes.add(segments.slice(0, i).join("/"));
    }
  }
  const groups = new Map<string, string[]>();
  for (const prefix of prefixes) {
    const key = projectAssetPath(prefix).toLowerCase();
    const group = groups.get(key) ?? [];
    group.push(prefix);
    groups.set(key, group);
  }
  const collisions = new Set(
    [...groups.values()].filter((group) => group.length > 1).flat(),
  );
  return Object.fromEntries(
    logicalPaths.map((logical) => [
      logical,
      projectAssetPath(logical, collisions),
    ]),
  );
}

export async function exportProject(
  game: Eastward,
  destination: string,
  options: ProjectExportOptions = {},
) {
  const out = path.resolve(destination);
  const sourceRoot = path.resolve(game.config.root);
  const relativeOutput = path.relative(sourceRoot, out);
  if (
    !relativeOutput ||
    (!relativeOutput.startsWith(".." + path.sep) &&
      relativeOutput !== ".." &&
      !path.isAbsolute(relativeOutput))
  ) {
    throw new Error("Project output must be outside the game directory");
  }
  const writeJSON = async (relative: string, value: unknown) => {
    const file = path.join(out, relative);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(value, null, 2));
  };
  const writeBytes = async (relative: string, value: Uint8Array) => {
    const file = path.join(out, relative);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, value);
  };
  const configBytes = await game.loadFile("config/game_config");
  if (!configBytes) {
    throw new Error("Missing game configuration");
  }
  const config = JSON.parse(new TextDecoder().decode(configBytes));
  const indexBytes = await game.loadFile(config.asset_library + ".packed");
  const index: Record<string, any> = indexBytes
    ? (decode(indexBytes) as any)
    : await game.loadJSONFile(config.asset_library);
  if (!index) {
    throw new Error("Missing asset index");
  }
  const paths = [...new Set(options.assetPaths ?? Object.keys(index))];
  const assetPaths = projectAssetPaths(Object.keys(index));
  for (const p of paths) {
    if (!index[p]) {
      throw new Error(`Unknown asset: ${p}`);
    }
  }
  for (const p of paths) {
    projectAssetPath(p);
  }
  // Use a fresh output directory; never merge unrelated or stale project files.
  await fs.mkdir(out);
  await writeJSON("metadata/asset-index.json", index);
  await writeJSON("metadata/game-config.json", config);
  await writeJSON(
    "metadata/script-index.json",
    await game.loadJSONFile(config.script_library),
  );
  await writeJSON(
    "metadata/texture-index.json",
    await game.loadJSONFile(config.texture_library),
  );
  const resources = new Set<string>();
  for (const [archiveName, archive] of Object.entries(game.archives)) {
    for (const name of await archive.getFileNames()) {
      resources.add(archiveName + "/" + name);
    }
  }
  const physicalRoot = path.join(sourceRoot, "content", "game");
  for (const entry of await fs.readdir(physicalRoot, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (entry.isFile() && !entry.name.endsWith(".g")) {
      resources.add(
        path
          .relative(physicalRoot, path.join(entry.parentPath, entry.name))
          .replace(/\\/g, "/"),
      );
    }
  }
  const copied = new Set<string>();
  const missing = new Set<string>();
  const directories = new Map<string, string[]>();
  for (const file of resources) {
    const segments = file.split("/");
    for (let i = 1; i < segments.length; i++) {
      const dir = segments.slice(0, i).join("/");
      const entries = directories.get(dir) ?? [];
      entries.push(file);
      directories.set(dir, entries);
    }
  }
  const resolveFiles = (ref: string) =>
    resources.has(ref)
      ? [ref]
      : (directories.get(ref.replace(/\/$/, "")) ?? []);
  const copy = async (ref: string) => {
    const files = resolveFiles(ref);
    if (!files.length) {
      missing.add(ref);
    }
    for (const file of files) {
      if (copied.has(file)) {
        continue;
      }
      if (
        file.split("/").some((p) => !p || p === "." || p === "..") ||
        /[\\:]/.test(file)
      ) {
        throw new Error(`Unsafe resource path: ${file}`);
      }
      const data = await game.loadFile(file);
      if (!data) {
        missing.add(file);
        continue;
      }
      const target = path.join(out, "resources", file);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, data);
      copied.add(file);
    }
    return files.filter((file) => copied.has(file));
  };
  for (const ref of [
    "config/game_config",
    config.asset_library,
    config.asset_library + ".packed",
    config.script_library,
    config.texture_library,
  ]) {
    if (resources.has(ref)) {
      await copy(ref);
    }
  }
  // Preserve unindexed runtime files too when recovering the complete project.
  if (!options.assetPaths) {
    for (const file of resources) {
      await copy(file);
    }
  }
  const assets: Record<string, any> = Object.create(null);
  const reconstructionErrors: Record<string, Record<string, string>> = {};
  const reconstructionWarnings: Record<string, Record<string, string>> = {};
  let reconstructedCount = 0;
  let completed = 0;
  for (const logical of paths) {
    const original = index[logical];
    const folder = "assets/" + assetPaths[logical];
    const parent = logical.includes("/")
      ? logical.slice(0, logical.lastIndexOf("/"))
      : null;
    const files: Record<string, string[]> = {};
    const decoded: string[] = [];
    const decodeErrors: Record<string, string> = {};
    for (const [role, ref] of Object.entries(original.objectFiles || {})) {
      if (typeof ref !== "string" || !ref) {
        continue;
      }
      files[role] = await copy(ref);
      if (role.startsWith("packed_") && resources.has(ref)) {
        const data = await game.loadFile(ref);
        if (data) {
          let value: unknown;
          try {
            value = decode(data);
          } catch (error) {
            decodeErrors[role] = String(error);
            continue;
          }
          const target = folder + "/" + projectAssetPath(role) + ".json";
          await writeJSON(target, value);
          decoded.push(target);
        }
      }
    }
    const script = game.findScript(logical);
    if (script) {
      files.script = await copy(script);
    }
    if (original.type === "texture") {
      const texture = game.findTexture(logical);
      if (texture?.parent?.atlasMode && texture.parent.atlasCachePath) {
        files.textureAtlas = await copy(texture.parent.atlasCachePath);
      }
    }
    const reconstructed = await reconstructAsset(
      game,
      logical,
      original,
      folder,
      files,
      writeJSON,
      writeBytes,
      (logical) =>
        "assets/" + (assetPaths[logical] ?? projectAssetPath(logical)),
    );
    const hasEditableData = reconstructed.outputs.some(
      (file) => !file.endsWith("/source-link.json"),
    );
    if (hasEditableData) {
      reconstructedCount++;
    }
    if (Object.keys(reconstructed.errors).length) {
      reconstructionErrors[logical] = reconstructed.errors;
    }
    if (Object.keys(reconstructed.warnings).length) {
      reconstructionWarnings[logical] = reconstructed.warnings;
    }
    const entry = {
      logicalPath: logical,
      parent,
      folder,
      virtual: original.filePath === false,
      original,
      resources: files,
      decoded,
      decodeErrors,
      reconstructed,
      recovery:
        original.type === "folder"
          ? "structure"
          : hasEditableData
            ? "editable-data"
            : Object.values(files).some((list) => list.length)
              ? "runtime-resources"
              : "metadata-only",
    };
    assets[logical] = {
      folder,
      parent,
      type: original.type,
      recovery: entry.recovery,
    };
    await writeJSON(folder + "/asset.json", entry);
    options.onProgress?.(++completed, paths.length, logical);
  }
  const manifest = {
    format: "eastward-recovery-project",
    version: 2,
    pathLayout: "logical",
    assetCount: paths.length,
    reconstructedCount,
    reconstructionErrors,
    reconstructionWarnings,
    resourceCount: copied.size,
    partial: paths.length !== Object.keys(index).length,
    assets,
    missingResources: [...missing],
    limitations: [
      "Original editor source files are not reconstructed.",
      "This is not a directly loadable Gii project.",
      "Decoded JSON is a readable companion; original resource bytes are authoritative.",
    ],
  };
  await writeJSON("project.json", manifest);
  await writeJSON(
    "path-map.json",
    Object.fromEntries(
      Object.entries(assets).map(([logical, entry]) => [logical, entry.folder]),
    ),
  );
  return manifest;
}

export type SourceProjectOptions = ProjectExportOptions;

// These resources are the source itself, rather than importer-generated caches.
const sourceRoles: Record<string, string> = {
  bt_script: "def",
  material: "def",
  physics_body_def: "def",
  physics_material: "def",
  effect: "def",
  prefab: "def",
  render_target: "def",
  ui_style: "def",
  stylesheet: "def",
  deck2d: "def",
  glsl: "src",
  shader_script: "src",
  com_script: "script",
  data_json: "data",
  animator_data: "data",
  raw: "data",
  tb_scheme: "data",
  font_ttf: "font",
  font_bmfont: "font",
  movie: "data",
};

export async function exportSourceProject(
  game: Eastward,
  destination: string,
  options: SourceProjectOptions = {},
) {
  const out = path.resolve(destination);
  const rel = path.relative(path.resolve(game.config.root), out);
  if (
    !rel ||
    (rel !== ".." && !rel.startsWith(".." + path.sep) && !path.isAbsolute(rel))
  ) {
    throw new Error("Source project must be outside the input directory");
  }
  const paths = options.assetPaths ?? Object.keys(game.nodes);
  const pathRemappings: Record<string, string> = Object.create(null);
  for (const node of Object.values(game.nodes)) {
    if (node.type === "deck_pack" && node.filePath) {
      pathRemappings[node.path] =
        node.path.replace(/\.decks\.psd$/i, "") + ".deckpack";
    }
  }
  const sourcePath = (logical: string) => {
    for (const [original, replacement] of Object.entries(pathRemappings)) {
      if (logical === original || logical.startsWith(original + "/")) {
        return replacement + logical.slice(original.length);
      }
    }
    return logical;
  };
  const sourcePaths = projectAssetPaths(
    Object.keys(game.nodes).map(sourcePath),
  );
  const mapping = Object.fromEntries(
    Object.keys(game.nodes).map((logical) => [
      logical,
      sourcePaths[sourcePath(logical)],
    ]),
  );
  const physicalPaths = Object.values(game.nodes)
    .filter((node) => node.filePath)
    .map((node) => mapping[node.path]);
  if (new Set(physicalPaths).size !== physicalPaths.length) {
    throw new Error(
      "Source package path remapping collides with an existing asset",
    );
  }
  for (const logical of paths) {
    if (!game.nodes[logical]) {
      throw new Error("Unknown asset: " + logical);
    }
  }
  await fs.mkdir(out);
  const report = {
    format: "eastward-source-restoration",
    restored: Object.create(null) as Record<
      string,
      { path: string; provenance: string }
    >,
    warnings: Object.create(null) as Record<string, string>,
    alternatives: Object.create(null) as Record<
      string,
      { path: string; provenance: string }
    >,
    unavailable: Object.create(null) as Record<string, string>,
    virtualAssets: 0,
    pathRemappings,
    remappedDocuments: [] as string[],
    limitations: [
      "Original project settings are unavailable.",
      "Gii loading has not been verified.",
      "Reconstructed sources may lose editor-only information.",
    ],
  };
  let completed = 0;
  for (const logical of paths) {
    const node = game.nodes[logical];
    if (!node.filePath) {
      report.virtualAssets++;
      options.onProgress?.(++completed, paths.length, logical);
      continue;
    }
    if (node.filePath !== "game/asset/" + logical) {
      throw new Error("Unexpected source path: " + node.filePath);
    }
    const target = "game/asset/" + mapping[logical];
    const absolute = path.join(out, target);
    let provenance = "original-bytes";
    try {
      if (node.type === "folder") {
        await fs.mkdir(absolute, { recursive: true });
        provenance = "indexed-directory";
      } else if (sourceRoles[node.type]) {
        const ref = node.objectFiles?.[sourceRoles[node.type]];
        const bytes = ref && (await game.loadFile(ref));
        if (!bytes) {
          throw new Error("Required source bytes are missing");
        }
        await fs.mkdir(path.dirname(absolute), { recursive: true });
        await fs.writeFile(absolute, bytes, { flag: "wx" });
      } else if (
        [
          "fs_project",
          "file",
          "texture_processor",
          "lua",
          "sq_script",
          "data_csv",
          "data_xls",
          "scene",
          "locale_pack",
          "multi_texture",
          "code_tileset",
          "asset_map",
        ].includes(node.type) ||
        (node.type === "texture" && /\.png$/i.test(logical))
      ) {
        if (!game.assetLoaders[node.type]) {
          register(game, node.type as AssetType);
        }
        const asset = await game.loadAsset(logical);
        if (!asset) {
          throw new Error("Asset loader returned no asset");
        }
        if (asset instanceof TextureAsset) {
          const image = asset.toSourceImage();
          await fs.mkdir(path.dirname(absolute), { recursive: true });
          await fs.writeFile(absolute, await hmg2png(image), { flag: "wx" });
          provenance = "decoded-runtime-pixels";
        } else {
          await asset.saveFile(absolute);
          await fs.access(absolute); // Existing saveFile methods can return without writing.
          provenance =
            node.type === "fs_project"
              ? "original-built-resources"
              : node.type === "lua"
                ? "decompiled"
                : "reconstructed-" + node.type;
        }
      } else {
        const recovered = await restoreEditableAsset(
          game,
          logical,
          target,
          async (file, bytes) => {
            const output = path.join(out, file);
            await fs.mkdir(path.dirname(output), { recursive: true });
            await fs.writeFile(output, bytes, { flag: "wx" });
          },
          (name) => projectAssetPath(name),
          out,
        );
        if (!recovered) {
          throw new Error(
            "Original editor source has not been recovered for type " +
              node.type,
          );
        }
        await fs.access(path.join(out, recovered.path));
        if (recovered.warning) {
          report.warnings[logical] = recovered.warning;
        }
        if (!recovered.native) {
          report.alternatives[logical] = {
            path: recovered.path,
            provenance: recovered.provenance,
          };
          report.unavailable[logical] =
            "Original editor source unavailable; recovered data at " +
            recovered.path;
          options.onProgress?.(++completed, paths.length, logical);
          continue;
        }
        provenance = recovered.provenance;
      }
      report.restored[logical] = { path: target, provenance };
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code &&
        !["ENOENT"].includes((error as NodeJS.ErrnoException).code!)
      ) {
        throw error;
      }
      report.unavailable[logical] = String(error);
    }
    options.onProgress?.(++completed, paths.length, logical);
  }
  for (const record of Object.values(report.restored)) {
    const file = path.join(out, record.path);
    if (await remapSourceFile(file, pathRemappings)) {
      report.remappedDocuments.push(record.path);
      record.provenance += "-remapped-references";
    }
  }
  await fs.writeFile(out + ".recovery.json", JSON.stringify(report, null, 2), {
    flag: "wx",
  });
  return report;
}
