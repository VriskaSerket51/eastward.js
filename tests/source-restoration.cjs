const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { restoreSourceTree } = require("../scripts/restore-source-tree.cjs");
const { Eastward, AssetNode, DataCsvAsset, DataXlsAsset } = require("../dist");
const { decompileSQ } = require("../dist/util/sq");
const xlsx = require("xlsx");

test("source restoration preserves source paths and does not disguise compiled FSM as GraphML", async (t) => {
  const base = path.resolve("node_modules/.cache");
  await fs.mkdir(base, { recursive: true });
  const temp = await fs.mkdtemp(path.join(base, "source-restoration-"));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const input = path.join(temp, "input");
  await fs.mkdir(path.join(input, "resources/cache"), { recursive: true });
  const bytes = Buffer.from("+ root\n\t@original\n");
  await fs.writeFile(path.join(input, "resources/cache/bt"), bytes);
  const entries = {
    "AI/Apple.bt_script": {
      type: "bt_script",
      objectFiles: { def: "cache/bt" },
    },
    "AI/State.fsm.graphml": {
      type: "fsm_scheme",
      objectFiles: { def: "cache/lua" },
    },
    "config/Table.csv": { type: "data_csv", objectFiles: { data: "cache/bt" } },
  };
  const assets = {};
  for (const [logical, original] of Object.entries(entries)) {
    const folder = "assets/" + logical;
    assets[logical] = { folder, type: original.type };
    await fs.mkdir(path.join(input, folder), { recursive: true });
    await fs.writeFile(
      path.join(input, folder, "asset.json"),
      JSON.stringify({
        original: { ...original, filePath: "game/asset/" + logical },
        resources: { def: [original.objectFiles.def] },
        reconstructed: { outputs: [] },
      }),
    );
  }
  await fs.writeFile(
    path.join(input, "project.json"),
    JSON.stringify({ format: "eastward-recovery-project", assets }),
  );
  const output = path.join(temp, "output");
  const report = await restoreSourceTree(input, output);
  assert.deepEqual(
    await fs.readFile(path.join(output, "game/asset/AI/Apple.bt_script")),
    bytes,
  );
  await assert.rejects(
    fs.access(path.join(output, "game/asset/AI/State.fsm.graphml")),
  );
  await assert.rejects(fs.access(path.join(output, "project.json")));
  await assert.rejects(
    fs.access(path.join(output, "game/asset/config/Table.csv")),
  );
  assert.match(
    report.unavailable["AI/State.fsm.graphml"],
    /No usable compiled graph data/,
  );
  const metadata = JSON.parse(
    await fs.readFile(path.join(output, ".eastward-project.json")),
  );
  assert.deepEqual(metadata, {
    format: "eastward-source-project",
    version: 1,
    assets: { "AI/Apple.bt_script": "game/asset/AI/Apple.bt_script" },
    pathRemappings: {},
  });
  await assert.rejects(fs.access(output + ".recovery.json"));
});

test("existing CSV loader restores dict rows, stable list columns and escaped cells", async () => {
  const node = Object.assign(new AssetNode("Table.dict.csv"), {
    name: "Table.dict.csv",
    objectFiles: { data: "data" },
  });
  const game = { loadJSONFile: async () => ({ first: 'a,"b"\nc', second: 2 }) };
  const asset = new DataCsvAsset(game, node);
  await asset.load();
  assert.equal(await asset.toString(), 'first,"a,""b""\nc"\nsecond,2');
  node.name = "Table.list.csv";
  game.loadJSONFile = async () => [
    { a: 1, b: 2 },
    { b: 4, a: 3 },
  ];
  await asset.load();
  assert.equal(await asset.toString(), "a,b\n1,2\n3,4");
  game.loadJSONFile = async () => [];
  await asset.load();
  assert.equal(await asset.toString(), "\n");
});

test("existing workbook exporter retains importer sheet types and localizable keys", () => {
  const asset = new DataXlsAsset({}, new AssetNode("test.xls"));
  const workbook = asset.toWorkbook(
    { Text: [{ id: 1, value: "hi" }], Config: { flag: true } },
    {
      Text: {
        type: "list",
        keys: ["id", "value"],
        keyMeta: [false, "localizable"],
      },
      Config: { type: "dict", sequence: ["flag"], comment: { flag: "keep" } },
    },
  );
  assert.deepEqual(workbook.SheetNames, ["Text@list", "Config@dict"]);
  assert.deepEqual(
    xlsx.utils.sheet_to_json(workbook.Sheets["Text@list"], { header: 1 }),
    [
      ["id", "%value"],
      [1, "hi"],
    ],
  );
  assert.deepEqual(
    xlsx.utils.sheet_to_json(workbook.Sheets["Config@dict"], { header: 1 }),
    [["flag", true, "keep"]],
  );
});

test("workbook sheet names cannot shadow object ownership methods", () => {
  const asset = new DataXlsAsset({}, new AssetNode("test.xls"));
  const workbook = asset.toWorkbook(
    JSON.parse('{"hasOwnProperty":[["keep"]]}'),
    { hasOwnProperty: { type: "raw" } },
  );
  assert.deepEqual(workbook.SheetNames, ["hasOwnProperty@raw"]);
  assert.deepEqual(
    xlsx.utils.sheet_to_json(workbook.Sheets["hasOwnProperty@raw"], {
      header: 1,
    }),
    [["keep"]],
  );
});

test("SQ source uses long argument syntax without adding spaces or doubling subnode names", () => {
  const text = decompileSQ({
    type: "root",
    children: [
      {
        type: "action",
        name: "say",
        args: [" hello", "world"],
        lineCount: 2,
        inlineDirectives: [{ name: "sound", value: "voice" }],
        children: [],
      },
      {
        type: "action",
        name: "option.pick",
        sub: true,
        args: ["1"],
        lineCount: 1,
        children: [],
      },
    ],
  });
  assert.equal(text, "say: hello\n\tworld//$sound(voice)\noption.pick 1\n");
  assert.equal(
    decompileSQ({
      type: "root",
      children: [
        { type: "action", name: "say", args: ["", "ok", ""], lineCount: 4 },
      ],
    }),
    "say:\n\t//\n\tok\n\t//\n",
  );
});
