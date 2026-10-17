// Read-only validation of recovered data. Compiles Lua text without running it.
const fs = require("node:fs/promises");
const path = require("node:path");
const assert = require("node:assert/strict");
const { decode } = require("@msgpack/msgpack");
const { Lua } = require("wasmoon-lua5.1");
const { Eastward, png2hmg } = require("../dist");
const { TextureAsset } = require("../dist/asset/texture");

(async () => {
  const [outArg, gameRoot] = process.argv.slice(2);
  if (!outArg || !gameRoot)
    throw new Error(
      "Usage: node scripts/audit-project.cjs <recovery-directory> <game-root>",
    );
  const out = path.resolve(outArg);
  const manifest = JSON.parse(
    await fs.readFile(path.join(out, "project.json")),
  );
  const game = new Eastward({ root: gameRoot });
  await game.init();
  const lua = await Lua.create();
  const textureModes = new Set();
  const report = {
    assets: 0,
    outputs: 0,
    sprites: 0,
    modules: 0,
    texturePixelChecks: 0,
    lua: 0,
    lua51SyntaxErrors: [],
    reconstructionErrors: manifest.reconstructionErrors,
    missingResources: manifest.missingResources,
  };
  try {
    for (const [logical, record] of Object.entries(manifest.assets)) {
      const entry = JSON.parse(
        await fs.readFile(path.join(out, record.folder, "asset.json")),
      );
      for (let i = 0; i < entry.reconstructed.outputs.length; i += 64) {
        await Promise.all(
          entry.reconstructed.outputs
            .slice(i, i + 64)
            .map((file) => fs.access(path.join(out, file))),
        );
      }
      report.assets++;
      report.outputs += entry.reconstructed.outputs.length;
      if (record.type === "msprite") {
        const spriteFile = entry.reconstructed.outputs.find((file) =>
          file.endsWith("/sprite.json"),
        );
        if (!spriteFile) continue;
        const sprite = JSON.parse(
          await fs.readFile(path.join(out, spriteFile)),
        );
        const refs = entry.original.objectFiles;
        const source = refs.packed_def
          ? decode(
              await fs.readFile(path.join(out, "resources", refs.packed_def)),
            )
          : JSON.parse(
              await fs.readFile(path.join(out, "resources", refs.def)),
            );
        assert.deepEqual(sprite.sourceDefinition, source);
        for (const key of ["frames", "anims", "features"])
          assert.deepEqual(sprite[key], source[key]);
        assert.equal(
          Object.keys(sprite.modules).length,
          Object.keys(source.modules).length,
        );
        report.sprites++;
        report.modules += Object.keys(sprite.modules).length;
      }
      if (
        record.type === "texture" &&
        (report.texturePixelChecks < 16 ||
          !textureModes.has(!!game.findTexture(logical)?.parent?.atlasMode))
      ) {
        const imageFile = entry.reconstructed.outputs.find((file) =>
          file.endsWith("/image.png"),
        );
        if (!imageFile) continue;
        const texture = new TextureAsset(game, game.nodes[logical]);
        await texture.load();
        const expected = new Uint8Array(texture.hmg.data);
        if (texture.info.parent.premultiplyAlpha)
          for (let i = 0; i < expected.length; i += 4) {
            const alpha = expected[i + 3];
            for (let c = 0; c < 3; c++)
              expected[i + c] = alpha
                ? Math.min(255, Math.round((expected[i + c] * 255) / alpha))
                : 0;
          }
        const png = await png2hmg(await fs.readFile(path.join(out, imageFile)));
        assert.equal(png.width, texture.hmg.width);
        assert.equal(png.height, texture.hmg.height);
        assert.deepEqual(png.data, expected);
        report.texturePixelChecks++;
        textureModes.add(!!texture.info.parent.atlasMode);
      }
      if (record.type === "lua") {
        const sourceFile = entry.reconstructed.outputs.find((file) =>
          file.endsWith("/source.lua"),
        );
        if (!sourceFile) continue;
        lua.ctx.source = await fs.readFile(path.join(out, sourceFile), "utf8");
        await lua.doString(
          "local f,e=loadstring(source); syntax_error=e or false",
        );
        if (lua.ctx.syntax_error)
          report.lua51SyntaxErrors.push({
            logical,
            error: lua.ctx.syntax_error,
          });
        report.lua++;
      }
      if (report.assets % 5000 === 0)
        console.log(`Verified ${report.assets}/${manifest.assetCount}`);
    }
  } finally {
    lua.global.close();
  }
  assert.equal(report.assets, manifest.assetCount);
  await fs.writeFile(
    path.join(out, "verification.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
  if (
    report.missingResources.length ||
    Object.keys(report.reconstructionErrors).length ||
    report.lua51SyntaxErrors.length
  )
    process.exitCode = 1;
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
