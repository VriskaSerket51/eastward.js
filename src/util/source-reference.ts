import fs from "node:fs/promises";
import path from "node:path";
import xlsx from "xlsx";
import { isDir, readFiles } from "#util/filesystem";

export function remapSourceReferences(
  text: string,
  mappings: Record<string, string>,
): string {
  const escape = (value: string) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const names = Object.keys(mappings).sort((a, b) => b.length - a.length);
  if (!names.length) {
    return text;
  }
  const pattern = new RegExp(
    "(?<![\\w./-])((?:game/asset/)?)(" +
      names.map(escape).join("|") +
      ")(?=/|[\\s\"'`\\]})>,;:]|$)",
    "g",
  );
  return text.replace(
    pattern,
    (_match: string, prefix: string, name: string) => prefix + mappings[name],
  );
}

/** Gii stores embedded scene prototypes as Base64-encoded JSON source. */
function remapScenePrototypes(
  text: string,
  mappings: Record<string, string>,
): string {
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return text;
    }
    throw error;
  }
  if (!Array.isArray(data?.protos)) {
    return text;
  }
  let changed = false;
  for (const proto of data.protos) {
    if (typeof proto?.serialized !== "string") {
      continue;
    }
    const bytes = Buffer.from(proto.serialized, "base64");
    const source = bytes.toString("utf8");
    if (!Buffer.from(source).equals(bytes)) {
      continue;
    }
    // Opaque or malformed prototype bodies are preserved, never reinterpreted.
    try {
      JSON.parse(source);
    } catch (error) {
      if (error instanceof SyntaxError) {
        continue;
      }
      throw error;
    }
    const rewritten = remapSourceReferences(source, mappings);
    if (rewritten !== source) {
      proto.serialized = Buffer.from(rewritten).toString("base64");
      changed = true;
    }
  }
  return changed ? JSON.stringify(data, null, 2) : text;
}

/** Rewrite references in source documents; binary images and runtime sidecars remain intact. */
export async function remapSourceFile(
  file: string,
  mappings: Record<string, string>,
): Promise<boolean> {
  if (await isDir(file)) {
    let changed = false;
    for (const child of await readFiles(file)) {
      if (await remapSourceFile(child, mappings)) {
        changed = true;
      }
    }
    return changed;
  }
  const name = path.basename(file);
  if (
    name === "runtime-definition.json" ||
    name.endsWith(".runtime.json") ||
    name.endsWith(".runtime.lua")
  ) {
    return false;
  }
  const extension = path.extname(file).toLowerCase();
  if ([".xls", ".xlsx"].includes(extension)) {
    const raw = await fs.readFile(file),
      book = xlsx.read(raw, { type: "buffer" });
    let changed = false;
    for (const sheet of Object.values(book.Sheets)) {
      for (const [key, cell] of Object.entries(sheet)) {
        if (
          key.startsWith("!") ||
          cell.t !== "s" ||
          typeof cell.v !== "string"
        ) {
          continue;
        }
        const value = remapSourceReferences(cell.v, mappings);
        if (value !== cell.v) {
          cell.v = value;
          delete cell.w;
          changed = true;
        }
      }
    }
    if (changed) {
      await fs.writeFile(
        file,
        xlsx.write(book, {
          type: "buffer",
          bookType: extension === ".xls" ? "biff8" : "xlsx",
        }),
      );
    }
    return changed;
  }
  // Only registered text/document source formats, never opaque raw files.
  if (
    ![
      ".lua",
      ".json",
      ".scene",
      ".scene_group",
      ".prefab",
      ".proto",
      ".sq",
      ".csv",
      ".assetmap",
      ".asset_map",
      ".material",
      ".effect",
      ".ui",
      ".stylesheet",
      ".scheme",
      ".bt",
      ".bt_script",
      ".com_script",
      ".shader_script",
      ".glsl",
      ".fsh",
      ".vsh",
      ".ui_style",
      ".render_target",
      ".tb_scheme",
      ".txt",
    ].includes(extension)
  ) {
    return false;
  }
  const raw = await fs.readFile(file),
    text = raw.toString("utf8");
  if (!Buffer.from(text).equals(raw)) {
    return false;
  }
  let rewritten = remapSourceReferences(text, mappings);
  if ([".scene", ".scene_group"].includes(extension)) {
    rewritten = remapScenePrototypes(rewritten, mappings);
  }
  if (rewritten === text) {
    return false;
  }
  await fs.writeFile(file, rewritten);
  return true;
}
