import { AnimatorDataAsset } from "@/asset/animator-data";
import { AssetMapAsset } from "@/asset/asset-map";
import { CodeTilesetAsset } from "@/asset/code-tileset";
import { DataCsvAsset, DataJsonAsset, DataXlsAsset } from "@/asset/data";
import { Deck2DAsset, DeckPackAsset } from "@/asset/deck-2d";
import { EffectAsset } from "@/asset/effect";
import { FileAsset } from "@/asset/file";
import { BMFontAsset, TTFFontAsset } from "@/asset/font";
import { GLSLAsset } from "@/asset/glsl";
import { LocalePackAsset } from "@/asset/locale";
import { LuaAsset } from "@/asset/lua";
import { MSpriteAsset } from "@/asset/m-sprite";
import { MaterialAsset } from "@/asset/material";
import { MeshAsset } from "@/asset/mesh";
import { MovieAsset } from "@/asset/movie";
import { PhysicsBodyDefAsset, PhysicsMaterialAsset } from "@/asset/physics";
import { PrefabAsset } from "@/asset/prefab";
import { RenderTargetAsset } from "@/asset/render-target";
import { SceneAsset, ScenePortalGraphAsset } from "@/asset/scene";
import {
  FSMSchemeAsset,
  QuestSchemeAsset,
  TBSchemeAsset,
} from "@/asset/scheme";
import {
  BTScriptAsset,
  COMScriptAsset,
  ShaderScriptAsset,
} from "@/asset/script";
import { SQScriptAsset } from "@/asset/sq";
import { StoryGraphAsset } from "@/asset/story-graph";
import { StylesheetAsset } from "@/asset/stylesheet";
import { TextAsset } from "@/asset/text";
import {
  LutTextureAsset,
  MultiTextureAsset,
  TextureAsset,
  TexturePackAsset,
} from "@/asset/texture";
import { UIStyleAsset } from "@/asset/ui-style";
import { Eastward } from "@/eastward";

const typeMap = {
  animator_data: AnimatorDataAsset,
  asset_map: AssetMapAsset,
  code_tileset: CodeTilesetAsset,
  data_json: DataJsonAsset,
  data_csv: DataCsvAsset,
  data_xls: DataXlsAsset,
  deck2d: Deck2DAsset,
  deck_pack: DeckPackAsset,
  deck_pack_raw: DeckPackAsset,
  effect: EffectAsset,
  file: FileAsset,
  font_bmfont: BMFontAsset,
  font_ttf: TTFFontAsset,
  glsl: GLSLAsset,
  locale_pack: LocalePackAsset,
  lua: LuaAsset,
  movie: MovieAsset,
  msprite: MSpriteAsset,
  material: MaterialAsset,
  mesh: MeshAsset,
  physics_body_def: PhysicsBodyDefAsset,
  physics_material: PhysicsMaterialAsset,
  prefab: PrefabAsset,
  render_target: RenderTargetAsset,
  scene: SceneAsset,
  scene_portal_graph: ScenePortalGraphAsset,
  fsm_scheme: FSMSchemeAsset,
  quest_scheme: QuestSchemeAsset,
  tb_scheme: TBSchemeAsset,
  bt_script: BTScriptAsset,
  shader_script: ShaderScriptAsset,
  com_script: COMScriptAsset,
  sq_script: SQScriptAsset,
  story_graph: StoryGraphAsset,
  stylesheet: StylesheetAsset,
  text: TextAsset,
  texture: TextureAsset,
  texture_pack: TexturePackAsset,
  lut_texture: LutTextureAsset,
  multi_texture: MultiTextureAsset,
  ui_style: UIStyleAsset,
};

export type AssetType = keyof typeof typeMap;
export const ASSET_TYPES = Object.keys(typeMap);

export function register(eastward: Eastward, type: AssetType) {
  const assetLoader = typeMap[type];
  if (!assetLoader) {
    throw new Error(
      `type ${type} is not supported or not a valid eastward asset type!`
    );
  }
  eastward.registerAssetLoader(type, assetLoader, true);
}

export function registerAll(eastward: Eastward) {
  for (const type of ASSET_TYPES) {
    register(eastward, type as AssetType);
  }
}
