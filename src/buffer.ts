export class Buffer {
  raw;
  offset = 0;
  viewer;

  constructor(raw: Uint8Array) {
    this.raw = raw;
    this.viewer = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  }

  readBytes(count: number) {
    return Array.from(this.readBytesView(count));
  }

  readBytesView(count: number) {
    if (
      !Number.isInteger(count) ||
      count < 0 ||
      count > this.raw.byteLength - this.offset
    ) {
      throw new RangeError("Byte count exceeds buffer bounds");
    }
    const value = this.raw.subarray(this.offset, this.offset + count);
    this.offset += count;
    return value;
  }

  readChars(count: number) {
    return String.fromCharCode(...this.readBytes(count));
  }

  readInt8() {
    const value = this.viewer.getInt8(this.offset);
    this.offset += 1;
    return value;
  }

  readUInt8() {
    const value = this.viewer.getUint8(this.offset);
    this.offset += 1;
    return value;
  }

  readInt32() {
    const value = this.viewer.getInt32(this.offset, true);
    this.offset += 4;
    return value;
  }

  readZString() {
    const value: number[] = [];
    let char;
    while ((char = this.readUInt8())) {
      value.push(char);
    }
    return new TextDecoder().decode(Uint8Array.from(value));
  }
}
