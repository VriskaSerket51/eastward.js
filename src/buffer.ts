export class BufferWrapper {
  raw;
  offset = 0;

  constructor(buffer: Buffer) {
    this.raw = buffer;
  }

  readBytes(count: number) {
    const value: number[] = [];
    for (let i = 0; i < count; i++) {
      value.push(this.readUInt8());
    }
    return value;
  }

  readChars(count: number) {
    return String.fromCharCode(...this.readBytes(count));
  }

  readInt8() {
    const value = this.raw.readInt8(this.offset);
    this.offset += 1;
    return value;
  }

  readUInt8() {
    const value = this.raw.readUInt8(this.offset);
    this.offset += 1;
    return value;
  }

  readInt32() {
    const value = this.raw.readInt32LE(this.offset);
    this.offset += 4;
    return value;
  }

  readZString() {
    const value: number[] = [];
    let char;
    while ((char = this.readUInt8())) {
      value.push(char);
    }
    return String.fromCharCode(...value);
  }
}
