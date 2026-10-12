import { LocalePackAsset } from "#asset/locale";
import { Eastward } from "#eastward";

const states = new WeakMap<
  Eastward,
  { packs: Map<string, LocalePackAsset>; pending?: Promise<void> }
>();
let activeGame: Eastward | undefined;

export async function init(eastward: Eastward) {
  activeGame = eastward;
  let state = states.get(eastward);
  if (!state) {
    state = { packs: new Map() };
    states.set(eastward, state);
    const packs = state.packs;
    state.pending = (async () => {
      for (const node of eastward.getAssetNodes("locale_pack")) {
        const pack = await eastward.loadAsset<LocalePackAsset>(node.path);
        if (pack?.config)
          for (const { path } of pack.config.items) packs.set(path, pack);
      }
    })();
  }
  try {
    await state.pending;
  } catch (error) {
    states.delete(eastward);
    throw error;
  }
}

export function translateAsset(
  path: string,
  lang: string,
  eastward = activeGame,
) {
  const pack = eastward && states.get(eastward)?.packs.get(path);
  if (!pack) {
    return null;
  }

  const name = pack.findNameByPath(path);
  if (!name) {
    return null;
  }

  return pack.getTranslation(name, lang);
}
