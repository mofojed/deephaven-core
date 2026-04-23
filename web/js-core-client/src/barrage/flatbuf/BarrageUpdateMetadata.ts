import { ByteBuffer } from 'flatbuffers';
import { BarrageModColumnMetadata } from './BarrageModColumnMetadata.js';

/**
 * Read-only port of io.deephaven.barrage.flatbuf.BarrageUpdateMetadata.
 *
 * Field slot offsets match the Java source (4=firstSeq, 6=lastSeq, 8=isSnapshot,
 * 10=effectiveViewport, 12=effectiveReverseViewport, 14=effectiveColumnSet,
 * 16=addedRows, 18=removedRows, 20=shiftData, 22=addedRowsIncluded,
 * 24=modColumnNodes, 26=tableSize).
 */
export class BarrageUpdateMetadata {
  bb!: ByteBuffer;
  bb_pos = 0;

  static getRootAsBarrageUpdateMetadata(bb: ByteBuffer): BarrageUpdateMetadata {
    const obj = new BarrageUpdateMetadata();
    return obj.__init(bb.readInt32(bb.position()) + bb.position(), bb);
  }

  __init(i: number, bb: ByteBuffer): this {
    this.bb_pos = i;
    this.bb = bb;
    return this;
  }

  firstSeq(): bigint {
    const o = this.bb.__offset(this.bb_pos, 4);
    return o !== 0 ? this.bb.readInt64(o + this.bb_pos) : 0n;
  }

  lastSeq(): bigint {
    const o = this.bb.__offset(this.bb_pos, 6);
    return o !== 0 ? this.bb.readInt64(o + this.bb_pos) : 0n;
  }

  isSnapshot(): boolean {
    const o = this.bb.__offset(this.bb_pos, 8);
    return o !== 0 && this.bb.readInt8(o + this.bb_pos) !== 0;
  }

  effectiveViewport(): Uint8Array | null {
    return this.readByteVector(10);
  }

  effectiveReverseViewport(): boolean {
    const o = this.bb.__offset(this.bb_pos, 12);
    return o !== 0 && this.bb.readInt8(o + this.bb_pos) !== 0;
  }

  effectiveColumnSet(): Uint8Array | null {
    return this.readByteVector(14);
  }

  addedRows(): Uint8Array | null {
    return this.readByteVector(16);
  }

  removedRows(): Uint8Array | null {
    return this.readByteVector(18);
  }

  shiftData(): Uint8Array | null {
    return this.readByteVector(20);
  }

  addedRowsIncluded(): Uint8Array | null {
    return this.readByteVector(22);
  }

  modColumnNodesLength(): number {
    const o = this.bb.__offset(this.bb_pos, 24);
    return o !== 0 ? this.bb.__vector_len(o + this.bb_pos) : 0;
  }

  modColumnNodes(j: number): BarrageModColumnMetadata | null {
    const o = this.bb.__offset(this.bb_pos, 24);
    if (o === 0) return null;
    const elem = this.bb.__vector(o + this.bb_pos) + j * 4;
    return new BarrageModColumnMetadata().__init(this.bb.__indirect(elem), this.bb);
  }

  tableSize(): bigint {
    const o = this.bb.__offset(this.bb_pos, 26);
    return o !== 0 ? this.bb.readInt64(o + this.bb_pos) : 0n;
  }

  private readByteVector(vtableOffset: number): Uint8Array | null {
    const o = this.bb.__offset(this.bb_pos, vtableOffset);
    if (o === 0) return null;
    const vec = this.bb.__vector(o + this.bb_pos);
    const len = this.bb.__vector_len(o + this.bb_pos);
    return this.bb.bytes().subarray(vec, vec + len);
  }
}
