const { test } = require("node:test");
const assert = require("node:assert/strict");
const { encodeHMG, decodeHMG, readHMGHeader } = require("../dist");
const noPadding = { paddingA: new Uint8Array(), paddingB: new Uint8Array() };

test("PGF variable padding, metadata and sliced buffers follow the native layout", () => {
  const image = { width: 1, height: 1, data: Uint8Array.of(1, 2, 3, 4) };
  const original = encodeHMG(image, noPadding);
  for (const [a, b] of [
    [1, 4],
    [4, 1],
    [128, 255],
  ]) {
    const raw = Buffer.alloc(original.length + a + b);
    raw.set(original.subarray(0, 8));
    raw[3] = a;
    raw.fill(0xa5, 8, 8 + a);
    raw.set(original.subarray(8, 24), 8 + a);
    raw[20 + a] = 24;
    raw[21 + a] = 7; // Ignored metadata.
    raw[22 + a] = b;
    raw.fill(0x5a, 24 + a, 24 + a + b);
    raw.set(original.subarray(24), 24 + a + b);
    raw.writeUInt32LE(raw.length, 4);
    const sliced = Buffer.concat([Buffer.alloc(3), raw]).subarray(3);
    assert.deepEqual(decodeHMG(sliced), image);
    const header = readHMGHeader(sliced);
    assert.equal(header.pixelWidthDeclaration, 24);
    assert.equal(header.acceleration, 7);
    assert.equal(header.payloadOffset, 24 + a + b);
    const rewritten = encodeHMG(image, header);
    assert.deepEqual(readHMGHeader(rewritten).paddingA, header.paddingA);
    assert.deepEqual(readHMGHeader(rewritten).paddingB, header.paddingB);
    assert.deepEqual(decodeHMG(rewritten), image);
  }
});

test("PGF rejects inconsistent sizes, truncated padding and alternate-copy variants", () => {
  const original = encodeHMG({
    width: 1,
    height: 1,
    data: Uint8Array.of(1, 2, 3, 4),
  }, noPadding);
  const edit = (mutate) => {
    const raw = Buffer.from(original);
    mutate(raw);
    return raw;
  };
  assert.throws(() => decodeHMG(original.subarray(0, 23)), /header/);
  assert.throws(
    () => decodeHMG(edit((raw) => raw.writeUInt32LE(raw.length + 1, 4))),
    /file size/,
  );
  assert.throws(
    () => decodeHMG(edit((raw) => raw.writeUInt32LE(1, 8))),
    /payload size/,
  );
  assert.throws(() => decodeHMG(edit((raw) => (raw[3] = 255))), /padding/);
  assert.throws(() => decodeHMG(edit((raw) => (raw[22] = 255))), /padding/);
  assert.throws(
    () => readHMGHeader(edit((raw) => raw.writeInt32LE(-1, 12))),
    /dimensions/,
  );
  assert.throws(
    () => decodeHMG(edit((raw) => (raw[23] = 1))),
    /alternate-copy/,
  );
});

test("new PGF files use native padding ranges and explicit zero padding remains valid", () => {
  const image = { width: 1, height: 1, data: Uint8Array.of(1, 2, 3, 4) };
  for (let i = 0; i < 16; i++) {
    const raw = encodeHMG(image);
    const header = readHMGHeader(raw);
    assert.ok(header.paddingA.length >= 1 && header.paddingA.length <= 4);
    assert.ok(header.paddingB.length >= 1 && header.paddingB.length <= 4);
    assert.equal(header.pixelWidthDeclaration, 32);
    assert.equal(header.acceleration, 1);
    assert.equal(header.alternateCopyFlag, 0);
    assert.equal(raw.length, header.payloadOffset + header.compressedSize);
    assert.deepEqual(decodeHMG(raw), image);
  }
  assert.equal(readHMGHeader(encodeHMG(image, noPadding)).payloadOffset, 24);
  assert.throws(() => encodeHMG(image, { paddingA: new Uint8Array(256) }), /padding/);
});
