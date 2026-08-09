(function exposeRouteGifEncoder(global) {
  "use strict";

  class ByteWriter {
    constructor(initialCapacity = 1024 * 1024) {
      this.buffer = new Uint8Array(initialCapacity);
      this.length = 0;
    }

    ensure(extraLength) {
      const required = this.length + extraLength;
      if (required <= this.buffer.length) return;
      let nextCapacity = this.buffer.length;
      while (nextCapacity < required) nextCapacity *= 2;
      const next = new Uint8Array(nextCapacity);
      next.set(this.buffer);
      this.buffer = next;
    }

    byte(value) {
      this.ensure(1);
      this.buffer[this.length] = value & 0xff;
      this.length += 1;
    }

    short(value) {
      this.byte(value);
      this.byte(value >> 8);
    }

    ascii(value) {
      this.ensure(value.length);
      for (let index = 0; index < value.length; index += 1) {
        this.buffer[this.length + index] = value.charCodeAt(index) & 0xff;
      }
      this.length += value.length;
    }

    bytes(values) {
      this.ensure(values.length);
      this.buffer.set(values, this.length);
      this.length += values.length;
    }

    toUint8Array() {
      return this.buffer.slice(0, this.length);
    }
  }

  class BitWriter {
    constructor() {
      this.writer = new ByteWriter(64 * 1024);
      this.current = 0;
      this.bitCount = 0;
    }

    code(value, size) {
      this.current |= value << this.bitCount;
      this.bitCount += size;
      while (this.bitCount >= 8) {
        this.writer.byte(this.current);
        this.current >>>= 8;
        this.bitCount -= 8;
      }
    }

    finish() {
      if (this.bitCount > 0) this.writer.byte(this.current);
      return this.writer.toUint8Array();
    }
  }

  function makeRgb332Palette() {
    const palette = new Uint8Array(256 * 3);
    for (let index = 0; index < 256; index += 1) {
      palette[index * 3] = Math.round((((index >> 5) & 0x07) * 255) / 7);
      palette[index * 3 + 1] = Math.round((((index >> 2) & 0x07) * 255) / 7);
      palette[index * 3 + 2] = Math.round(((index & 0x03) * 255) / 3);
    }
    return palette;
  }

  function quantizeRgb332(rgba) {
    const pixels = new Uint8Array(rgba.length / 4);
    for (let source = 0, target = 0; source < rgba.length; source += 4, target += 1) {
      const alpha = rgba[source + 3];
      if (alpha < 128) {
        pixels[target] = 0;
        continue;
      }
      pixels[target] =
        ((rgba[source] >> 5) << 5) |
        ((rgba[source + 1] >> 5) << 2) |
        (rgba[source + 2] >> 6);
    }
    return pixels;
  }

  function encodeLzw(pixels, minimumCodeSize = 8) {
    const clearCode = 1 << minimumCodeSize;
    const endCode = clearCode + 1;
    const bits = new BitWriter();
    const dictionary = new Map();
    let nextCode = endCode + 1;
    let codeSize = minimumCodeSize + 1;

    const reset = () => {
      dictionary.clear();
      nextCode = endCode + 1;
      codeSize = minimumCodeSize + 1;
    };

    bits.code(clearCode, codeSize);
    if (pixels.length === 0) {
      bits.code(endCode, codeSize);
      return bits.finish();
    }

    let prefix = pixels[0];
    for (let index = 1; index < pixels.length; index += 1) {
      const suffix = pixels[index];
      const key = (prefix << 8) | suffix;
      const existing = dictionary.get(key);
      if (existing !== undefined) {
        prefix = existing;
        continue;
      }

      bits.code(prefix, codeSize);
      if (nextCode < 4096) {
        dictionary.set(key, nextCode);
        nextCode += 1;
        if (nextCode > 1 << codeSize && codeSize < 12) codeSize += 1;
      } else {
        bits.code(clearCode, codeSize);
        reset();
      }
      prefix = suffix;
    }

    bits.code(prefix, codeSize);
    bits.code(endCode, codeSize);
    return bits.finish();
  }

  function writeSubBlocks(writer, data) {
    for (let offset = 0; offset < data.length; offset += 255) {
      const length = Math.min(255, data.length - offset);
      writer.byte(length);
      writer.bytes(data.subarray(offset, offset + length));
    }
    writer.byte(0);
  }

  class GifEncoder {
    constructor(width, height, options = {}) {
      if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
        throw new Error("GIFの幅と高さが正しくありません。");
      }
      if (width > 65535 || height > 65535) {
        throw new Error("GIFの幅または高さが大きすぎます。");
      }
      this.width = width;
      this.height = height;
      this.writer = new ByteWriter();
      this.finished = false;
      this.frameCount = 0;
      this.writeHeader(Number(options.loop) || 0);
    }

    writeHeader(loop) {
      const writer = this.writer;
      writer.ascii("GIF89a");
      writer.short(this.width);
      writer.short(this.height);
      writer.byte(0xf7);
      writer.byte(0);
      writer.byte(0);
      writer.bytes(makeRgb332Palette());
      writer.byte(0x21);
      writer.byte(0xff);
      writer.byte(0x0b);
      writer.ascii("NETSCAPE2.0");
      writer.byte(0x03);
      writer.byte(0x01);
      writer.short(Math.max(0, Math.min(65535, loop)));
      writer.byte(0);
    }

    addFrame(rgba, delayCentiseconds = 10) {
      if (this.finished) throw new Error("完成済みのGIFへフレームを追加できません。");
      if (!rgba || rgba.length !== this.width * this.height * 4) {
        throw new Error("GIFフレームの画像サイズが一致しません。");
      }

      const writer = this.writer;
      const delay = Math.max(2, Math.min(65535, Math.round(delayCentiseconds)));
      writer.byte(0x21);
      writer.byte(0xf9);
      writer.byte(0x04);
      writer.byte(0x04);
      writer.short(delay);
      writer.byte(0);
      writer.byte(0);

      writer.byte(0x2c);
      writer.short(0);
      writer.short(0);
      writer.short(this.width);
      writer.short(this.height);
      writer.byte(0);
      writer.byte(8);
      writeSubBlocks(writer, encodeLzw(quantizeRgb332(rgba), 8));
      this.frameCount += 1;
    }

    finish() {
      if (!this.finished) {
        this.writer.byte(0x3b);
        this.finished = true;
      }
      return new Blob([this.writer.toUint8Array()], { type: "image/gif" });
    }

    toUint8Array() {
      if (!this.finished) {
        this.writer.byte(0x3b);
        this.finished = true;
      }
      return this.writer.toUint8Array();
    }
  }

  global.RouteGifEncoder = Object.freeze({ GifEncoder });
})(typeof window === "undefined" ? globalThis : window);
