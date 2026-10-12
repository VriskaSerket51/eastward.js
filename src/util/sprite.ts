import type { AssetNode } from "#asset/node";
import type { HMG } from "#util/hmg";
import path from "node:path";

/** Resolve recorded atlas references; the public importer uses one texture child. */
export function spriteAtlasPaths(
  node: AssetNode,
  atlases: Record<string, string>,
) {
  const children = Object.values(node.children).filter(
    (child) => child.type === "texture",
  );
  const entries = Object.entries(atlases);
  const result: Record<string, string> = Object.create(null);
  for (const [id, ref] of entries) {
    const basename = path.posix.parse(ref.replace(/\\/g, "/")).name;
    const matches = children.filter(
      (child) =>
        child.path === ref ||
        child.name === basename ||
        Object.values(child.objectFiles ?? {}).includes(ref),
    );
    if (matches.length === 1) {
      result[id] = matches[0].path;
    } else if (
      !matches.length &&
      entries.length === 1 &&
      children.length === 1
    ) {
      result[id] = children[0].path;
    } else {
      throw new Error(`Missing or ambiguous sprite atlas: ${node.path}/${id}`);
    }
  }
  if (new Set(Object.values(result)).size !== entries.length) {
    throw new Error(
      "Sprite atlas references resolve to the same texture: " + node.path,
    );
  }
  return result;
}

export function spriteModuleAtlas(
  atlases: Record<string, HMG>,
  id: string,
): HMG {
  const image =
    atlases[id] ??
    (id == null && Object.keys(atlases).length === 1
      ? Object.values(atlases)[0]
      : undefined);
  if (!image) {
    throw new Error("Missing sprite module atlas: " + id);
  }
  return image;
}
