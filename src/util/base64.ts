export function uint8ArrayToBase64(bytes: Uint8Array) {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
}
