import { AnimatorDataAsset } from "#asset/animator-data";
import { AssetMapAsset } from "#asset/asset-map";
import {
  CodeTilesetAsset,
  NamedTilesetPackAsset,
  NamedTilesetAsset,
} from "#asset/tileset";
import {
  DataCsvAsset,
  DataJsonAsset,
  DataXlsAsset,
  DataSheetAsset,
} from "#asset/data";
import { Deck2DAsset, DeckPackAsset, DeckPackItemAsset } from "#asset/deck-2d";
import { ProtoAsset, RawAsset } from "#asset/proto";
import { EffectAsset } from "#asset/effect";
import { FileAsset } from "#asset/file";
import { BMFontAsset, TTFFontAsset } from "#asset/font";
import { GLSLAsset } from "#asset/glsl";
import { LocalePackAsset } from "#asset/locale";
import { LuaAsset } from "#asset/lua";
import { MSpriteAsset, MSpriteSequenceAsset } from "#asset/m-sprite";
import { MaterialAsset } from "#asset/material";
import { MeshAsset } from "#asset/mesh";
import { MovieAsset } from "#asset/movie";
import { PhysicsBodyDefAsset, PhysicsMaterialAsset } from "#asset/physics";
import { PrefabAsset } from "#asset/prefab";
import { RenderTargetAsset } from "#asset/render-target";
import { SceneAsset, ScenePortalGraphAsset } from "#asset/scene";
import { FSMSchemeAsset, QuestSchemeAsset, TBSchemeAsset } from "#asset/scheme";
import {
  BTScriptAsset,
  COMScriptAsset,
  ShaderScriptAsset,
} from "#asset/script";
import { SQScriptAsset } from "#asset/sq";
import { StoryGraphAsset } from "#asset/story-graph";
import { StylesheetAsset } from "#asset/stylesheet";
import { TextAsset } from "#asset/text";
import {
  LutTextureAsset,
  MultiTextureAsset,
  TextureAsset,
  TexturePackAsset,
  TextureProcessorAsset,
} from "#asset/texture";
import { UIStyleAsset } from "#asset/ui-style";
import { Eastward } from "#eastward";

import { FMODProjectAsset, FMODFolderAsset, FMODEventAsset } from "#asset/fmod";

const typeMap = {
  fs_project: FMODProjectAsset,
  fs_folder: FMODFolderAsset,
  fs_event: FMODEventAsset,
  animator_data: AnimatorDataAsset,
  asset_map: AssetMapAsset,
  code_tileset: CodeTilesetAsset,
  data_json: DataJsonAsset,
  data_csv: DataCsvAsset,
  data_xls: DataXlsAsset,
  data_sheet: DataSheetAsset,
  "deck2d.msprite_seq": MSpriteSequenceAsset,
  deck2d: Deck2DAsset,
  deck_pack: DeckPackAsset,
  deck_pack_raw: DeckPackAsset,
  "deck2d.mquad": DeckPackItemAsset,
  "deck2d.mtileset": DeckPackItemAsset,
  "deck2d.quads": DeckPackItemAsset,
  "deck2d.quad": DeckPackItemAsset,
  "deck2d.stretchpatch": DeckPackItemAsset,
  "deck2d.tileset": DeckPackItemAsset,
  "deck2d.quad_array": DeckPackItemAsset,
  "deck2d.polygon": DeckPackItemAsset,
  proto: ProtoAsset,
  raw: RawAsset,
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
  named_tileset_pack: NamedTilesetPackAsset,
  named_tileset: NamedTilesetAsset,
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
  texture_processor: TextureProcessorAsset,
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
      `type ${type} is not supported or not a valid eastward asset type!`,
    );
  }
  eastward.registerAssetLoader(type, assetLoader, true);
}

export function registerAll(eastward: Eastward) {
  for (const type of ASSET_TYPES) {
    register(eastward, type as AssetType);
  }
}
