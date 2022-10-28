package io.deephaven.javascript.proto.dhinternal.flatbuffers;

import jsinterop.annotations.JsEnum;
import jsinterop.annotations.JsPackage;

@JsEnum(isNative = true, name = "dhinternal.flatbuffers.Encoding", namespace = JsPackage.GLOBAL)
public enum Encoding {
    UTF16_STRING, UTF8_BYTES;
}
