import { Builder, type Offset } from 'flatbuffers';

/**
 * Port of io.deephaven.barrage.flatbuf.BarrageSubscriptionRequest — write side only.
 *
 * Field slot indices (vtable offsets match the Java source). Fields unused by
 * this package are elided from the read API but still honored in write order.
 */
export class BarrageSubscriptionRequest {
  static startBarrageSubscriptionRequest(builder: Builder): void {
    builder.startObject(6);
  }

  static addTicket(builder: Builder, ticketOffset: Offset): void {
    builder.addFieldOffset(0, ticketOffset, 0);
  }

  static addColumns(builder: Builder, columnsOffset: Offset): void {
    builder.addFieldOffset(1, columnsOffset, 0);
  }

  static addViewport(builder: Builder, viewportOffset: Offset): void {
    builder.addFieldOffset(2, viewportOffset, 0);
  }

  static addSubscriptionOptions(builder: Builder, optionsOffset: Offset): void {
    builder.addFieldOffset(3, optionsOffset, 0);
  }

  static addReverseViewport(builder: Builder, value: boolean): void {
    builder.addFieldInt8(4, value ? 1 : 0, 0);
  }

  static addSubscriptionToken(builder: Builder, tokenOffset: Offset): void {
    builder.addFieldOffset(5, tokenOffset, 0);
  }

  static endBarrageSubscriptionRequest(builder: Builder): Offset {
    return builder.endObject();
  }
}
