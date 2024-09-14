import { AnimatorDataAsset } from "@/asset/animator-data";
import { AssetMapAsset } from "@/asset/asset-map";
import { CodeTilesetAsset } from "@/asset/code-tileset";
import { DataCsvAsset, DataJsonAsset, DataXlsAsset } from "@/asset/data";
import { Deck2DAsset } from "@/asset/deck-2d";
import { EffectAsset } from "@/asset/effect";
import { BMFontAsset, TTFFontAsset } from "@/asset/font";
import { GLSLAsset } from "@/asset/glsl";
import { LocalePackAsset } from "@/asset/locale";
import { LuaAsset } from "@/asset/lua";
import { MSpriteAsset } from "@/asset/m-sprite";
import { MaterialAsset } from "@/asset/material";
import { MeshAsset } from "@/asset/mesh";
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
} from "@/asset/texture";
import { UIStyleAsset } from "@/asset/ui-style";
import { Eastward } from "@/eastward";

export function registerAll(eastward: Eastward) {
  eastward.registerAssetLoader("animator_data", AnimatorDataAsset, true);
  eastward.registerAssetLoader("asset_map", AssetMapAsset, true);
  eastward.registerAssetLoader("code_tileset", CodeTilesetAsset, true);

  eastward.registerAssetLoader("data_json", DataJsonAsset, true);
  eastward.registerAssetLoader("data_csv", DataCsvAsset, true);
  eastward.registerAssetLoader("data_xls", DataXlsAsset, true);

  eastward.registerAssetLoader("deck2d", Deck2DAsset, true);

  eastward.registerAssetLoader("effect", EffectAsset, true);

  eastward.registerAssetLoader("font_bmfont", BMFontAsset, true);
  eastward.registerAssetLoader("font_ttf", TTFFontAsset, true);

  eastward.registerAssetLoader("glsl", GLSLAsset, true);

  eastward.registerAssetLoader("locale_pack", LocalePackAsset, true);
  eastward.registerAssetLoader("lua", LuaAsset, true);
  eastward.registerAssetLoader("msprite", MSpriteAsset, true);
  eastward.registerAssetLoader("material", MaterialAsset, true);
  eastward.registerAssetLoader("mesh", MeshAsset, true);

  eastward.registerAssetLoader("physics_body_def", PhysicsBodyDefAsset, true);
  eastward.registerAssetLoader("physics_material", PhysicsMaterialAsset, true);

  eastward.registerAssetLoader("prefab", PrefabAsset, true);
  eastward.registerAssetLoader("render_target", RenderTargetAsset, true);

  eastward.registerAssetLoader("scene", SceneAsset, true);
  eastward.registerAssetLoader(
    "scene_portal_graph",
    ScenePortalGraphAsset,
    true
  );

  eastward.registerAssetLoader("fsm_scheme", FSMSchemeAsset, true);
  eastward.registerAssetLoader("quest_scheme", QuestSchemeAsset, true);
  eastward.registerAssetLoader("tb_scheme", TBSchemeAsset, true);

  eastward.registerAssetLoader("bt_script", BTScriptAsset, true);
  eastward.registerAssetLoader("shader_script", ShaderScriptAsset, true);
  eastward.registerAssetLoader("com_script", COMScriptAsset, true);
  eastward.registerAssetLoader("sq_script", SQScriptAsset, true);

  eastward.registerAssetLoader("story_graph", StoryGraphAsset, true);
  eastward.registerAssetLoader("stylesheet", StylesheetAsset, true);

  eastward.registerAssetLoader("text", TextAsset, true);

  eastward.registerAssetLoader("texture", TextureAsset, true);
  eastward.registerAssetLoader("lut_texture", LutTextureAsset, true);
  eastward.registerAssetLoader("multi_texture", MultiTextureAsset, true);

  eastward.registerAssetLoader("ui_style", UIStyleAsset, true);
}
