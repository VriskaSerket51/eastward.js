# Eastward HMG format

English | [한국어](hmg-format.ko.md)

HMG consists of a `PGF` header and LZ4-compressed RGBA pixel data. Padding determines the header length.

## Layout

Integers are stored in little-endian order. `A` and `B` are the padding lengths stored at offsets `3` and `22 + A`, respectively. Sizes in the table are in bytes.

| Offset | Size | Field |
| --- | --- | --- |
| `0` | 3 | ASCII `PGF` (`50 47 46`) |
| `3` | 1 | First padding length `A` |
| `4` | 4 | Total size `S` |
| `8` | `A` | First padding |
| `8 + A` | 4 | Compressed length `C` |
| `12 + A` | 4 | Width `W` |
| `16 + A` | 4 | Height `H` |
| `20 + A` | 1 | Declared pixel width: 32 |
| `21 + A` | 1 | LZ4 acceleration: 1 |
| `22 + A` | 1 | Second padding length `B` |
| `23 + A` | 1 | Alternate copy flag: 0 |
| `24 + A` | `B` | Second padding |
| `24 + A + B` | `C` | LZ4 raw block |

```text
payloadOffset = 24 + A + B
S             = payloadOffset + C
pixelBytes    = W * H * 4
```

The total size and compressed length are unsigned 32-bit integers; width and height are signed 32-bit integers. With both padding lengths set to zero, the payload starts at offset 24.

## Pixels and compression

Pixels use RGBA8888, with an uncompressed size of `W * H * 4` bytes. The declared value 32 likely means bits per pixel, but the reader does not use this field. Setting it to 24 does not produce RGB888 pixels.

The payload is a raw LZ4 block, not an LZ4 frame. Acceleration controls compression search and is not used during decompression.

## Padding

The game writer chooses each padding length with `rand() % 4 + 1` and fills it with random bytes. The reader skips these bytes.

Changing padding or removing it while adjusting the size fields does not change the pixels.

## Alternate copy flag

A value of 0 decompresses directly into the image buffer. The other branch allocates a temporary buffer of `W * H + 1024` bytes, reads the source four bytes at a time and advances the destination by one byte. Writes overlap, and large images can cause out-of-bounds reads.

The game writer always stores 0. The JS/C# implementations reject nonzero flags.
