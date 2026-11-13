/** Length-prefixed gRPC message framing, as used by grpc-web and the websocket transport. */

const DATA_FLAG = 0x00;
const TRAILER_FLAG = 0x80;

export type Frame = { kind: 'data'; data: Uint8Array } | { kind: 'trailers'; metadata: Record<string, string> };

/** Wraps a serialized message in a 5-byte gRPC frame header. */
export function encodeFrame(message: Uint8Array): Uint8Array {
  const framed = new Uint8Array(message.byteLength + 5);
  framed[0] = DATA_FLAG;
  new DataView(framed.buffer).setUint32(1, message.byteLength, false);
  framed.set(message, 5);
  return framed;
}

/** Parses an HTTP/1-style block of `name: value` lines into a map keyed by lower-case name. */
export function parseHeaderBlock(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const colon = line.indexOf(':');
    if (colon > 0) {
      const name = line.substring(0, colon).trim().toLowerCase();
      const value = line.substring(colon + 1).trim();
      result[name] = name in result ? `${result[name]}, ${value}` : value;
    }
  }
  return result;
}

export function decodeAscii(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    s += String.fromCharCode(bytes[i]);
  }
  return s;
}

export function encodeAscii(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    bytes[i] = text.charCodeAt(i) & 0x7f;
  }
  return bytes;
}

/** Splits a byte stream into gRPC frames, buffering partial frames across chunks. */
export class FrameParser {
  private buffer: Uint8Array = new Uint8Array(0);

  push(chunk: Uint8Array): Frame[] {
    if (this.buffer.length === 0) {
      this.buffer = chunk;
    } else {
      const combined = new Uint8Array(this.buffer.length + chunk.length);
      combined.set(this.buffer);
      combined.set(chunk, this.buffer.length);
      this.buffer = combined;
    }
    const frames: Frame[] = [];
    while (this.buffer.length >= 5) {
      const flag = this.buffer[0];
      const length = new DataView(this.buffer.buffer, this.buffer.byteOffset + 1, 4).getUint32(0, false);
      if (this.buffer.length < 5 + length) {
        break;
      }
      const payload = this.buffer.subarray(5, 5 + length);
      this.buffer = this.buffer.subarray(5 + length);
      if ((flag & TRAILER_FLAG) === TRAILER_FLAG) {
        frames.push({ kind: 'trailers', metadata: parseHeaderBlock(decodeAscii(payload)) });
      } else {
        frames.push({ kind: 'data', data: payload });
      }
    }
    return frames;
  }
}
