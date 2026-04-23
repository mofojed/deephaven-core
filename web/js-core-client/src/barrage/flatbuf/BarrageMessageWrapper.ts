import { Builder, type Offset } from 'flatbuffers';

/**
 * Port of io.deephaven.barrage.flatbuf.BarrageMessageWrapper — write side only.
 *
 * Fields:
 *   0: magic (uint32 — see {@link BARRAGE_MAGIC})
 *   1: msgType (byte — {@link BarrageMessageType})
 *   2: msgPayload (ubyte vector — nested flatbuffer bytes)
 */
export class BarrageMessageWrapper {
  static startBarrageMessageWrapper(builder: Builder): void {
    builder.startObject(3);
  }

  static addMagic(builder: Builder, magic: number): void {
    builder.addFieldInt32(0, magic, 0);
  }

  static addMsgType(builder: Builder, msgType: number): void {
    builder.addFieldInt8(1, msgType, 0);
  }

  static addMsgPayload(builder: Builder, payloadOffset: Offset): void {
    builder.addFieldOffset(2, payloadOffset, 0);
  }

  static endBarrageMessageWrapper(builder: Builder): Offset {
    return builder.endObject();
  }
}
