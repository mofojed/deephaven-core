package io.deephaven.javascript.proto.dhinternal.io.deephaven.proto.console_pb;

import elemental2.core.Uint8Array;
import jsinterop.annotations.JsOverlay;
import jsinterop.annotations.JsPackage;
import jsinterop.annotations.JsProperty;
import jsinterop.annotations.JsType;
import jsinterop.base.Js;
import jsinterop.base.JsPropertyMap;

@JsType(
        isNative = true,
        name = "dhinternal.io.deephaven.proto.console_pb.FetchDataStringResponse",
        namespace = JsPackage.GLOBAL)
public class FetchDataStringResponse {
    @JsType(isNative = true, name = "?", namespace = JsPackage.GLOBAL)
    public interface ToObjectReturnType {
        @JsOverlay
        static FetchDataStringResponse.ToObjectReturnType create() {
            return Js.uncheckedCast(JsPropertyMap.of());
        }

        @JsProperty
        String getValue();

        @JsProperty
        void setValue(String value);
    }

    @JsType(isNative = true, name = "?", namespace = JsPackage.GLOBAL)
    public interface ToObjectReturnType0 {
        @JsOverlay
        static FetchDataStringResponse.ToObjectReturnType0 create() {
            return Js.uncheckedCast(JsPropertyMap.of());
        }

        @JsProperty
        String getValue();

        @JsProperty
        void setValue(String value);
    }

    public static native FetchDataStringResponse deserializeBinary(Uint8Array bytes);

    public static native FetchDataStringResponse deserializeBinaryFromReader(
            FetchDataStringResponse message, Object reader);

    public static native void serializeBinaryToWriter(FetchDataStringResponse message, Object writer);

    public static native FetchDataStringResponse.ToObjectReturnType toObject(
            boolean includeInstance, FetchDataStringResponse msg);

    public native String getValue();

    public native Uint8Array serializeBinary();

    public native void setValue(String value);

    public native FetchDataStringResponse.ToObjectReturnType0 toObject();

    public native FetchDataStringResponse.ToObjectReturnType0 toObject(boolean includeInstance);
}
