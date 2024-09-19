import { LocalePackAsset } from "@/asset/locale";
import { Eastward } from "@/eastward";

let isInited = false;
const pathToPack: { [key: string]: LocalePackAsset } = {};

export async function init(eastward: Eastward) {
  if (isInited) {
    return;
  }

  const nodes = eastward.getAssetNodes("locale_pack");
  for (const node of nodes) {
    const pack = await eastward.loadAsset<LocalePackAsset>(node.path);
    if (!pack || !pack.config) {
      continue;
    }
    for (const { name, path } of pack.config.items) {
      pathToPack[path] = pack;
    }
  }
  isInited = true;
}

export function translateAsset(path: string, lang: string) {
  const pack = pathToPack[path];
  if (!pack) {
    return null;
  }

  const name = pack.findNameByPath(path);
  if (!name) {
    return null;
  }

  return pack.getTranslation(name, lang);
}
