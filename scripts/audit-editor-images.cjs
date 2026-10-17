const path = require("node:path");
const fs = require("node:fs/promises");
const { Eastward, registerAll, png2hmg, decodeHMG } = require("../dist");
async function main() {
  const root = process.argv[2] || "extract/eastward-source-final";
  const gameRoot =
    process.argv[3] || "C:/Program Files (x86)/Steam/steamapps/common/Eastward";
  const game = new Eastward({ root: gameRoot });
  registerAll(game);
  await game.init();
  const metadata = JSON.parse(
    await fs.readFile(path.join(root, ".eastward-project.json"), "utf8"),
  );
  const result = { png: 0, psd: 0, errors: {} };
  for (const [logical, record] of Object.entries(metadata.assets)) {
    const node = game.nodes[logical];
    if (!["texture", "lut_texture"].includes(node.type)) continue;
    try {
      let expected;
      if (node.type === "texture") {
        const asset = await game.loadAsset(logical);
        expected = asset.toSourceImage();
        node.cachedAsset = null;
      } else {
        const raw = await game.loadFile(node.objectFiles.texture);
        expected = raw[0] === 0x89 ? await png2hmg(raw) : decodeHMG(raw);
      }
      const raw = await fs.readFile(root + "/" + record);
      let actual;
      if (record.endsWith(".psd")) {
        if (
          raw.toString("ascii", 0, 4) !== "8BPS" ||
          raw.readUInt16BE(12) !== 4 ||
          raw.readUInt16BE(24) !== 3
        )
          throw Error("Invalid PSD header");
        const width = raw.readUInt32BE(18),
          height = raw.readUInt32BE(14),
          n = width * height;
        const data = new Uint8Array(n * 4);
        if (raw.length !== 40 + n * 4) throw Error("PSD size mismatch");
        for (let c = 0; c < 4; c++)
          for (let i = 0; i < n; i++) data[i * 4 + c] = raw[40 + c * n + i];
        actual = { width, height, data };
        result.psd++;
      } else {
        actual = await png2hmg(raw);
        result.png++;
      }
      if (
        expected.width !== actual.width ||
        expected.height !== actual.height ||
        expected.data.length !== actual.data.length ||
        expected.data.some((b, i) => b !== actual.data[i])
      )
        throw Error("Pixel data differs");
    } catch (error) {
      result.errors[logical] = error.message;
    }
  }
  console.log(JSON.stringify(result));
  if (Object.keys(result.errors).length) process.exitCode = 1;
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
