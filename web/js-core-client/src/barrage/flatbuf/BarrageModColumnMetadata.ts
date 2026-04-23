import type { ByteBuffer } from 'flatbuffers';

/** Read-only port of io.deephaven.barrage.flatbuf.BarrageModColumnMetadata. */
export class BarrageModColumnMetadata {
  bb!: ByteBuffer;
  bb_pos = 0;

  __init(i: number, bb: ByteBuffer): this {
    this.bb_pos = i;
    this.bb = bb;
    return this;
  }

  /** Compressed, encoded RowSet of modified rows within the viewport. */
  modifiedRows(): Uint8Array | null {
    const o = this.bb.__offset(this.bb_pos, 4);
    if (o === 0) return null;
    const vec = this.bb.__vector(o + this.bb_pos);
    const len = this.bb.__vector_len(o + this.bb_pos);
    return this.bb.bytes().subarray(vec, vec + len);
  }
}
