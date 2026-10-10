// Minimal protobuf wire codec. Covers exactly the scalar shapes used by the
// Steam CM and CS2 GC messages in this extension; no schema, no reflection.

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder();

export class ProtoWriter {
  #parts = [];
  #length = 0;

  #push(bytes) {
    this.#parts.push(bytes);
    this.#length += bytes.length;
  }

  #varint(value) {
    let n = BigInt.asUintN(64, BigInt(value));
    const out = [];
    while (n > 0x7fn) {
      out.push(Number(n & 0x7fn) | 0x80);
      n >>= 7n;
    }
    out.push(Number(n));
    this.#push(Uint8Array.from(out));
  }

  #tag(field, wireType) {
    this.#varint((field << 3) | wireType);
  }

  // Negative int32 values are sign-extended to 64 bits, as the protobuf spec requires.
  uint(field, value) {
    if (value == null) return this;
    this.#tag(field, 0);
    this.#varint(value);
    return this;
  }

  bool(field, value) {
    if (value == null) return this;
    return this.uint(field, value ? 1 : 0);
  }

  fixed64(field, value) {
    if (value == null) return this;
    this.#tag(field, 1);
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setBigUint64(0, BigInt.asUintN(64, BigInt(value)), true);
    this.#push(bytes);
    return this;
  }

  fixed32(field, value) {
    if (value == null) return this;
    this.#tag(field, 5);
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setUint32(0, value >>> 0, true);
    this.#push(bytes);
    return this;
  }

  bytes(field, value) {
    if (value == null) return this;
    this.#tag(field, 2);
    this.#varint(value.length);
    this.#push(value);
    return this;
  }

  string(field, value) {
    if (value == null) return this;
    return this.bytes(field, utf8Encoder.encode(value));
  }

  message(field, writer) {
    if (writer == null) return this;
    return this.bytes(field, writer.finish());
  }

  finish() {
    return concatBytes(this.#parts, this.#length);
  }
}

export function concatBytes(parts, length = parts.reduce((sum, p) => sum + p.length, 0)) {
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

class ProtoMessage {
  #fields;

  constructor(fields) {
    this.#fields = fields;
  }

  all(field) {
    return this.#fields.get(field) || [];
  }

  has(field) {
    return this.#fields.has(field);
  }

  #last(field) {
    const values = this.#fields.get(field);
    return values ? values[values.length - 1] : undefined;
  }

  big(field) {
    const value = this.#last(field);
    return value === undefined ? undefined : BigInt(value);
  }

  uint(field, fallback) {
    const value = this.#last(field);
    return value === undefined ? fallback : Number(BigInt.asUintN(32, BigInt(value)));
  }

  int(field, fallback) {
    const value = this.#last(field);
    return value === undefined ? fallback : Number(BigInt.asIntN(32, BigInt(value)));
  }

  float(field, fallback) {
    const value = this.#last(field);
    if (typeof value !== 'number') return fallback;
    const view = new DataView(new ArrayBuffer(4));
    view.setUint32(0, value, true);
    return view.getFloat32(0, true);
  }

  bytes(field) {
    const value = this.#last(field);
    return value instanceof Uint8Array ? value : undefined;
  }

  str(field) {
    const value = this.bytes(field);
    return value ? utf8Decoder.decode(value) : undefined;
  }

  msg(field) {
    const value = this.bytes(field);
    return value ? decode(value) : undefined;
  }

  msgs(field) {
    return this.all(field).filter((v) => v instanceof Uint8Array).map(decode);
  }

  // Repeated varints may arrive packed or unpacked; both are valid on the wire.
  bigs(field) {
    const out = [];
    for (const value of this.all(field)) {
      if (value instanceof Uint8Array) {
        const reader = new Reader(value);
        while (!reader.done) out.push(reader.varint());
      } else {
        out.push(BigInt(value));
      }
    }
    return out;
  }
}

class Reader {
  #bytes;
  #view;
  #pos = 0;

  constructor(bytes) {
    this.#bytes = bytes;
    this.#view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  get done() {
    return this.#pos >= this.#bytes.length;
  }

  #need(count) {
    if (this.#pos + count > this.#bytes.length) throw new Error('Truncated protobuf');
  }

  varint() {
    let result = 0n;
    for (let shift = 0n; shift < 70n; shift += 7n) {
      this.#need(1);
      const byte = this.#bytes[this.#pos++];
      result |= BigInt(byte & 0x7f) << shift;
      if (!(byte & 0x80)) return BigInt.asUintN(64, result);
    }
    throw new Error('Malformed protobuf varint');
  }

  fixed64() {
    this.#need(8);
    const value = this.#view.getBigUint64(this.#pos, true);
    this.#pos += 8;
    return value;
  }

  fixed32() {
    this.#need(4);
    const value = this.#view.getUint32(this.#pos, true);
    this.#pos += 4;
    return value;
  }

  lengthDelimited() {
    const length = Number(this.varint());
    this.#need(length);
    const value = this.#bytes.subarray(this.#pos, this.#pos + length);
    this.#pos += length;
    return value;
  }
}

export function decode(bytes) {
  const reader = new Reader(bytes);
  const fields = new Map();
  while (!reader.done) {
    const key = reader.varint();
    const field = Number(key >> 3n);
    const wireType = Number(key & 7n);
    let value;
    switch (wireType) {
      case 0: value = reader.varint(); break;
      case 1: value = reader.fixed64(); break;
      case 2: value = reader.lengthDelimited(); break;
      case 5: value = reader.fixed32(); break;
      default: throw new Error(`Unsupported protobuf wire type ${wireType}`);
    }
    if (!fields.has(field)) fields.set(field, []);
    fields.get(field).push(value);
  }
  return new ProtoMessage(fields);
}
