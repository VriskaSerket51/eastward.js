import type { Eastward } from "#eastward";
import type { Asset } from "#asset/node";
import type { TextureAsset } from "#asset/texture";
import type { DataXlsAsset } from "#asset/data";
import type { AssetType } from "#util/register";
import { cropHMG, decodeHMG, hmg2png, type HMG } from "#util/hmg";
import { decode } from "@msgpack/msgpack";
import path from "node:path";
import { createHash } from "node:crypto";
import { spriteAtlasPaths, spriteModuleAtlas } from "#util/sprite";

async function loadProjectAsset<T extends Asset>(
  game: Eastward,
  logical: string,
) {
  const node = game.getAssetNode(logical);
  if (!node) {
    throw new Error(`Missing asset node: ${logical}`);
  }
  if (!game.assetLoaders[node.type]) {
    const { register } = await import("#util/register");
    register(game, node.type as AssetType);
  }
  const asset = await game.loadAsset<T>(logical);
  if (!asset) {
    throw new Error(`Asset loader returned no asset: ${logical}`);
  }
  return asset;
}

export function projectResourceName(ref: string, original: any, image = false) {
  const role = Object.entries(original.objectFiles ?? {}).find(
    ([, value]) => value === ref,
  )?.[0];
  let name = role ?? path.posix.basename(ref);
  if (image) {
    name = path.posix.parse(name).name + ".png";
  }
  return name.replace(
    /[%<>:"\\|?*\x00-\x1f]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

const parentDefinitions = new WeakMap<Eastward, Map<string, Promise<any>>>();
function loadParentDefinition(game: Eastward, logical: string) {
  let cache = parentDefinitions.get(game);
  if (!cache) {
    cache = new Map();
    parentDefinitions.set(game, cache);
  }
  let pending = cache.get(logical);
  if (!pending) {
    pending = (async () => {
      const refs = game.nodes[logical]?.objectFiles;
      if (!refs) {
        throw new Error(`Missing parent resources: ${logical}`);
      }
      if (refs.export) {
        return game.loadJSONFile(refs.export + "/decks.json");
      }
      if (refs.packed_def) {
        const bytes = await game.loadFile(refs.packed_def);
        if (bytes) {
          return decode(bytes);
        }
      }
      if (refs.def) {
        return game.loadJSONFile(refs.def);
      }
      if (refs.data) {
        return game.loadJSONFile(refs.data);
      }
      throw new Error(`Missing parent definition: ${logical}`);
    })();
    cache.set(logical, pending);
  }
  return pending;
}

/** Convert only data present in the build; retain serialized graphs and frame IDs. */
export async function reconstructAsset(
  game: Eastward,
  logical: string,
  original: any,
  folder: string,
  resources: Record<string, string[]>,
  writeJSON: (file: string, value: unknown) => Promise<void>,
  writeBytes: (file: string, bytes: Uint8Array) => Promise<void>,
  assetFolder: (logical: string) => string,
) {
  const outputs: string[] = [];
  const resourceOutputs: Record<string, string> = {};
  const errors: Record<string, string> = {};
  const warnings: Record<string, string> = {};
  const resourceNames = new Map<string, string>();
  const resourceOutput = (ref: string, image: boolean) => {
    let name = projectResourceName(ref, original, image);
    const base = folder + (image ? "/images/" : "/definitions/");
    if (
      resourceNames.has(base + name) &&
      resourceNames.get(base + name) !== ref
    ) {
      const ext = path.posix.extname(name);
      name =
        name.slice(0, name.length - ext.length) +
        "~" +
        createHash("sha256").update(ref).digest("hex").slice(0, 8) +
        ext;
    }
    resourceNames.set(base + name, ref);
    return base + name;
  };
  const png = async (file: string, image: HMG) => {
    await writeBytes(file, await hmg2png(image));
    outputs.push(file);
  };
  const json = async (file: string, value: unknown) => {
    await writeJSON(file, value);
    outputs.push(file);
  };
  const definition = async () => {
    const refs = original.objectFiles;
    if (refs?.packed_def) {
      const bytes = await game.loadFile(refs.packed_def);
      if (bytes) {
        return decode(bytes);
      }
    }
    if (!refs?.def) {
      return null;
    }
    const bytes = await game.loadFile(refs.def);
    if (!bytes) {
      throw new Error(`Missing definition: ${refs.def}`);
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return /^\s*[\[{]/.test(text) ? JSON.parse(text) : text;
  };
  const texture = async (logicalPath: string) => {
    const node = game.nodes[logicalPath];
    if (!node) {
      throw new Error(`Missing texture node: ${logicalPath}`);
    }
    const asset = await loadProjectAsset<TextureAsset>(game, logicalPath);
    if (!asset.hmg) {
      throw new Error(`Missing texture pixels: ${logicalPath}`);
    }
    // PNG requires straight alpha. Never alter the cached runtime atlas.
    const image = asset.toSourceImage();
    const premultiplied = !!asset.info?.parent?.premultiplyAlpha;
    return { image, premultiplied };
  };
  const attempt = async (role: string, action: () => Promise<void>) => {
    try {
      await action();
    } catch (error) {
      // Filesystem failures must abort instead of producing a misleading report.
      if ((error as NodeJS.ErrnoException).code) {
        throw error;
      }
      errors[role] = String(error);
    }
  };
  if (original.type === "texture") {
    await attempt("texture", async () => {
      const { image, premultiplied } = await texture(logical);
      await png(folder + "/image.png", image);
      const info = game.findTexture(logical);
      await json(folder + "/image.json", {
        width: image.width,
        height: image.height,
        originalWidth: info.ow,
        originalHeight: info.oh,
        atlasRect: { x: info.x, y: info.y, width: info.w, height: info.h },
        premultipliedSource: premultiplied,
        alpha: "straight",
        precision: "8-bit; unpremultiplication may lose rounding precision",
      });
    });
  }
  if (original.type === "msprite") {
    await attempt("sprite", async () => {
      const def: any = await definition();
      if (!def?.modules || !def?.frames || !def?.anims) {
        throw new Error("Missing sprite definition");
      }
      const atlasIds = Object.keys(def.atlases);
      const texturePaths = spriteAtlasPaths(game.nodes[logical], def.atlases);
      const images: Record<string, HMG> = Object.create(null);
      const atlasFiles: Record<string, string> = Object.create(null);
      for (const [id, texturePath] of Object.entries(texturePaths)) {
        images[id] = (await texture(texturePath)).image;
        atlasFiles[id] =
          folder +
          (atlasIds.length === 1
            ? "/atlas.png"
            : "/atlases/" + encodeURIComponent(id) + ".png");
        await png(atlasFiles[id], images[id]);
      }
      const modules: Record<string, any> = {};
      for (const [id, value] of Object.entries<any>(def.modules)) {
        const image = spriteModuleAtlas(images, value.atlas);
        const [x, y, w, h] = value.rect;
        if (
          ![x, y, w, h].every(Number.isInteger) ||
          x < 0 ||
          y < 0 ||
          w <= 0 ||
          h <= 0 ||
          x + w > image.width ||
          y + h > image.height
        ) {
          throw new Error(`Invalid module rectangle: ${id}`);
        }
        const file = folder + "/modules/" + encodeURIComponent(id) + ".png";
        await png(file, cropHMG(image, { x, y, w, h }));
        modules[id] = { ...value, image: file };
      }
      await json(folder + "/sprite.json", {
        ...def,
        atlases: atlasFiles,
        modules,
        sourceTexture:
          atlasIds.length === 1 ? texturePaths[atlasIds[0]] : texturePaths,
        sourceDefinition: def,
        timingUnit: "seconds",
        imagePathsRelativeTo: "project-root",
      });
    });
  }
  // Readable source definitions retain IDs, aliases, anchors and editor metadata.
  if (
    !["msprite", "scene"].includes(original.type) &&
    (original.objectFiles?.def || original.objectFiles?.packed_def)
  ) {
    await attempt("definition", async () => {
      const value = await definition();
      if (typeof value === "string") {
        const extension =
          original.type === "bt_script"
            ? "bt_script"
            : ["fsm_scheme", "ui_style", "stylesheet"].includes(original.type)
              ? "lua"
              : "txt";
        const output = folder + "/definition." + extension;
        await writeBytes(output, new TextEncoder().encode(value));
        outputs.push(output);
      } else if (value !== null) {
        await json(folder + "/definition.json", value);
      }
    });
  }
  if (original.type === "scene") {
    // Compiled groups fill gaps; available editor definitions take precedence.
    const sceneFiles = [
      ...(resources.compiled ?? []),
      ...(resources.def ?? []),
    ];
    for (const ref of sceneFiles) {
      await attempt("scene:" + ref, async () => {
        const raw = await game.loadFile(ref);
        if (!raw) {
          throw new Error(`Missing scene data: ${ref}`);
        }
        const isDirectory = ref !== original.objectFiles?.def;
        if (isDirectory && !/\.(scene_group|json)(\.packed)?$/.test(ref)) {
          const base = ref.startsWith(original.objectFiles?.def + "/")
            ? original.objectFiles.def
            : original.objectFiles.compiled;
          const output = folder + "/scene/" + ref.slice(base.length + 1);
          await writeBytes(output, raw);
          outputs.push(output);
          resourceOutputs[ref] = output;
          return;
        }
        const value = ref.endsWith(".packed")
          ? decode(raw)
          : JSON.parse(new TextDecoder().decode(raw));
        const name = isDirectory
          ? path.posix.basename(ref).replace(/\.packed$/, "")
          : "scene.json";
        const output = folder + "/scene/" + name;
        await json(output, value);
        resourceOutputs[ref] = output;
      });
    }
    if (!sceneFiles.length) {
      errors.scene = "No source or compiled scene data available";
    }
  }
  for (const ref of new Set(Object.values(resources).flat())) {
    if (ref.endsWith(".json")) {
      await attempt(ref, async () => {
        const value = await game.loadJSONFile(ref);
        if (value === null) {
          throw new Error(`Missing definition: ${ref}`);
        }
        const output = resourceOutput(ref, false);
        await json(output, value);
        resourceOutputs[ref] = output;
      });
    }
    if (original.type === "texture" || original.type === "msprite") {
      continue;
    }
    const raw = await game.loadFile(ref);
    const isHMG = raw && raw[0] === 0x50 && raw[1] === 0x47 && raw[2] === 0x46;
    const isPNG =
      raw &&
      raw[0] === 0x89 &&
      raw[1] === 0x50 &&
      raw[2] === 0x4e &&
      raw[3] === 0x47;
    if (!isHMG && !isPNG) {
      continue;
    }
    await attempt(ref, async () => {
      if (!raw) {
        throw new Error(`Missing image: ${ref}`);
      }
      const output = resourceOutput(ref, true);
      if (isHMG) {
        await png(output, decodeHMG(raw));
      } else {
        await writeBytes(output, raw);
        outputs.push(output);
      }
      resourceOutputs[ref] = output;
      await json(output + ".json", {
        source: ref,
        alpha: "runtime representation; consult texture-group metadata",
      });
    });
  }
  if (original.type === "lua" && game.findScript(logical)) {
    await attempt("lua", async () => {
      const bytes = await game.loadFile(game.findScript(logical));
      if (!bytes) {
        throw new Error("Missing Lua bytecode");
      }
      const { decompileAsync } = await import("luajit-decompiler");
      const source = await decompileAsync(bytes);
      const file = folder + "/source.lua";
      await writeBytes(file, new TextEncoder().encode(source));
      outputs.push(file);
    });
  }
  const parent = logical.includes("/")
    ? logical.slice(0, logical.lastIndexOf("/"))
    : null;
  if (
    parent &&
    (original.type.startsWith("deck2d.") ||
      original.type === "named_tileset" ||
      original.type === "data_sheet")
  ) {
    await json(folder + "/source-link.json", {
      parentAsset: parent,
      parentFolder: assetFolder(parent),
      name: path.posix.basename(logical),
      original,
    });
    await attempt("parent-definition", async () => {
      const data = await loadParentDefinition(game, parent);
      const name = path.posix.basename(logical);
      let item: any;
      if (original.type === "data_sheet") {
        item = data?.[name];
      } else if (original.type === "named_tileset") {
        item = data?.themes?.find((entry: any) => entry.name === name);
      } else if (original.type === "deck2d.msprite_seq") {
        const animation: any = Object.values<any>(data?.anims ?? {}).find(
          (entry) => entry.name === name,
        );
        if (animation) {
          item = {
            animation,
            frames: Object.fromEntries(
              animation.seq.map((frame: any[]) => [
                frame[0],
                data.frames[frame[0]],
              ]),
            ),
            modules: data.modules,
            features: data.features,
            sprite: assetFolder(parent) + "/sprite.json",
            timingUnit: "seconds",
          };
        }
      } else {
        const decks = data?.decks ?? data?.map?.[data.root]?.body?.decks;
        item =
          decks &&
          Object.values<any>(decks)
            .map((entry) => entry.body ?? entry)
            .find((entry) => entry.name === name);
      }
      if (item === undefined) {
        throw new Error(`Child definition not found: ${logical}`);
      }
      await json(folder + "/definition.json", item);
    });
  }
  for (const role of ["data", "meta_data"]) {
    const ref = original.objectFiles?.[role];
    if (!ref || !resources[role]?.includes(ref)) {
      continue;
    }
    await attempt(role, async () => {
      const raw = await game.loadFile(ref);
      if (!raw) {
        throw new Error(`Missing data: ${ref}`);
      }
      const text = new TextDecoder().decode(raw);
      if (!/^\s*[\[{]/.test(text)) {
        if (!text.includes("\ufffd") && !/[\x00-\x08\x0e-\x1f]/.test(text)) {
          const output = folder + "/" + role + ".txt";
          await writeBytes(output, raw);
          outputs.push(output);
          resourceOutputs[ref] = output;
        }
        return;
      }
      let value: unknown;
      try {
        value = JSON.parse(text);
      } catch (error) {
        const output = folder + "/" + role + ".txt";
        await writeBytes(output, raw);
        outputs.push(output);
        resourceOutputs[ref] = output;
        warnings[role] =
          `Original data is not strict JSON; preserved as text: ${String(error)}`;
        return;
      }
      const output = folder + "/" + role + ".json";
      await json(output, value);
      resourceOutputs[ref] = output;
    });
  }
  if (original.objectFiles?.packed_data) {
    await attempt("packed_data", async () => {
      const raw = await game.loadFile(original.objectFiles.packed_data);
      if (!raw) {
        throw new Error("Missing packed data");
      }
      await json(folder + "/packed-data.json", decode(raw));
    });
  }
  for (const role of ["src", "script"]) {
    const ref = original.objectFiles?.[role];
    if (!ref || !resources[role]?.includes(ref)) {
      continue;
    }
    const raw = await game.loadFile(ref);
    if (!raw) {
      errors[role] = `Missing source: ${ref}`;
      continue;
    }
    const output =
      folder + "/" + (original.type === "glsl" ? "source.glsl" : role + ".txt");
    await writeBytes(output, raw);
    outputs.push(output);
    resourceOutputs[ref] = output;
  }
  if (original.type === "data_xls") {
    await attempt("workbook", async () => {
      const asset = await loadProjectAsset<DataXlsAsset>(game, logical);
      if (!asset.data || !asset.metaData) {
        throw new Error("Missing workbook data or metadata");
      }
      const { default: xlsx } = await import("xlsx");
      const workbook = asset.toWorkbook(asset.data, asset.metaData);
      const output = folder + "/workbook.xlsx";
      await writeBytes(
        output,
        xlsx.write(workbook, { bookType: "xlsx", type: "buffer" }),
      );
      outputs.push(output);
    });
  }
  return { outputs: [...new Set(outputs)], errors, warnings, resourceOutputs };
}

/** Restore editor-readable files without claiming that derived files are originals. */
export async function restoreEditableAsset(
  game: Eastward,
  logical: string,
  target: string,
  write: (file: string, bytes: Uint8Array) => Promise<void>,
  safeName: (name: string) => string,
  destinationRoot: string,
): Promise<{
  path: string;
  provenance: string;
  native: boolean;
  warning?: string;
} | null> {
  const node = game.nodes[logical];
  const { imageToPSD, animationToASE } = await import("#util/source-image");
  const { sourceGraphML, sourceFSMGraphML } = await import(
    "#util/source-graph"
  );
  const { png2hmg } = await import("#util/hmg");
  const refs = node.objectFiles ?? {};
  const json = (file: string, value: any) =>
    write(file, new TextEncoder().encode(JSON.stringify(value, null, 2)));
  if (node.type === "texture") {
    const asset = await loadProjectAsset<TextureAsset>(game, logical);
    const image = asset.toSourceImage();
    const output = /\.psd$/i.test(target) ? target : target + ".recovered.png";
    await write(
      output,
      /\.psd$/i.test(target) ? imageToPSD(image) : await hmg2png(image),
    );
    return {
      path: output,
      provenance: "flattened-runtime-image",
      native: output === target,
    };
  }
  if (node.type === "lut_texture") {
    const bytes = await game.loadFile(refs.texture);
    if (!bytes) {
      throw new Error("Missing LUT pixels");
    }
    const image = bytes[0] === 0x89 ? await png2hmg(bytes) : decodeHMG(bytes);
    await write(target, imageToPSD(image));
    return { path: target, provenance: "flattened-runtime-lut", native: true };
  }
  if (node.type === "msprite") {
    const def = await loadParentDefinition(game, logical);
    const atlases: Record<string, HMG> = Object.create(null);
    for (const [id, texturePath] of Object.entries(
      spriteAtlasPaths(node, def.atlases),
    )) {
      const texture = await loadProjectAsset<TextureAsset>(game, texturePath);
      atlases[id] = texture.toSourceImage();
    }
    let count = 0;
    const animations = Object.values<any>(def.anims);
    for (const anim of animations.filter((a) => !a.name.includes(":"))) {
      if (!anim.seq.length) {
        continue;
      }
      const tags = [];
      for (const sub of animations.filter(
        (a) => a.name.startsWith(anim.name + ":") && a.seq.length,
      )) {
        let from = -1;
        for (let i = 0; i <= anim.seq.length - sub.seq.length; i++) {
          if (
            sub.seq.every(
              (entry: any[], j: number) =>
                JSON.stringify(entry) === JSON.stringify(anim.seq[i + j]),
            )
          ) {
            from = i;
            break;
          }
        }
        if (from < 0) {
          throw new Error(
            "Sprite tag is not a contiguous source sequence: " + sub.name,
          );
        }
        tags.push({
          name:
            (sub.deprecated ? "///" : "") +
            sub.name.slice(anim.name.length + 1),
          from,
          to: from + sub.seq.length - 1,
        });
      }
      await write(
        target + "/" + safeName(anim.name) + ".ase",
        animationToASE(def, anim, atlases, tags),
      );
      count++;
    }
    const orphan = animations.find(
      (a) =>
        a.name.includes(":") &&
        !animations.some(
          (base) =>
            a.name.startsWith(base.name + ":") && !base.name.includes(":"),
        ),
    );
    if (orphan) {
      throw new Error("Missing source animation for tag: " + orphan.name);
    }
    if (!count) {
      throw new Error("No sprite animation frames");
    }
    await json(target + "/runtime-definition.json", def);
    for (const [id, atlas] of Object.entries(atlases)) {
      const output =
        Object.keys(atlases).length === 1
          ? "/atlas.png"
          : "/atlases/" + safeName(id) + ".png";
      await write(target + output, await hmg2png(atlas));
    }
    return {
      path: target,
      provenance: "reconstructed-ase-parts-and-timing",
      native: true,
    };
  }
  if (
    ["scene_portal_graph", "quest_scheme", "story_graph"].includes(node.type)
  ) {
    const data = await game.loadJSONFile(refs.def);
    if (!data) {
      throw new Error("Missing graph nodes");
    }
    await write(
      target,
      new TextEncoder().encode(sourceGraphML(node.type, data)),
    );
    await json(target + ".runtime.json", data);
    const hasTransitions = (nodes: any[]): boolean =>
      nodes.some((n) => !!n.transition || hasTransitions(n.children ?? []));
    return {
      path: target,
      provenance: "reconstructed-graph-topology",
      native: true,
      ...(node.type === "quest_scheme" && hasTransitions(data.nodes)
        ? {
            warning:
              "Public Gii importer predates quest transition metadata; retained in GraphML and runtime JSON.",
          }
        : {}),
    };
  }
  if (node.type === "fsm_scheme") {
    const bytes = await game.loadFile(refs.def);
    if (!bytes?.length) {
      throw new Error("No usable compiled graph data");
    }
    await write(
      target,
      new TextEncoder().encode(
        await sourceFSMGraphML(new TextDecoder().decode(bytes)),
      ),
    );
    await write(target + ".runtime.lua", bytes);
    return {
      path: target,
      provenance: "reconstructed-effective-fsm-graph",
      native: true,
    };
  }
  if (
    [
      "deck_pack",
      "deck_pack_raw",
      "named_tileset_pack",
      "texture_pack",
      "mesh",
    ].includes(node.type)
  ) {
    const asset = await loadProjectAsset(game, logical);
    if (["texture_pack", "named_tileset_pack"].includes(node.type)) {
      await asset.saveFile(path.resolve(destinationRoot, target));
      return {
        path: target,
        provenance: "reconstructed-layered-psd",
        native: true,
      };
    }
    const output = target;
    await asset.saveFile(path.resolve(destinationRoot, output));
    if (node.type === "mesh") {
      const bytes = await game.loadFile(refs.mesh + "/mesh");
      if (!bytes) {
        throw new Error("Missing original mesh data");
      }
      await write(output + "/runtime.assxml", bytes);
    }
    return {
      path: output,
      provenance:
        node.type === "mesh" ? "reconstructed-obj" : "decoded-package-data",
      native: ["deck_pack", "deck_pack_raw", "mesh"].includes(node.type),
      ...(node.type === "deck_pack"
        ? {
            warning:
              "Restored as a Gii raw deckpack; original PSD authoring layers are unavailable.",
          }
        : {}),
    };
  }
  return null;
}
