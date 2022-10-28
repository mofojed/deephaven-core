package io.deephaven.javascript.proto.dhinternal.io.deephaven.proto.table_pb.value;

import jsinterop.annotations.JsEnum;
import jsinterop.annotations.JsPackage;

@JsEnum(
        isNative = true,
        name = "dhinternal.io.deephaven.proto.table_pb.Value.DataCase",
        namespace = JsPackage.GLOBAL)
public enum DataCase {
    DATA_NOT_SET, LITERAL, REFERENCE;
}
