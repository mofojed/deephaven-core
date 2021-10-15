package io.deephaven.javascript.proto.dhinternal.io.deephaven.proto.console_pb;

import elemental2.core.Uint8Array;
import io.deephaven.javascript.proto.dhinternal.io.deephaven.proto.ticket_pb.Ticket;
import jsinterop.annotations.JsOverlay;
import jsinterop.annotations.JsPackage;
import jsinterop.annotations.JsProperty;
import jsinterop.annotations.JsType;
import jsinterop.base.Js;
import jsinterop.base.JsPropertyMap;

@JsType(
        isNative = true,
        name = "dhinternal.io.deephaven.proto.console_pb.FetchDataStringRequest",
        namespace = JsPackage.GLOBAL)
public class FetchDataStringRequest {
    @JsType(isNative = true, name = "?", namespace = JsPackage.GLOBAL)
    public interface ToObjectReturnType {
        @JsType(isNative = true, name = "?", namespace = JsPackage.GLOBAL)
        public interface SourceIdFieldType {
            @JsType(isNative = true, name = "?", namespace = JsPackage.GLOBAL)
            public interface GetTicketUnionType {
                @JsOverlay
                static FetchDataStringRequest.ToObjectReturnType.SourceIdFieldType.GetTicketUnionType of(
                        Object o) {
                    return Js.cast(o);
                }

                @JsOverlay
                default String asString() {
                    return Js.asString(this);
                }

                @JsOverlay
                default Uint8Array asUint8Array() {
                    return Js.cast(this);
                }

                @JsOverlay
                default boolean isString() {
                    return (Object) this instanceof String;
                }

                @JsOverlay
                default boolean isUint8Array() {
                    return (Object) this instanceof Uint8Array;
                }
            }

            @JsOverlay
            static FetchDataStringRequest.ToObjectReturnType.SourceIdFieldType create() {
                return Js.uncheckedCast(JsPropertyMap.of());
            }

            @JsProperty
            FetchDataStringRequest.ToObjectReturnType.SourceIdFieldType.GetTicketUnionType getTicket();

            @JsProperty
            void setTicket(
                    FetchDataStringRequest.ToObjectReturnType.SourceIdFieldType.GetTicketUnionType ticket);

            @JsOverlay
            default void setTicket(String ticket) {
                setTicket(
                        Js.<FetchDataStringRequest.ToObjectReturnType.SourceIdFieldType.GetTicketUnionType>uncheckedCast(
                                ticket));
            }

            @JsOverlay
            default void setTicket(Uint8Array ticket) {
                setTicket(
                        Js.<FetchDataStringRequest.ToObjectReturnType.SourceIdFieldType.GetTicketUnionType>uncheckedCast(
                                ticket));
            }
        }

        @JsOverlay
        static FetchDataStringRequest.ToObjectReturnType create() {
            return Js.uncheckedCast(JsPropertyMap.of());
        }

        @JsProperty
        FetchDataStringRequest.ToObjectReturnType.SourceIdFieldType getSourceId();

        @JsProperty
        void setSourceId(FetchDataStringRequest.ToObjectReturnType.SourceIdFieldType sourceId);
    }

    @JsType(isNative = true, name = "?", namespace = JsPackage.GLOBAL)
    public interface ToObjectReturnType0 {
        @JsType(isNative = true, name = "?", namespace = JsPackage.GLOBAL)
        public interface SourceIdFieldType {
            @JsType(isNative = true, name = "?", namespace = JsPackage.GLOBAL)
            public interface GetTicketUnionType {
                @JsOverlay
                static FetchDataStringRequest.ToObjectReturnType0.SourceIdFieldType.GetTicketUnionType of(
                        Object o) {
                    return Js.cast(o);
                }

                @JsOverlay
                default String asString() {
                    return Js.asString(this);
                }

                @JsOverlay
                default Uint8Array asUint8Array() {
                    return Js.cast(this);
                }

                @JsOverlay
                default boolean isString() {
                    return (Object) this instanceof String;
                }

                @JsOverlay
                default boolean isUint8Array() {
                    return (Object) this instanceof Uint8Array;
                }
            }

            @JsOverlay
            static FetchDataStringRequest.ToObjectReturnType0.SourceIdFieldType create() {
                return Js.uncheckedCast(JsPropertyMap.of());
            }

            @JsProperty
            FetchDataStringRequest.ToObjectReturnType0.SourceIdFieldType.GetTicketUnionType getTicket();

            @JsProperty
            void setTicket(
                    FetchDataStringRequest.ToObjectReturnType0.SourceIdFieldType.GetTicketUnionType ticket);

            @JsOverlay
            default void setTicket(String ticket) {
                setTicket(
                        Js.<FetchDataStringRequest.ToObjectReturnType0.SourceIdFieldType.GetTicketUnionType>uncheckedCast(
                                ticket));
            }

            @JsOverlay
            default void setTicket(Uint8Array ticket) {
                setTicket(
                        Js.<FetchDataStringRequest.ToObjectReturnType0.SourceIdFieldType.GetTicketUnionType>uncheckedCast(
                                ticket));
            }
        }

        @JsOverlay
        static FetchDataStringRequest.ToObjectReturnType0 create() {
            return Js.uncheckedCast(JsPropertyMap.of());
        }

        @JsProperty
        FetchDataStringRequest.ToObjectReturnType0.SourceIdFieldType getSourceId();

        @JsProperty
        void setSourceId(FetchDataStringRequest.ToObjectReturnType0.SourceIdFieldType sourceId);
    }

    public static native FetchDataStringRequest deserializeBinary(Uint8Array bytes);

    public static native FetchDataStringRequest deserializeBinaryFromReader(
            FetchDataStringRequest message, Object reader);

    public static native void serializeBinaryToWriter(FetchDataStringRequest message, Object writer);

    public static native FetchDataStringRequest.ToObjectReturnType toObject(
            boolean includeInstance, FetchDataStringRequest msg);

    public native void clearSourceId();

    public native Ticket getSourceId();

    public native boolean hasSourceId();

    public native Uint8Array serializeBinary();

    public native void setSourceId();

    public native void setSourceId(Ticket value);

    public native FetchDataStringRequest.ToObjectReturnType0 toObject();

    public native FetchDataStringRequest.ToObjectReturnType0 toObject(boolean includeInstance);
}
