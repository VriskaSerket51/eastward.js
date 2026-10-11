// Read-only integration audit. Never launches or modifies the game.
const { Eastward, registerAll, ASSET_TYPES } = require('../dist');
const { writeFileSync } = require('node:fs');

async function main() {
  const root = process.argv[2];
  if (!root) throw new Error('Usage: node scripts/audit-game.cjs <game-root> [report.json]');
  const game = new Eastward({ root });
  registerAll(game);
  await game.init();
  const report = { nodes: Object.keys(game.nodes).length, types: {}, unsupported: {}, checks: {}, failures: [] };
  for (const node of Object.values(game.nodes)) {
    report.types[node.type] = (report.types[node.type] || 0) + 1;
    if (node.type !== 'folder' && !ASSET_TYPES.includes(node.type)) {
      report.unsupported[node.type] = (report.unsupported[node.type] || 0) + 1;
    }
  }
  for (const type of ['texture', 'locale_pack', 'sq_script', 'proto', 'raw', 'deck_pack', 'deck_pack_raw', 'deck2d.mquad', 'deck2d.mtileset', 'deck2d.quads', 'deck2d.quad', 'deck2d.stretchpatch', 'deck2d.tileset', 'deck2d.quad_array', 'deck2d.polygon', 'named_tileset_pack', 'named_tileset']) {
    report.checks[type] = { passed: 0, failed: 0 };
    for (const node of Object.values(game.nodes).filter(node => node.type === type)) {
      try {
        const asset = await game.loadAsset(node.path);
        if (!asset) throw new Error('No loader result');
        if (type === 'texture' && !asset.hmg) throw new Error('Missing pixels');
        if (type === 'locale_pack' && !asset.langs.length) throw new Error('Missing translations');
        if (type === 'sq_script' && !asset.raw) throw new Error('Missing SQ data');
        if (type === 'proto' && !asset.data) throw new Error('Missing proto data');
        if (type.startsWith('deck_pack') && !asset.pack) throw new Error('Missing deck pack');
        report.checks[type].passed++;
        // Do not retain every decoded texture in memory during the audit.
        node.cachedAsset = null;
      } catch (error) {
        report.checks[type].failed++;
        report.failures.push({ path: node.path, error: error.message });
      }
    }
    console.log(type, report.checks[type]);
  }
  report.checks.mspriteDefinitions = { passed: 0, failed: 0, multiAtlas: 0 };
  for (const node of game.getAssetNodes('msprite')) {
    try {
      const def = node.objectFiles.packed_def
        ? await game.loadMsgPackFile(node.objectFiles.packed_def)
        : await game.loadJSONFile(node.objectFiles.def);
      if (!def) throw new Error('Missing definition');
      if (Object.keys(def.atlases).length > 1) report.checks.mspriteDefinitions.multiAtlas++;
      for (const frame of Object.values(def.frames)) {
        for (const [id] of frame.parts) if (!def.modules[id]) throw new Error(`Missing module ${id}`);
      }
      for (const anim of Object.values(def.anims)) {
        for (const [id, delay] of anim.seq) {
          if (!def.frames[id] || !Number.isFinite(delay) || delay < 0) throw new Error(`Invalid frame ${id}`);
        }
      }
      report.checks.mspriteDefinitions.passed++;
    } catch (error) {
      report.checks.mspriteDefinitions.failed++;
      report.failures.push({ path: node.path, error: error.message });
    }
  }
  report.checks.mspriteRender = { passed: 0, failed: 0 };
  for (const node of game.getAssetNodes('msprite').slice(0, 3)) {
    try {
      const asset = await game.loadAsset(node.path);
      if (!Object.keys(asset.animations || {}).length) throw new Error('No rendered animations');
      report.checks.mspriteRender.passed++;
    } catch (error) {
      report.checks.mspriteRender.failed++;
      report.failures.push({ path: node.path, error: error.message });
    }
  }
  if (process.argv[3]) writeFileSync(process.argv[3], JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (report.failures.length) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
