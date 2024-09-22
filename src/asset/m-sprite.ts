import { Asset, AssetNode } from "@/asset/node";
import { Eastward } from "@/eastward";
import { TextureAsset } from "./texture";
import { Rect } from "@/type";
import path from "path";
import { cropHMG, emptyHMG, HMG, mergeHMG } from "@/util/hmg";
import { writeFile } from "@/util/filesystem";
import WebP from "node-webpmux";
import { uint8ArrayToBase64 } from "@/util/base64";

type Animation = {
  deprecated: boolean;
  name: string;
  seq: [string, number, number, number][];
  src_type: string;
};

type Feature = {
  id: number;
  name: string;
};

type Frame = {
  meta: {
    anchors: any;
    glow_sum: number;
    origin: [number, number];
  };
  name: string;
  parts: [string, number, number][];
};

type Module = {
  atlas: string;
  feature: number;
  rect: [number, number, number, number];
};

type MultiSprite = {
  anims: { [key: string]: Animation };
  atlases: { [key: string]: string };
  features: Feature[];
  frames: { [key: string]: Frame };
  modules: { [key: string]: Module };
};

export class MSpriteAsset extends Asset {
  animations: { [key: string]: Uint8Array } | null = null;

  constructor(eastward: Eastward, node: AssetNode) {
    super(eastward, node);
  }

  get type(): string {
    return Asset.Type.JSON;
  }

  async toString(): Promise<string | null> {
    if (!this.animations) {
      return null;
    }

    const data = Object.entries(this.animations).map(([key, value]) => {
      return {
        id: key,
        data: uint8ArrayToBase64(value),
        type: "webp",
      };
    });
    return JSON.stringify(data);
  }

  async load() {
    let def: MultiSprite = await this.eastward.loadMsgPackFile(
      this.node.objectFiles!.packed_def
    );

    if (!def) {
      def = await this.eastward.loadJSONFile(this.node.objectFiles!.def);
    }

    const baseName = path.parse(this.node.name).name;
    const textNodePath = `${this.node.path}/${baseName}_texture`;
    const texture = await this.eastward.loadAsset<TextureAsset>(textNodePath);

    if (!texture) {
      throw new Error(`cannot find texture: ${textNodePath}`);
    }

    this.animations = {};
    const modules: { [key: string]: HMG } = {};
    const frames: { [key: string]: { hmg: HMG; bound: Rect } } = {};

    for (const id in def.modules) {
      const module = def.modules[id];
      const [x, y, w, h] = module.rect;
      const rect: Rect = {
        x,
        y,
        w,
        h,
      };

      const tex = cropHMG(texture.hmg!, rect);
      modules[id] = tex;
    }

    for (const id in def.frames) {
      const frame = def.frames[id];
      const bound = this._calculateBound(
        frame.parts.map((part) => {
          const [id, x, y] = part;
          const [_x, _y, w, h] = def.modules[id].rect;
          return {
            x,
            y,
            w,
            h,
          };
        })
      );
      const base = emptyHMG(bound.w, bound.h);
      for (const part of frame.parts) {
        const module = modules[part[0]];
        const ox = part[1] - bound.x;
        const oy = part[2] - bound.y;

        mergeHMG(base, module, ox, oy);
      }

      frames[id] = { hmg: base, bound };
    }

    await WebP.Image.initLib();
    const asyncOps = Object.keys(def.anims).map(async (id) => {
      const anim = def.anims[id];

      const bound = this._calculateBound(
        anim.seq.map((seq) => {
          const [id] = seq;
          const { bound } = frames[id];
          return bound;
        })
      );

      const frameData: any[] = [];
      for (const [id, delay] of anim.seq) {
        const { hmg, bound: frameBound } = frames[id];

        const base = emptyHMG(bound.w, bound.h);
        mergeHMG(base, hmg, frameBound.x - bound.x, frameBound.y - bound.y);

        const frameImage = await WebP.Image.getEmptyImage();
        await frameImage.setImageData(base.data, {
          width: base.width,
          height: base.height,
          quality: 100,
          lossless: 1,
        });

        const frame = await WebP.Image.generateFrame({
          img: frameImage,
          x: 0,
          y: 0,
          delay: delay,
          dispose: false,
          blend: false,
        });
        frameData.push(frame);
      }

      const buffer: Buffer = await WebP.Image.save(null, {
        frames: frameData,
        width: bound.w,
        height: bound.h,
      });
      this.animations![anim.name] = buffer;
    });

    await Promise.allSettled(asyncOps);
  }

  _calculateBound(rectOrRects: Rect | Rect[]): Rect {
    const rects: Rect[] = Array.isArray(rectOrRects)
      ? rectOrRects
      : [rectOrRects];

    if (rects.length == 0) {
      return {
        x: 0,
        y: 0,
        w: 0,
        h: 0,
      };
    }

    let xMin = Number.MAX_VALUE,
      yMin = Number.MAX_VALUE;
    let xMax = Number.MIN_VALUE,
      yMax = Number.MIN_VALUE;
    for (const rect of rects) {
      const { x, y, w, h } = rect;
      const min = {
        x,
        y,
      };
      const max = {
        x: min.x + w,
        y: min.y + h,
      };
      if (xMin > min.x) {
        xMin = min.x;
      }
      if (yMin > min.y) {
        yMin = min.y;
      }
      if (xMax < max.x) {
        xMax = max.x;
      }
      if (yMax < max.y) {
        yMax = max.y;
      }
    }
    return {
      x: xMin,
      y: yMin,
      w: xMax - xMin,
      h: yMax - yMin,
    };
  }

  async saveFile(filePath: string) {
    if (!this.animations) {
      return;
    }
    super.beforeSave(path.join(filePath, "template"));
    for (const name in this.animations) {
      const animation = this.animations[name];
      await writeFile(
        path.join(filePath, `${name.replace(/:/g, "_")}.webp`),
        animation
      );
    }
  }
}
