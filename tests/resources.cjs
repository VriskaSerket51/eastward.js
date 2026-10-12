const { test } = require('node:test');
const assert = require('node:assert/strict');
const { deserialize } = require('../dist/util/serializer');
const { poToLocale, localeToPO } = require('../dist/util/i18n');
const { MSpriteAsset, LocalePackAsset, AssetNode } = require('../dist');
const { encodeHMG, decodeHMG } = require('../dist');
const { Eastward, Asset, GArchive } = require('../dist');

test('concurrent asset loads share work and failed loads can be retried', async () => {
  const game = new Eastward({ root: '.' });
  const node = new AssetNode('sample');
  node.type = 'sample';
  game.nodes.sample = node;
  let calls = 0;
  class Sample extends Asset {
    async load() { calls++; await new Promise(resolve => setImmediate(resolve)); }
  }
  game.registerAssetLoader('sample', Sample);
  const [a, b] = await Promise.all([game.loadAsset('sample'), game.loadAsset('sample')]);
  assert.equal(a, b);
  assert.equal(calls, 1);
  node.cachedAsset = null;
  class Fail extends Asset { async load() { throw new Error('failure'); } }
  game.registerAssetLoader('sample', Fail);
  await assert.rejects(game.loadAsset('sample'), /failure/);
  game.registerAssetLoader('sample', Sample);
  assert.ok(await game.loadAsset('sample'));
  assert.equal(calls, 2);
});

test('concurrent archive readers load each source once', async () => {
  const archive = new GArchive({});
  archive.lazyLoad('sample');
  let calls = 0;
  archive.load = async () => { calls++; await new Promise(resolve => setImmediate(resolve)); };
  await Promise.all([archive.getFileNames(), archive.getFileNames()]);
  assert.equal(calls, 1);
});

test('sprite WebP durations convert source seconds to milliseconds', async () => {
  const WebP = require('node-webpmux');
  const node = new AssetNode('sprite.msprite');
  node.name = 'sprite.msprite';
  node.objectFiles = { def: 'def' };
  node.children.texture = Object.assign(new AssetNode('sprite.msprite/sprite_texture'), { type: 'texture' });
  const definition = {
    modules: { m: { atlas: '0', rect: [0, 0, 1, 1], feature: 0 } },
    frames: { f: { parts: [['m', -3, -4]], meta: { origin: [0, 0] } } },
    anims: { a: { name: 'test', seq: [['f', 0.1, 0, 0], ['f', 0.25, 0, 0]] } },
    atlases: { 0: 'atlas' }, features: [],
  };
  const asset = new MSpriteAsset({
    loadJSONFile: async () => definition,
    loadAsset: async () => ({ toSourceImage: () => ({ width: 1, height: 1, data: new Uint8Array([255, 0, 0, 255]) }) }),
  }, node);
  await asset.load();
  const image = new WebP.Image();
  await image.load(asset.animations.test);
  assert.deepEqual(image.frames.map(frame => frame.delay), [100, 250]);
  assert.equal(asset.definition, definition);
});

test('short and incompressible HMG pixels survive a round trip', () => {
  for (const width of [1, 4, 68]) {
    const data = Uint8Array.from({ length: width * 4 }, (_, i) => (i * 73 + 11) % 256);
    assert.deepEqual(decodeHMG(encodeHMG({ width, height: 1, data })), { width, height: 1, data });
  }
});

test('raw serializer bodies remain literal, aliases retain identity', () => {
  const raw = { literal: 'root' };
  const root = {};
  assert.equal(deserialize(root, { root: 'root', map: {
    root: { model: 'Test', body: { raw: 'raw', alias: 'alias' } },
    raw: { body: raw }, alias: { alias: 'raw' },
  } }), root);
  assert.equal(root.raw, raw);
  assert.equal(root.alias, raw);
  assert.equal(raw.literal, 'root');
});

test('cyclic and missing aliases fail promptly', () => {
  assert.throws(() => deserialize({}, { root: 'a', map: {
    a: { alias: 'b' }, b: { alias: 'a' },
  } }), /cycle/);
  assert.throws(() => deserialize({}, { root: 'a', map: { a: { alias: 'missing' } } }), /alias not found/);
});

test('PO translations round trip unicode and multiline values', () => {
  const locale = { greeting: '안녕\nEastward', quote: '"hello"' };
  assert.deepEqual(poToLocale(localeToPO(locale)), locale);
});

test('negative sprite bounds do not expand to zero', () => {
  const asset = new MSpriteAsset({}, new AssetNode('test'));
  assert.deepEqual(asset._calculateBound([{ x: -10, y: -8, w: 2, h: 3 }]), { x: -10, y: -8, w: 2, h: 3 });
});

test('locale discovery loads custom languages and skips missing languages', async () => {
  const node = new AssetNode('test');
  node.objectFiles = { config: 'config', data: 'locales' };
  const game = {
    loadJSONFile: async () => ({ source_locale: 'en', items: [] }),
    loadDirectory: async () => ['it'],
    loadTextFile: async path => path.endsWith('/it') ? 'return { dialog = { greeting = "ciao" } }' : null,
  };
  const asset = new LocalePackAsset(game, node);
  await asset.load();
  assert.deepEqual(asset.langs, ['it']);
  assert.deepEqual(asset.getTranslation('dialog', 'it'), { greeting: 'ciao' });
  await asset.load();
  assert.deepEqual(asset.langs, ['it']);
});
