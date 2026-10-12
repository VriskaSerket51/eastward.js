const { test } = require("node:test");
const assert = require("node:assert/strict");
const zlib = require("node:zlib");
const { imageToPSD, animationToASE } = require("../dist/util/source-image");
const {
  sourceGraphML,
  sourceFSMGraphML,
} = require("../dist/util/source-graph");
test("flattened PSD writes big-endian dimensions and exact planar RGBA", () => {
  const raw = Buffer.from(
    imageToPSD({
      width: 2,
      height: 1,
      data: Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8),
    }),
  );
  assert.equal(raw.toString("ascii", 0, 4), "8BPS");
  assert.equal(raw.readUInt32BE(14), 1);
  assert.equal(raw.readUInt32BE(18), 2);
  assert.deepEqual([...raw.subarray(40)], [1, 5, 2, 6, 3, 7, 4, 8]);
});
test("ASE retains blank frames, timing, module pixels, feature labels and animation tags", () => {
  const def = {
    features: [{ id: 1, name: "hat" }],
    modules: { m: { rect: [0, 0, 1, 1], feature: 1 } },
    frames: { a: { parts: [["m", -2, 3]] }, b: { parts: [] } },
  };
  const raw = Buffer.from(
    animationToASE(
      def,
      {
        seq: [
          ["a", 0.12, 0, 0],
          ["b", 0.2, 0, 0],
        ],
      },
      { width: 1, height: 1, data: Uint8Array.of(1, 2, 3, 255) },
      [{ name: "idle", from: 0, to: 1 }],
    ),
  );
  assert.equal(raw.readUInt32LE(0), raw.length);
  assert.equal(raw.readUInt16LE(4), 0xa5e0);
  assert.equal(raw.readUInt16LE(6), 2);
  let offset = 128,
    cels = [],
    layers = [],
    tags = 0;
  for (let frame = 0; frame < 2; frame++) {
    const start = offset,
      size = raw.readUInt32LE(offset),
      count = raw.readUInt16LE(offset + 6);
    assert.equal(raw.readUInt16LE(offset + 8), frame ? 200 : 120);
    offset += 16;
    for (let i = 0; i < count; i++) {
      const size = raw.readUInt32LE(offset),
        type = raw.readUInt16LE(offset + 4),
        body = raw.subarray(offset + 6, offset + size);
      if (type === 0x2004) {
        assert.equal(body[12], 255);
        layers.push(body.subarray(18).toString());
      }
      if (type === 0x2005 && body.readUInt16LE(0) === 0)
        cels.push([...zlib.inflateSync(body.subarray(20))]);
      if (type === 0x2018) {
        tags++;
        assert.equal(body.readUInt16LE(0), 1);
        assert.equal(body.readUInt16LE(12), 1);
      }
      offset += size;
    }
    assert.equal(offset, start + size);
  }
  assert.deepEqual(layers, ["#hat", "@origin"]);
  assert.deepEqual(cels, [[1, 2, 3, 255]]);
  assert.equal(tags, 1);
});
test("graph reconstruction preserves nested quest IDs and XML escapes", () => {
  const text = sourceGraphML("quest_scheme", {
    nodes: [
      {
        id: "g",
        name: "group",
        children: [{ id: "g::n", name: "a & b", children: [] }],
      },
    ],
    connections: [],
  });
  assert.match(text, /a &amp; b/);
  assert.match(text, /id="g::n"/);
  assert.equal((text.match(/yfiles.foldertype/g) || []).length, 1);
});
test("effective FSM graph preserves ordinary and group next targets", async () => {
  const text = await sourceFSMGraphML(
    'return { start={localName="start",type="state",next={["$idle"]="idle",[true]="idle"}},idle={localName="idle",type="state",jump=false} }',
  );
  assert.match(text, /source="start" target="idle"/);
});
const { hmg2png, png2hmg } = require("../dist");
test("PNG preserves opaque black alongside transparent black across more than 256 colors", async () => {
  const data = new Uint8Array(300 * 4);
  for (let i = 0; i < 300; i++)
    data.set([i % 256, Math.floor(i / 256), i % 127, 255], i * 4);
  data.set([0, 0, 0, 0], 4);
  const image = { width: 300, height: 1, data };
  assert.deepEqual(await png2hmg(await hmg2png(image)), image);
});
test("FSM reconstruction recovers ANY scope without adding a self-reset transition", async () => {
  const text = await sourceFSMGraphML(`return {
 start={localName='start',type='state',jump={reset='g.start'}},
 g={localName='g',type='group',jump={reset='g.start'}},
 ['g.start']={localName='start',type='state',jump=false},
 ['g.stop']={localName='stop',type='state',jump={reset='g.start'}} }`);
  assert.match(text, />ANY<\/y:NodeLabel>/);
  assert.match(text, /source="ANY" target="g.start"/);
  assert.doesNotMatch(text, /source="g" target="g.start"/);
});
test("quest transition metadata remains present even when the public importer predates it", () => {
  const text = sourceGraphML("quest_scheme", {
    nodes: [
      {
        id: "n",
        name: "Wait",
        children: [],
        transition: [["dayChange", "a", "f"]],
      },
    ],
    connections: [],
  });
  assert.match(text, /attr.name="transition"/);
  assert.match(text, /<data key="d2">/);
  assert.match(text, /dayChange/);
});
test("package source restoration saves inside the requested destination", async (t) => {
  const fs = require("node:fs/promises"),
    path = require("node:path");
  const { restoreEditableAsset } = require("../dist/project-reconstruct");
  await fs.mkdir("node_modules/.cache", { recursive: true });
  const out = await fs.mkdtemp(
    path.resolve("node_modules/.cache/package-source-"),
  );
  t.after(() => fs.rm(out, { recursive: true, force: true }));
  const logical = "deck/sample.decks.psd",
    target = "game/asset/" + logical;
  let saved;
  const game = {
    nodes: { [logical]: { type: "deck_pack", objectFiles: {} } },
    getAssetNode(name) {
      return this.nodes[name];
    },
    assetLoaders: { deck_pack: true },
    loadAsset: async () => ({
      saveFile: async (file) => {
        saved = file;
        await fs.mkdir(file, { recursive: true });
        await fs.writeFile(path.join(file, "decks.json"), "{}");
      },
    }),
  };
  const result = await restoreEditableAsset(
    game,
    logical,
    target,
    async () => {},
    (name) => name,
    out,
  );
  assert.equal(saved, path.resolve(out, target));
  assert.equal(result.native, true);
  await fs.access(path.join(saved, "decks.json"));
});
test("source path remapping preserves child references and avoids unrelated prefixes", () => {
  const { remapSourceReferences } = require("../dist/util/source-reference");
  const input =
    '"deck/A.decks.psd/door" "deck/A.decks.psd" "xdeck/A.decks.psd" "deck/A.decks.psd2"';
  assert.equal(
    remapSourceReferences(input, { "deck/A.decks.psd": "deck/A.deckpack" }),
    '"deck/A.deckpack/door" "deck/A.deckpack" "xdeck/A.decks.psd" "deck/A.decks.psd2"',
  );
  assert.equal(
    remapSourceReferences('"game/asset/deck/A.decks.psd/door"', {
      "deck/A.decks.psd": "deck/A.deckpack",
    }),
    '"game/asset/deck/A.deckpack/door"',
  );
});

test("source restoration preserves registered texture loaders and their cache", async () => {
  const { Eastward, AssetNode, TextureAsset } = require("../dist");
  const { restoreEditableAsset } = require("../dist/project-reconstruct");
  const game = new Eastward({ root: "." });
  const logical = "texture/custom.psd";
  game.nodes[logical] = Object.assign(new AssetNode(logical), {
    type: "texture",
  });
  let loads = 0;
  class CustomTexture extends TextureAsset {
    async load() {
      loads++;
      this.hmg = { width: 1, height: 1, data: Uint8Array.of(10, 20, 30, 255) };
    }
  }
  game.registerAssetLoader("texture", CustomTexture, true);
  const written = [];
  for (const target of ["one.psd", "two.psd"]) {
    await restoreEditableAsset(
      game,
      logical,
      target,
      async (_file, bytes) => written.push(Buffer.from(bytes)),
      (name) => name,
      ".",
    );
  }
  assert.equal(loads, 1);
  assert.equal(game.assetLoaders.texture.loader, CustomTexture);
  assert.deepEqual([...written[0].subarray(40)], [10, 20, 30, 255]);
  assert.deepEqual(written[0], written[1]);
});

test("source export remaps folder scenes and native behavior script references", async (t) => {
  const fs = require("node:fs/promises"),
    path = require("node:path");
  const {
    Eastward,
    AssetNode,
    Asset,
    exportSourceProject,
  } = require("../dist");
  const base = await fs.mkdtemp(
    path.resolve("node_modules/.cache/scene-reference-"),
  );
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const game = new Eastward({ root: path.join(base, "input") });
  const deck = "deck/A.decks.psd",
    scene = "scene/Room.scene",
    script = "AI/Room.bt_script";
  for (const [logical, type, objectFiles] of [
    [deck, "deck_pack", {}],
    [scene, "scene", {}],
    [script, "bt_script", { def: "bt" }],
  ]) {
    game.nodes[logical] = Object.assign(new AssetNode(logical), {
      type,
      objectFiles,
      filePath: "game/asset/" + logical,
    });
  }
  class Package extends Asset {
    async saveFile(folder) {
      await fs.mkdir(folder, { recursive: true });
      const filename =
        this.node.type === "scene" ? "default.scene_group" : "decks.json";
      await fs.writeFile(
        path.join(folder, filename),
        JSON.stringify({ deck: deck + "/door" }),
      );
      if (this.node.type === "scene") {
        await fs.writeFile(
          path.join(folder, "graph.runtime.json"),
          JSON.stringify({ deck: deck + "/door" }),
        );
      }
    }
  }
  game.registerAssetLoader("deck_pack", Package, true);
  game.registerAssetLoader("scene", Package, true);
  game.loadFile = async () =>
    Buffer.from('+ root\n\tasset "' + deck + '/door"');
  const out = path.join(base, "out"),
    report = await exportSourceProject(game, out);
  const group = JSON.parse(
    await fs.readFile(
      path.join(out, "game/asset", scene, "default.scene_group"),
    ),
  );
  assert.equal(group.deck, "deck/A.deckpack/door");
  assert.match(
    await fs.readFile(path.join(out, "game/asset", script), "utf8"),
    /deck\/A\.deckpack\/door/,
  );
  assert.ok(report.remappedDocuments.includes("game/asset/" + scene));
  assert.ok(report.remappedDocuments.includes("game/asset/" + script));
  assert.equal(
    JSON.parse(
      await fs.readFile(
        path.join(out, "game/asset", scene, "graph.runtime.json"),
      ),
    ).deck,
    deck + "/door",
  );
});
test("source export writes Gii deck folders and rewrites source document references", async (t) => {
  const fs = require("node:fs/promises"),
    path = require("node:path");
  const { exportSourceProject } = require("../dist/project");
  const { AssetNode } = require("../dist");
  await fs.mkdir("node_modules/.cache", { recursive: true });
  const base = await fs.mkdtemp(
    path.resolve("node_modules/.cache/deck-source-"),
  );
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const logical = "deck/A.decks.psd",
    document = "config/refs.json";
  const node = (name, type, objectFiles = {}) =>
    Object.assign(new AssetNode(name), {
      type,
      filePath: "game/asset/" + name,
      objectFiles,
    });
  const game = {
    config: { root: path.join(base, "input") },
    nodes: {
      [logical]: node(logical, "deck_pack"),
      [document]: node(document, "data_json", { data: "refs" }),
    },
    assetLoaders: { deck_pack: true },
    loadFile: async () =>
      Buffer.from(JSON.stringify({ deck: logical + "/door" })),
    getAssetNode(name) {
      return this.nodes[name];
    },
    loadAsset: async () => ({
      saveFile: async (folder) => {
        await fs.mkdir(folder, { recursive: true });
        await fs.writeFile(path.join(folder, "decks.json"), "{}");
      },
    }),
  };
  const out = path.join(base, "output"),
    report = await exportSourceProject(game, out);
  assert.equal(report.restored[logical].path, "game/asset/deck/A.deckpack");
  assert.equal(report.pathRemappings[logical], "deck/A.deckpack");
  assert.deepEqual(report.remappedDocuments, ["game/asset/" + document]);
  assert.equal(
    JSON.parse(await fs.readFile(path.join(out, "game/asset/" + document)))
      .deck,
    "deck/A.deckpack/door",
  );
  game.nodes["deck/A.deckpack"] = node("deck/A.deckpack", "deck_pack_raw");
  await assert.rejects(
    exportSourceProject(game, path.join(base, "collision")),
    /collides/,
  );
});
