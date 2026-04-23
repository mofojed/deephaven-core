import { Builder, type Offset } from 'flatbuffers';

/**
 * Port of io.deephaven.barrage.flatbuf.BarrageSubscriptionOptions — write side only.
 * We don't read this; the server does.
 */
export class BarrageSubscriptionOptions {
  static startBarrageSubscriptionOptions(builder: Builder): void {
    builder.startObject(7);
  }

  static addUseDeephavenNulls(builder: Builder, value: boolean): void {
    builder.addFieldInt8(1, value ? 1 : 0, 0);
  }

  static addMinUpdateIntervalMs(builder: Builder, value: number): void {
    builder.addFieldInt32(2, value, 0);
  }

  static addBatchSize(builder: Builder, value: number): void {
    builder.addFieldInt32(3, value, 0);
  }

  static addMaxMessageSize(builder: Builder, value: number): void {
    builder.addFieldInt32(4, value, 0);
  }

  static addColumnsAsList(builder: Builder, value: boolean): void {
    builder.addFieldInt8(5, value ? 1 : 0, 0);
  }

  static addPreviewListLengthLimit(builder: Builder, value: bigint): void {
    builder.addFieldInt64(6, value, 0n);
  }

  static endBarrageSubscriptionOptions(builder: Builder): Offset {
    return builder.endObject();
  }
}
