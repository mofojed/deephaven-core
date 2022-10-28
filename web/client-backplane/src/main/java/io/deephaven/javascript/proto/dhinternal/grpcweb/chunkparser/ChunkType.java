package io.deephaven.javascript.proto.dhinternal.grpcweb.chunkparser;

import jsinterop.annotations.JsEnum;
import jsinterop.annotations.JsPackage;

@JsEnum(
        isNative = true,
        name = "dhinternal.grpcWeb.ChunkParser.ChunkType",
        namespace = JsPackage.GLOBAL)
public enum ChunkType {
    MESSAGE, TRAILERS;
}
