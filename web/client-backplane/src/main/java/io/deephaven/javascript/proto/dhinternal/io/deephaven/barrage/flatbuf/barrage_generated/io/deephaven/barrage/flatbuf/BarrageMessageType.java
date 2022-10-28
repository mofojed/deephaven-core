package io.deephaven.javascript.proto.dhinternal.io.deephaven.barrage.flatbuf.barrage_generated.io.deephaven.barrage.flatbuf;

import jsinterop.annotations.JsEnum;
import jsinterop.annotations.JsPackage;

@JsEnum(
        isNative = true,
        name = "dhinternal.io.deephaven.barrage.flatbuf.Barrage_generated.io.deephaven.barrage.flatbuf.BarrageMessageType",
        namespace = JsPackage.GLOBAL)
public enum BarrageMessageType {
    BarragePublicationRequest, BarrageSerializationOptions, BarrageSnapshotRequest, BarrageSubscriptionRequest, BarrageUpdateMetadata, NewSessionRequest, None, RefreshSessionRequest, SessionInfoResponse;
}
