import type { CoreModule } from '../core.js';
import type { RangeSet } from './RangeSet.js';
import { encodeRangeSet } from './rowsetCodec.js';

/** Rows per record batch the server sends. */
const BATCH_SIZE = 100_000;
/** Largest message the server may send; larger updates are split. */
const MAX_MESSAGE_SIZE = 10_000_000;

/** A column set as Java's BitSet.toByteArray() writes it: little-endian bits, trailing zero bytes dropped. */
export function encodeColumnSet(columns: readonly number[]): Uint8Array {
  if (columns.length === 0) {
    return new Uint8Array(0);
  }
  const bytes = new Uint8Array((Math.max(...columns) >> 3) + 1);
  for (const c of columns) {
    bytes[c >> 3] |= 1 << (c & 7);
  }
  return bytes;
}

function wrap(core: CoreModule, payload: Uint8Array, type: number): Uint8Array {
  const { barrage, flatbuffers } = core;
  const builder = new flatbuffers.Builder(payload.byteLength + 64);
  const payloadOffset = barrage.BarrageMessageWrapper.createMsgPayloadVector(builder, payload);
  builder.finish(barrage.BarrageMessageWrapper.createBarrageMessageWrapper(builder, core.BARRAGE_MAGIC, type, payloadOffset));
  return builder.asUint8Array();
}

export interface SubscriptionRequestOptions {
  ticket: Uint8Array;
  columns: readonly number[];
  /** The viewport in row positions; null subscribes to every row. */
  viewport: RangeSet | null;
  updateIntervalMs: number;
  reverseViewport?: boolean;
}

/** The app_metadata of a FlightData that starts or changes a Barrage subscription. */
export function subscriptionRequest(core: CoreModule, options: SubscriptionRequestOptions): Uint8Array {
  const { barrage, flatbuffers } = core;
  const Request = barrage.BarrageSubscriptionRequest;
  const builder = new flatbuffers.Builder(1024);
  const columnsOffset = Request.createColumnsVector(builder, encodeColumnSet(options.columns));
  const viewportOffset = options.viewport != null ? Request.createViewportVector(builder, encodeRangeSet(options.viewport)) : 0;
  const optionsOffset = barrage.BarrageSubscriptionOptions.createBarrageSubscriptionOptions(
    builder,
    false,
    Math.max(0, Math.round(options.updateIntervalMs)),
    BATCH_SIZE,
    MAX_MESSAGE_SIZE,
    false,
    0n
  );
  const ticketOffset = Request.createTicketVector(builder, options.ticket);
  Request.startBarrageSubscriptionRequest(builder);
  Request.addTicket(builder, ticketOffset);
  Request.addColumns(builder, columnsOffset);
  if (viewportOffset !== 0) {
    Request.addViewport(builder, viewportOffset);
  }
  Request.addSubscriptionOptions(builder, optionsOffset);
  Request.addReverseViewport(builder, options.reverseViewport ?? false);
  builder.finish(Request.endBarrageSubscriptionRequest(builder));
  return wrap(core, builder.asUint8Array(), barrage.BarrageMessageType.BarrageSubscriptionRequest);
}

/** The app_metadata of a FlightData that asks for a one-time Barrage snapshot. */
export function snapshotRequest(
  core: CoreModule,
  options: { ticket: Uint8Array; columns: readonly number[]; viewport: RangeSet | null }
): Uint8Array {
  const { barrage, flatbuffers } = core;
  const Request = barrage.BarrageSnapshotRequest;
  const builder = new flatbuffers.Builder(1024);
  const columnsOffset = Request.createColumnsVector(builder, encodeColumnSet(options.columns));
  const viewportOffset = options.viewport != null ? Request.createViewportVector(builder, encodeRangeSet(options.viewport)) : 0;
  const optionsOffset = barrage.BarrageSnapshotOptions.createBarrageSnapshotOptions(
    builder,
    false,
    BATCH_SIZE,
    MAX_MESSAGE_SIZE,
    0n
  );
  const ticketOffset = Request.createTicketVector(builder, options.ticket);
  Request.startBarrageSnapshotRequest(builder);
  Request.addTicket(builder, ticketOffset);
  Request.addColumns(builder, columnsOffset);
  if (viewportOffset !== 0) {
    Request.addViewport(builder, viewportOffset);
  }
  Request.addSnapshotOptions(builder, optionsOffset);
  Request.addReverseViewport(builder, false);
  builder.finish(Request.endBarrageSnapshotRequest(builder));
  return wrap(core, builder.asUint8Array(), barrage.BarrageMessageType.BarrageSnapshotRequest);
}
