const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const {
  Eastward,
  AssetNode,
  TextureAsset,
  MSpriteAsset,
  GArchive,
  DataJsonAsset,
  encodeHMG,
  decodeHMG,
  cropHMG,
  mergeHMG,
  hmg2pngSync,
  png2hmg,
  DataSheetAsset,
  MSpriteSequenceAsset,
} = require("../dist");
const { xml2mesh } = require("../dist/util/mesh");
const { init, translateAsset } = require("../dist/util/translate");
const { spawnSync } = require("node:child_process");

test("child-first indexes preserve shared parent identity", async () => {
  const game = new Eastward({ root: "." });
  game.checkFileExists = async () => false;
  game.loadJSONFile = async () => ({
    "folder/child": { type: "raw", filePath: false, tags: [] },
    folder: { type: "folder", filePath: "game/asset/folder", tags: [] },
  });
  await game._loadAssetLibrary("index");
  assert.equal(game.nodes["folder/child"].parentNode, game.nodes.folder);
  assert.equal(game.nodes.folder.children.child, game.nodes["folder/child"]);
});

test("archive directories require a slash boundary and extraction rejects escaping names", async (t) => {
  const base = path.resolve("node_modules/.cache");
  await fs.mkdir(base, { recursive: true });
  const temp = await fs.mkdtemp(path.join(base, "archive-audit-"));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const archive = new GArchive({ verbose: -1 });
  await archive.setFileData("dir/file", new Uint8Array([1]));
  await archive.setFileData("directory/file", new Uint8Array([2]));
  await archive.setFileData("../escaped", new Uint8Array([3]));
  assert.deepEqual(await archive.getDirectoryData("dir"), ["file"]);
  const result = await archive.extracTo(path.join(temp, "out"));
  assert.equal(result.saved, 2);
  assert.equal(result.errors.length, 1);
  await assert.rejects(fs.access(path.join(temp, "escaped")));
  const broken = Buffer.alloc(26);
  broken.writeInt32LE(27191);
  broken.writeInt32LE(1, 4);
  broken.write("x", 8);
  broken.writeInt32LE(1000, 10);
  await fs.writeFile(path.join(temp, "bad.g"), broken);
  await assert.rejects(
    new GArchive({}).load(path.join(temp, "bad.g")),
    /bounds/,
  );
});

test("image helpers reject truncated pixels and invalid crop or merge bounds", () => {
  const image = { width: 1, height: 1, data: new Uint8Array([100, 0, 0, 128]) };
  assert.throws(() => cropHMG(image, { x: 1, y: 0, w: 1, h: 1 }), /bounds/);
  assert.throws(() => mergeHMG(image, image, -1, 0), /bounds/);
  const raw = encodeHMG(image);
  new DataView(raw.buffer).setInt32(12, 2, true);
  assert.throws(() => decodeHMG(raw), /size mismatch/);
});

test("sprite WebP keeps blank frames and straight-alpha color on a stable canvas", async () => {
  const texture = new TextureAsset({}, new AssetNode("texture"));
  texture.hmg = { width: 1, height: 1, data: new Uint8Array([100, 0, 0, 128]) };
  texture.info = { parent: { premultiplyAlpha: true } };
  const definition = {
    atlases: { 0: "atlas" },
    features: [],
    modules: { m: { atlas: "0", rect: [0, 0, 1, 1] } },
    frames: { blank: { parts: [] }, visible: { parts: [["m", -3, -4]] } },
    anims: {
      a: {
        name: "test",
        seq: [
          ["blank", 0.1, 0, 0],
          ["visible", 0.2, 0, 0],
        ],
      },
    },
  };
  const node = Object.assign(new AssetNode("sprite.msprite"), {
    name: "sprite.msprite",
    objectFiles: { def: "def" },
  });
  const sprite = new MSpriteAsset(
    { loadJSONFile: async () => definition, loadAsset: async () => texture },
    node,
  );
  await sprite.load();
  const WebP = require("node-webpmux");
  const image = new WebP.Image();
  await image.load(sprite.animations.test);
  assert.equal(image.width, 1);
  assert.equal(image.height, 1);
  assert.deepEqual([...(await image.getFrameData(0))], [0, 0, 0, 0]);
  assert.deepEqual([...(await image.getFrameData(1))], [199, 0, 0, 128]);
  assert.equal(texture.hmg.data[0], 100);
});

test("mesh OBJ preserves polygons and separate UV offsets without normals", async () => {
  const mesh = (count, uv) =>
    `<Mesh material_index="0"><Positions num="${count}">${Array.from({ length: count }, (_, i) => `${i} 0 0`).join("\n")}</Positions>${uv ? `<TextureCoords num="${count}">${Array.from({ length: count }, () => "0 0").join("\n")}</TextureCoords>` : ""}<FaceList><Face num="${count}">${Array.from({ length: count }, (_, i) => i).join(" ")}</Face></FaceList></Mesh>`;
  const result = await xml2mesh(
    `<ASSIMP><Scene><MeshList>${mesh(4, false)}${mesh(3, true)}</MeshList></Scene></ASSIMP>`,
  );
  assert.match(result.obj, /f 1 2 3 4\n/);
  assert.match(result.obj, /f 5\/1 6\/2 7\/3\n/);
});

test("translation caches are scoped to each Eastward instance", async () => {
  const game = (value) => ({
    getAssetNodes: () => [{ path: "pack" }],
    loadAsset: async () => ({
      config: { items: [{ path: "dialog" }] },
      findNameByPath: () => "item",
      getTranslation: () => value,
    }),
  });
  const a = game("first"),
    b = game("second");
  await Promise.all([init(a), init(b)]);
  assert.equal(translateAsset("dialog", "en", a), "first");
  assert.equal(translateAsset("dialog", "en", b), "second");
});

test("JSON assets retain false and zero payloads", async () => {
  const node = Object.assign(new AssetNode("value"), {
    objectFiles: { data: "data" },
  });
  const asset = new DataJsonAsset({ loadJSONFile: async () => false }, node);
  await asset.load();
  assert.equal(await asset.toString(), "false");
  asset.eastward.loadJSONFile = async () => 0;
  await asset.load();
  assert.equal(await asset.toString(), "0");
});

test("synchronous PNG encoding preserves RGBA bytes", async () => {
  const image = {
    width: 2,
    height: 1,
    data: new Uint8Array([10, 20, 30, 128, 40, 50, 60, 255]),
  };
  assert.deepEqual(await png2hmg(hmg2pngSync(image)), image);
});

test("mesh hierarchy applies parent transforms and normalizes inverse-transpose normals", async () => {
  const xml =
    '<ASSIMP><Scene><Node><Matrix4>1 0 0 10 0 1 0 0 0 0 1 0 0 0 0 1</Matrix4><NodeList><Node><Matrix4>2 0 0 0 0 3 0 0 0 0 1 0 0 0 0 1</Matrix4><MeshRefs num="1">0</MeshRefs></Node></NodeList></Node><MeshList><Mesh material_index="0"><Positions num="3">1 0 0\n0 1 0\n0 0 0</Positions><Normals num="3">0 0 1\n0 0 1\n0 0 1</Normals><FaceList><Face num="3">0 1 2</Face></FaceList></Mesh></MeshList></Scene></ASSIMP>';
  const result = await xml2mesh(xml);
  assert.match(result.obj, /v 12 0 0\nv 10 3 0\nv 10 0 0/);
  assert.match(result.obj, /f 1\/\/1 2\/\/2 3\/\/3/);
});

test("virtual sheet and sprite sequence loaders preserve parent-owned data without rendering", async () => {
  const sheet = new DataSheetAsset(
    { loadAsset: async () => ({ data: { Table: [] } }) },
    Object.assign(new AssetNode("book/Table"), {
      name: "Table",
      parent: "book",
    }),
  );
  await sheet.load();
  assert.deepEqual(sheet.data, []);
  const def = {
    anims: { a: { name: "idle", seq: [["f", 0.1, 0, 0]] } },
    frames: { f: { parts: [] } },
    modules: {},
    features: [],
  };
  const sequence = new MSpriteSequenceAsset(
    {
      getAssetNode: () => ({ objectFiles: { def: "def" } }),
      loadJSONFile: async () => def,
    },
    Object.assign(new AssetNode("sprite/idle"), {
      name: "idle",
      parent: "sprite",
    }),
  );
  await sequence.load();
  assert.equal(sequence.data.animation, def.anims.a);
  assert.equal(sequence.data.frames.f, def.frames.f);
});

test("concurrent textures share one atlas decode and can retry a failed atlas load", async () => {
  const group = { atlasMode: true, atlasCachePath: "atlas" };
  const info = { parent: group, atlasId: 1, x: 0, y: 0, w: 1, h: 1 };
  let reads = 0,
    fail = true;
  const game = {
    findTexture: () => info,
    loadJSONFile: async () => ({ atlases: [{ name: "pixels" }] }),
    loadFile: async () => {
      reads++;
      await new Promise((resolve) => setImmediate(resolve));
      if (fail) throw new Error("retry");
      return encodeHMG({
        width: 1,
        height: 1,
        data: new Uint8Array([10, 0, 0, 255]),
      });
    },
  };
  const a = new TextureAsset(game, new AssetNode("a")),
    b = new TextureAsset(game, new AssetNode("b"));
  const result = await Promise.allSettled([a.load(), b.load()]);
  assert.ok(result.every((value) => value.status === "rejected"));
  assert.equal(reads, 1);
  fail = false;
  await Promise.all([a.load(), b.load()]);
  assert.equal(reads, 2);
  assert.deepEqual(a.hmg, b.hmg);
});

test("CLI reports recursive conversion errors and creates single-file output parents", async (t) => {
  const base = path.resolve("node_modules/.cache");
  await fs.mkdir(base, { recursive: true });
  const temp = await fs.mkdtemp(path.join(base, "cli-audit-"));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const input = path.join(temp, "input");
  await fs.mkdir(input);
  await fs.writeFile(path.join(input, "bad.json"), "{broken");
  let result = spawnSync(
    process.execPath,
    [
      "dist/bin.js",
      "json2msg",
      "-r",
      "--in",
      input,
      "--out",
      path.join(temp, "out"),
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  await fs.writeFile(path.join(input, "good.json"), '{"value":1}');
  result = spawnSync(
    process.execPath,
    [
      "dist/bin.js",
      "json2msg",
      "--in",
      path.join(input, "good.json"),
      "--out",
      path.join(temp, "new/dir/data.packed"),
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  await fs.access(path.join(temp, "new/dir/data.packed"));
  result = spawnSync(process.execPath, ["dist/bin.js", "unknown-mode"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
});

test("saving archives preserves live payloads and round-trips UTF-8 paths and empty files", async (t) => {
  const base = path.resolve("node_modules/.cache");
  await fs.mkdir(base, { recursive: true });
  const temp = await fs.mkdtemp(path.join(base, "archive-save-"));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const archive = new GArchive({});
  const data = new Uint8Array([1, 2, 3, 4]);
  await archive.setFileData("한글/file", data);
  await archive.setFileData("empty", new Uint8Array());
  await archive.setFileData("__proto__", data);
  await archive.saveFile(path.join(temp, "test.g"));
  assert.equal(archive.assets["한글/file"].data, data);
  assert.equal(archive.assets["한글/file"].isCompressed, false);
  const restored = new GArchive({});
  await restored.load(path.join(temp, "test.g"));
  assert.deepEqual([...(await restored.getFileData("한글/file"))], [...data]);
  assert.deepEqual([...(await restored.getFileData("empty"))], []);
  assert.deepEqual([...(await restored.getFileData("__proto__"))], [...data]);
});
