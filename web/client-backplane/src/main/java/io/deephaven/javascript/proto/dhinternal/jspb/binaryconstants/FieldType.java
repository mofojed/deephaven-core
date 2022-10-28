package io.deephaven.javascript.proto.dhinternal.jspb.binaryconstants;

import jsinterop.annotations.JsEnum;
import jsinterop.annotations.JsPackage;

@JsEnum(
        isNative = true,
        name = "dhinternal.jspb.BinaryConstants.FieldType",
        namespace = JsPackage.GLOBAL)
public enum FieldType {
    BOOL, BYTES, DOUBLE, ENUM, FHASH64, FIXED32, FIXED64, FLOAT, GROUP, INT32, INT64, INVALID, MESSAGE, SFIXED32, SFIXED64, SINT32, SINT64, STRING, UINT32, UINT64, VHASH64;
}
