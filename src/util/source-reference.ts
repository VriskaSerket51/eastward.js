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
  const rewritten = remapSourceReferences(text, mappings);
  if (rewritten === text) {
    return false;
  }
  await fs.writeFile(file, rewritten);
  return true;
}
