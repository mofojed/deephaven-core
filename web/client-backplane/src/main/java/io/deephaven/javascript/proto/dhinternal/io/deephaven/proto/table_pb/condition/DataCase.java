package io.deephaven.javascript.proto.dhinternal.io.deephaven.proto.table_pb.condition;

import jsinterop.annotations.JsEnum;
import jsinterop.annotations.JsPackage;

@JsEnum(
        isNative = true,
        name = "dhinternal.io.deephaven.proto.table_pb.Condition.DataCase",
        namespace = JsPackage.GLOBAL)
public enum DataCase {
    AND, COMPARE, CONTAINS, DATA_NOT_SET, IN, INVOKE, IS_NULL, MATCHES, NOT, OR, SEARCH;
}
