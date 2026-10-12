const { test } = require("node:test");
const assert = require("node:assert/strict");
const { encodeHMG, decodeHMG } = require("../dist");

test("PGF variable padding, metadata and sliced buffers follow the native layout", () => {
  const image = { width: 1, height: 1, data: Uint8Array.of(1, 2, 3, 4) };
  const original = encodeHMG(image);
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
  }
});

test("PGF rejects inconsistent sizes, truncated padding and alternate-copy variants", () => {
  const original = encodeHMG({
    width: 1,
    height: 1,
    data: Uint8Array.of(1, 2, 3, 4),
  });
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
    () => decodeHMG(edit((raw) => (raw[23] = 1))),
    /alternate-copy/,
  );
});
