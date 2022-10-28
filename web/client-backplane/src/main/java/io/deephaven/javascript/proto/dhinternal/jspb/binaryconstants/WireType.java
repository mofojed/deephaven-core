package io.deephaven.javascript.proto.dhinternal.jspb.binaryconstants;

import jsinterop.annotations.JsEnum;
import jsinterop.annotations.JsPackage;

@JsEnum(
        isNative = true,
        name = "dhinternal.jspb.BinaryConstants.WireType",
        namespace = JsPackage.GLOBAL)
public enum WireType {
    DELIMITED, END_GROUP, FIXED32, FIXED64, INVALID, START_GROUP, VARINT;
}
