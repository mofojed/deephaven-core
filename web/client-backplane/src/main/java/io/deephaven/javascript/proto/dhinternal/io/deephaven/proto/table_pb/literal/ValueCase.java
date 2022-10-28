package io.deephaven.javascript.proto.dhinternal.io.deephaven.proto.table_pb.literal;

import jsinterop.annotations.JsEnum;
import jsinterop.annotations.JsPackage;

@JsEnum(
        isNative = true,
        name = "dhinternal.io.deephaven.proto.table_pb.Literal.ValueCase",
        namespace = JsPackage.GLOBAL)
public enum ValueCase {
    BOOL_VALUE, DOUBLE_VALUE, LONG_VALUE, NANO_TIME_VALUE, STRING_VALUE, VALUE_NOT_SET;
}
