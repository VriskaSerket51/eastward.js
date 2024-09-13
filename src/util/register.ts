import { AnimatorDataAsset } from "@/asset/animator-data";
import { AssetMapAsset } from "@/asset/asset-map";
import { CodeTilesetAsset } from "@/asset/code-tileset";
import { DataCsvAsset, DataJsonAsset, DataXlsAsset } from "@/asset/data";
import { BMFontAsset, TTFFontAsset } from "@/asset/font";
import { GLSLAsset } from "@/asset/glsl";
import { LocalePackAsset } from "@/asset/locale";
import { LuaScript } from "@/asset/lua";
import { MSpriteAsset } from "@/asset/m-sprite";
import { MultiTextureAsset } from "@/asset/multi-texture";
import { ShaderScriptAsset } from "@/asset/shader-script";
import { SQScriptAsset } from "@/asset/sq";
import { TBSchemeText } from "@/asset/tb-scheme";
import { TextAsset } from "@/asset/text";
import { TextureAsset } from "@/asset/texture";
import { Eastward } from "@/eastward";

export function registerAll(eastward: Eastward) {
  eastward.registerAssetLoader("animator_data", AnimatorDataAsset, true);
  eastward.registerAssetLoader("asset_map", AssetMapAsset, true);
  eastward.registerAssetLoader("code_tileset", CodeTilesetAsset, true);

  eastward.registerAssetLoader("data_json", DataJsonAsset, true);
  eastward.registerAssetLoader("data_csv", DataCsvAsset, true);
  eastward.registerAssetLoader("data_xls", DataXlsAsset, true);

  eastward.registerAssetLoader("font_bmfont", BMFontAsset, true);
  eastward.registerAssetLoader("font_ttf", TTFFontAsset, true);

  eastward.registerAssetLoader("glsl", GLSLAsset, true);
  eastward.registerAssetLoader("locale_pack", LocalePackAsset, true);
  eastward.registerAssetLoader("lua", LuaScript, true);
  eastward.registerAssetLoader("msprite", MSpriteAsset, true);

  eastward.registerAssetLoader("multi_texture", MultiTextureAsset, true);
  eastward.registerAssetLoader("shader_script", ShaderScriptAsset, true);
  eastward.registerAssetLoader("sq_script", SQScriptAsset, true);

  eastward.registerAssetLoader("tb_sceme", TBSchemeText, true);
  eastward.registerAssetLoader("text", TextAsset, true);
  eastward.registerAssetLoader("texture", TextureAsset, true);
}
