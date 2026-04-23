/**
 * Helper that turns a sequence of Flight `FlightData` frames into a single
 * Arrow IPC stream byte buffer, which Arrow JS's `tableFromIPC` /
 * `RecordBatchReader.from` can consume directly.
 *
 * Arrow IPC stream format (per message):
 *
 *   0xFFFFFFFF  (4 bytes, little-endian continuation marker)
 *   length      (4 bytes, little-endian uint32 — size of the flatbuffer Message)
 *   flatbuffer bytes
 *   padding     (zero bytes to 8-byte alignment, computed relative to start)
 *   body        (optional — for RecordBatch messages)
 *
 * Streams end with a 4-byte zero length marker after the continuation.
 */

export class IpcStreamBuilder {
  private chunks: Uint8Array[] = [];
  private length = 0;

  /** Append one Arrow message (header flatbuffer bytes + optional body). */
  append(dataHeader: Uint8Array, dataBody: Uint8Array = new Uint8Array(0)): void {
    if (dataHeader.length === 0) return;

    // Continuation marker + length prefix (8 bytes total, 8-byte aligned).
    const prefix = new Uint8Array(8);
    const prefixView = new DataView(prefix.buffer);
    prefixView.setUint32(0, 0xffffffff, true);
    prefixView.setUint32(4, dataHeader.length, true);
    this.push(prefix);

    this.push(dataHeader);

    // Pad the header to an 8-byte boundary so the body starts aligned.
    const headerEnd = this.length;
    const headerStart = headerEnd - dataHeader.length - 8; // where the prefix began
    const padding = (8 - ((headerEnd - headerStart) % 8)) % 8;
    if (padding > 0) this.push(new Uint8Array(padding));

    if (dataBody.length > 0) this.push(dataBody);
  }

  /** Close the stream with the standard EOS marker and return the full bytes. */
  finish(): Uint8Array {
    const eos = new Uint8Array(8);
    // Continuation + length=0
    new DataView(eos.buffer).setUint32(0, 0xffffffff, true);
    this.push(eos);
    return concat(this.chunks, this.length);
  }

  /**
   * Append raw already-framed bytes (e.g. a block produced by an earlier
   * builder's partial output). The caller is responsible for ensuring the
   * block is a concatenation of well-framed Arrow IPC messages.
   */
  pushRaw(chunk: Uint8Array): void {
    if (chunk.length > 0) this.push(chunk);
  }

  private push(chunk: Uint8Array): void {
    this.chunks.push(chunk);
    this.length += chunk.length;
  }
}

function concat(chunks: readonly Uint8Array[], totalLength: number): Uint8Array {
  const out = new Uint8Array(totalLength);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}
