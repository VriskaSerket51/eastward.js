const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { encode } = require("@msgpack/msgpack");
const {
  exportProject,
  projectAssetPath,
  projectAssetPaths,
  Eastward,
} = require("../dist");
const { reconstructAsset } = require("../dist/project-reconstruct");
const { encodeHMG, png2hmg } = require("../dist");
const { execFileSync } = require("node:child_process");

test("project recovery preserves bytes, virtual metadata, directories and script mappings", async (t) => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "eastward-project-"));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const root = path.join(temp, "game");
  await fs.mkdir(path.join(root, "content", "game"), { recursive: true });
  const index = {
    "Actors/A": {
      type: "proto",
      filePath: false,
      objectFiles: {
        packed_def: "cache/def",
        extra: "cache/dir",
        missing: "cache/missing",
      },
      managerVersion: 7,
    },
    "Actors/a": { type: "lua", filePath: false, objectFiles: {} },
  };
  const config = {
    asset_library: "config/assets",
    script_library: "config/scripts",
    texture_library: "config/textures",
  };
  const files = new Map([
    ["config/game_config", Buffer.from(JSON.stringify(config))],
    ["config/assets.packed", encode(index)],
    ["cache/def", encode({ name: "target", values: [1, 2] })],
    ["cache/dir/item", Buffer.from([0, 255, 42])],
    ["cache/script", Buffer.from([27, 76, 74])],
    ["cache/unindexed", Buffer.from("keep me")],
  ]);
  const game = {
    config: { root },
    archives: {
      config: { getFileNames: async () => ["game_config", "assets.packed"] },
      cache: {
        getFileNames: async () => ["def", "dir/item", "script", "unindexed"],
      },
    },
    loadFile: async (name) => files.get(name) ?? null,
    loadJSONFile: async () => ({}),
    findTexture: () => null,
    findScript: (name) => (name === "Actors/a" ? "cache/script" : undefined),
  };
  const names = projectAssetPaths(Object.keys(index));
  assert.notEqual(
    names["Actors/A"].toLowerCase(),
    names["Actors/a"].toLowerCase(),
  );
  assert.equal(projectAssetPath("anim/John.msprite"), "anim/John.msprite");
  assert.equal(projectAssetPath("CON/icon:blue."), "%43ON/icon%3Ablue%2E");
  const out = path.join(temp, "recovered");
  const report = await exportProject(game, out);
  assert.equal(report.assetCount, 2);
  assert.deepEqual(report.missingResources, ["cache/missing"]);
  for (const [name, bytes] of files)
    assert.deepEqual(
      await fs.readFile(path.join(out, "resources", name)),
      Buffer.from(bytes),
    );
  const asset = JSON.parse(
    await fs.readFile(
      path.join(out, "assets", names["Actors/A"], "asset.json"),
    ),
  );
  assert.equal(asset.virtual, true);
  assert.equal(asset.original.managerVersion, 7);
  assert.deepEqual(asset.resources.extra, ["cache/dir/item"]);
  assert.deepEqual(asset.resources.missing, []);
  assert.deepEqual(
    JSON.parse(await fs.readFile(path.join(out, asset.decoded[0]))),
    { name: "target", values: [1, 2] },
  );
  await assert.rejects(exportProject(game, out), /EEXIST/);
  await assert.rejects(
    exportProject(game, path.join(root, "unsafe")),
    /outside/,
  );
  await assert.rejects(
    exportProject(game, path.join(temp, "bad"), { assetPaths: ["unknown"] }),
    /Unknown asset/,
  );
});

test("reconstruction restores straight alpha and editable sprite modules without losing empty frames", async () => {
  const pixels = {
    width: 1,
    height: 1,
    data: new Uint8Array([64, 32, 16, 128]),
  };
  const def = {
    atlases: { 0: "original-editor-path" },
    modules: { 1: { atlas: "0", rect: [0, 0, 1, 1], feature: 7 } },
    frames: { 2: { name: "empty", parts: [], meta: { origin: [3, 4] } } },
    anims: { 3: { name: "idle", seq: [["2", 0.25, 0, 0]] } },
    features: [{ id: 7, name: "hat" }],
  };
  const bytes = new Map([
    ["pixmap", encodeHMG(pixels)],
    ["definition", encode(def)],
  ]);
  const node = {
    path: "anim/Test.msprite/Test_texture",
    type: "texture",
    objectFiles: { pixmap: "pixmap" },
  };
  const game = Object.assign(new Eastward({ root: "." }), {
    nodes: { [node.path]: node },
    loadFile: async (ref) => bytes.get(ref),
    findTexture: () => ({
      ow: 1,
      oh: 1,
      parent: { atlasMode: false, premultiplyAlpha: true },
    }),
    findScript: () => null,
  });
  const written = new Map();
  const json = async (name, value) => written.set(name, value);
  const binary = async (name, value) => written.set(name, value);
  const sprite = await reconstructAsset(
    game,
    "anim/Test.msprite",
    { type: "msprite", objectFiles: { packed_def: "definition" } },
    "sprite",
    {},
    json,
    binary,
    (name) => name,
  );
  assert.deepEqual(sprite.errors, {});
  const restored = await png2hmg(written.get("sprite/atlas.png"));
  assert.deepEqual([...restored.data], [128, 64, 32, 128]);
  assert.deepEqual(written.get("sprite/sprite.json").frames, def.frames);
  assert.deepEqual(written.get("sprite/sprite.json").anims, def.anims);
  assert.deepEqual(written.get("sprite/sprite.json").features, def.features);
  assert.ok(written.has("sprite/modules/1.png"));
  assert.deepEqual([...pixels.data], [64, 32, 16, 128]);
});

test("virtual deck and animation children receive their actual definitions", async () => {
  const sprite = {
    anims: { 1: { name: "idle", seq: [["2", 0.1, 0, 0]] } },
    frames: { 2: { parts: [] } },
    modules: {},
    features: [],
  };
  const game = {
    nodes: {
      pack: { objectFiles: { export: "cache" } },
      sprite: { objectFiles: { packed_def: "sprite-data" } },
    },
    loadJSONFile: async () => ({
      decks: [{ name: "tile", meshes: [{ verts: [[1, 2, 3]] }] }],
    }),
    loadFile: async () => encode(sprite),
    findScript: () => null,
  };
  const written = new Map();
  const json = async (name, value) => written.set(name, value);
  const deck = await reconstructAsset(
    game,
    "pack/tile",
    { type: "deck2d.mquad" },
    "tile",
    {},
    json,
    async () => {},
    (p) => p,
  );
  assert.deepEqual(deck.errors, {});
  assert.deepEqual(written.get("tile/definition.json").meshes, [
    { verts: [[1, 2, 3]] },
  ]);
  const anim = await reconstructAsset(
    game,
    "sprite/idle",
    { type: "deck2d.msprite_seq" },
    "idle",
    {},
    json,
    async () => {},
    (p) => p,
  );
  assert.deepEqual(anim.errors, {});
  assert.deepEqual(
    written.get("idle/definition.json").animation,
    sprite.anims["1"],
  );
  assert.deepEqual(written.get("idle/definition.json").frames, sprite.frames);
});

test("compiled-only scenes and textual behavior definitions are reconstructed without assuming JSON", async () => {
  const values = new Map([
    ["compiled/scene_index.json.packed", encode({ groups: ["default"] })],
    [
      "compiled/default.scene_group.packed",
      encode({ entities: [{ id: "hero" }] }),
    ],
    ["compiled/asset_temp/source.psd", new Uint8Array([56, 66, 80, 83])],
    ["behavior", new TextEncoder().encode("+ ROOT\n\t? is_alive\n")],
  ]);
  const game = {
    loadFile: async (ref) => values.get(ref),
    findScript: () => null,
  };
  const written = new Map();
  const json = async (name, value) => written.set(name, value);
  const binary = async (name, value) => written.set(name, value);
  const scene = await reconstructAsset(
    game,
    "scene",
    { type: "scene", objectFiles: { def: "missing", compiled: "compiled" } },
    "scene",
    {
      def: [],
      compiled: [
        "compiled/scene_index.json.packed",
        "compiled/default.scene_group.packed",
        "compiled/asset_temp/source.psd",
      ],
    },
    json,
    binary,
    (p) => p,
  );
  assert.deepEqual(scene.errors, {});
  assert.deepEqual(written.get("scene/scene/default.scene_group"), {
    entities: [{ id: "hero" }],
  });
  assert.deepEqual(
    written.get("scene/scene/asset_temp/source.psd"),
    new Uint8Array([56, 66, 80, 83]),
  );
  const behavior = await reconstructAsset(
    game,
    "behavior",
    { type: "bt_script", objectFiles: { def: "behavior" } },
    "bt",
    { def: ["behavior"] },
    json,
    binary,
    (p) => p,
  );
  assert.deepEqual(behavior.errors, {});
  assert.equal(
    new TextDecoder().decode(written.get("bt/definition.bt_script")),
    "+ ROOT\n\t? is_alive\n",
  );
});

test("legacy directory migration keeps names and rewrites generated references while retaining originals", async (t) => {
  await fs.mkdir(path.resolve("node_modules/.cache"), { recursive: true });
  const temp = await fs.mkdtemp(
    path.resolve("node_modules/.cache/eastward-migrate-"),
  );
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const records = {
    anim: "assets/a-anim",
    "anim/Hero.msprite": "assets/a-anim/a-%48ero%2emsprite",
  };
  const assets = {};
  const oldSprite = records["anim/Hero.msprite"];
  for (const [logical, folder] of Object.entries(records)) {
    await fs.mkdir(path.join(temp, folder), { recursive: true });
    await fs.writeFile(
      path.join(temp, folder, "asset.json"),
      JSON.stringify({
        logicalPath: logical,
        folder,
        original: { exact: oldSprite + "/keep-original-value" },
        decoded: [],
        reconstructed: {
          outputs: logical === "anim" ? [] : [folder + "/sprite.json"],
        },
      }),
    );
    assets[logical] = {
      folder,
      type: logical === "anim" ? "folder" : "msprite",
    };
  }
  await fs.writeFile(
    path.join(temp, oldSprite, "sprite.json"),
    JSON.stringify({
      atlases: { 0: oldSprite + "/atlas.png" },
      sourceDefinition: { original: oldSprite },
      modules: { 1: { image: oldSprite + "/modules/1.png" } },
    }),
  );
  await fs.writeFile(
    path.join(temp, "project.json"),
    JSON.stringify({ format: "eastward-recovery-project", assets }),
  );
  execFileSync(process.execPath, [
    path.resolve("scripts/migrate-project-paths.cjs"),
    temp,
  ]);
  const sprite = JSON.parse(
    await fs.readFile(path.join(temp, "assets/anim/Hero.msprite/sprite.json")),
  );
  assert.equal(sprite.atlases["0"], "assets/anim/Hero.msprite/atlas.png");
  assert.equal(
    sprite.modules["1"].image,
    "assets/anim/Hero.msprite/modules/1.png",
  );
  assert.equal(sprite.sourceDefinition.original, oldSprite);
  const asset = JSON.parse(
    await fs.readFile(path.join(temp, "assets/anim/Hero.msprite/asset.json")),
  );
  assert.equal(asset.original.exact, oldSprite + "/keep-original-value");
  assert.equal(asset.folder, "assets/anim/Hero.msprite");
});
