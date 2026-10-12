const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const {
  Eastward,
  AssetNode,
  FileAsset,
  FMODProjectAsset,
  FMODFolderAsset,
  FMODEventAsset,
  TexturePackAsset,
  NamedTilesetPackAsset,
  png2hmg,
} = require("../dist");
test("opaque files retain empty bytes and absent editor sources remain absent", async () => {
  const node = new AssetNode("file");
  node.objectFiles = { data: "raw" };
  const asset = new FileAsset(
    { loadFile: async (ref) => (ref ? new Uint8Array() : null) },
    node,
  );
  await asset.load();
  assert.equal(asset.type, "binary");
  assert.equal(asset.data.length, 0);
  assert.equal(await asset.toString(), "");
  node.objectFiles = {};
  await asset.load();
  assert.equal(asset.type, "none");
  assert.equal(await asset.toString(), null);
});
test("FMOD metadata methods serialize references without cyclic AssetNodes", async (t) => {
  await fs.mkdir("node_modules/.cache", { recursive: true });
  const dir = await fs.mkdtemp(
    path.resolve("node_modules/.cache/fmod-metadata-"),
  );
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const project = new AssetNode("audio.fmod");
  project.type = "fs_project";
  const folder = new AssetNode("audio.fmod/events");
  folder.parentNode = project;
  folder.name = "events";
  const node = new AssetNode("audio.fmod/events/Hit");
  node.name = "Hit";
  node.type = "fs_event";
  node.parentNode = folder;
  node.properties = { guid: "{hit}", path: "event:/Hit" };
  folder.children.Hit = node;
  project.children.events = folder;
  const event = new FMODEventAsset({}, node);
  await event.load();
  await event.saveFile(path.join(dir, "event.json"));
  assert.deepEqual(JSON.parse(await event.toString()), {
    guid: "{hit}",
    path: "event:/Hit",
    project: "audio.fmod",
  });
  assert.deepEqual(
    JSON.parse(await fs.readFile(path.join(dir, "event.json"))),
    JSON.parse(await event.toString()),
  );
  const asset = new FMODFolderAsset({}, folder);
  await asset.load();
  await asset.saveFile(path.join(dir, "folder.json"));
  assert.deepEqual(
    JSON.parse(await fs.readFile(path.join(dir, "folder.json"))),
    [{ name: "Hit", path: node.path, type: "fs_event" }],
  );
  const bank = new FMODProjectAsset({}, project);
  bank.config = { source_type: "source" };
  bank.files = ["Master.bank"];
  bank.banks = ["Master.bank"];
  assert.deepEqual(JSON.parse(await bank.toString()).banks, ["Master.bank"]);
});
test("texture and tileset package save APIs emit identical async and sync sources", async (t) => {
  await fs.mkdir("node_modules/.cache", { recursive: true });
  const dir = await fs.mkdtemp(
    path.resolve("node_modules/.cache/package-methods-"),
  );
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const image = { width: 1, height: 1, data: Uint8Array.of(12, 34, 56, 78) };
  const texture = {
    node: { name: "A", path: "pack/A" },
    toSourceImage: () => image,
  };
  const pack = new TexturePackAsset({}, new AssetNode("pack"));
  pack.textures = [texture];
  assert.equal(pack.type, "json");
  assert.deepEqual(JSON.parse(await pack.toString()), [
    { name: "A", path: "pack/A" },
  ]);
  await pack.saveFile(path.join(dir, "pack.psd"));
  pack.saveFileSync(path.join(dir, "sync.psd"));
  assert.deepEqual(
    await fs.readFile(path.join(dir, "pack.psd")),
    await fs.readFile(path.join(dir, "sync.psd")),
  );
  await pack.saveFile(path.join(dir, "png"));
  pack.saveFileSync(path.join(dir, "png-sync"));
  assert.deepEqual(
    await png2hmg(await fs.readFile(path.join(dir, "png/A.png"))),
    image,
  );
  assert.deepEqual(
    await png2hmg(await fs.readFile(path.join(dir, "png-sync/A.png"))),
    image,
  );
  const tiles = new NamedTilesetPackAsset({}, new AssetNode("tiles"));
  tiles.data = {
    themes: [
      {
        raw_name: "main (1, 1)",
        groups: [
          {
            raw_name: "floor :C(0)",
            tiles: [
              {
                basename: "a",
                raw_index: 1,
                rect: [0, 0, 1, 1],
                raw_rect: [0, 0, 1, 1],
              },
            ],
          },
        ],
      },
    ],
  };
  tiles.def = JSON.stringify(tiles.data);
  tiles.atlas = image;
  await tiles.saveFile(path.join(dir, "tiles.psd"));
  tiles.saveFileSync(path.join(dir, "tiles-sync.psd"));
  assert.deepEqual(
    await fs.readFile(path.join(dir, "tiles.psd")),
    await fs.readFile(path.join(dir, "tiles-sync.psd")),
  );
  await tiles.saveFile(path.join(dir, "tiles"));
  tiles.saveFileSync(path.join(dir, "tiles-sync"));
  assert.deepEqual(
    await png2hmg(await fs.readFile(path.join(dir, "tiles/atlas.png"))),
    image,
  );
  assert.deepEqual(
    await png2hmg(await fs.readFile(path.join(dir, "tiles-sync/atlas.png"))),
    image,
  );
  assert.deepEqual(
    JSON.parse(await fs.readFile(path.join(dir, "tiles-sync/tileset.json"))),
    tiles.data,
  );
  const missing = new TexturePackAsset(
    { loadAsset: async () => null },
    new AssetNode("bad"),
  );
  missing.node.children.A = Object.assign(new AssetNode("bad/A"), {
    type: "texture",
  });
  await assert.rejects(missing.load(), /Missing texture pack child/);
});
test("FMOD exports exact built files and resolves virtual event references", async (t) => {
  const project = new AssetNode("audio.fmod");
  project.type = "fs_project";
  project.objectFiles = { data: "audio/root" };
  const folder = new AssetNode("audio.fmod/event");
  folder.parentNode = project;
  const event = new AssetNode("audio.fmod/event/Test");
  event.parentNode = folder;
  event.properties = { guid: "{test}", path: "event:/Test" };
  const bytes = Uint8Array.of(1, 2, 3);
  const game = {
    checkFileExists: async () => true,
    loadJSONFile: async () => ({ source_type: "source" }),
    loadDirectory: async () => ["Build/Desktop/Master.bank"],
    loadFile: async () => bytes,
  };
  const asset = new FMODProjectAsset(game, project);
  await asset.load();
  assert.deepEqual(asset.banks, ["Build/Desktop/Master.bank"]);
  await fs.mkdir("node_modules/.cache", { recursive: true });
  const dir = await fs.mkdtemp(path.resolve("node_modules/.cache/fmod-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await asset.saveFile(dir);
  assert.deepEqual(
    [...(await fs.readFile(path.join(dir, asset.banks[0])))],
    [...bytes],
  );
  const ref = new FMODEventAsset(game, event);
  await ref.load();
  assert.equal(ref.projectNode, project);
  assert.equal(ref.eventPath, "event:/Test");
  asset.files = ["../escape"];
  await assert.rejects(asset.saveFile(dir), /path|Path|escap/);
});
test("texture packs expose the deployed child textures", async () => {
  const node = new AssetNode("pack");
  const child = new AssetNode("pack/layer");
  child.type = "texture";
  node.children.layer = child;
  const texture = {};
  const pack = new TexturePackAsset(
    {
      loadAsset: async (name) => {
        assert.equal(name, child.path);
        return texture;
      },
    },
    node,
  );
  await pack.load();
  assert.deepEqual(pack.textures, [texture]);
});
