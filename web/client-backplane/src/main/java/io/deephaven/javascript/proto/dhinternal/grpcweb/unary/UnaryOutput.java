package io.deephaven.javascript.proto.dhinternal.grpcweb.unary;

import io.deephaven.javascript.proto.dhinternal.browserheaders.BrowserHeaders;
import io.deephaven.javascript.proto.dhinternal.grpcweb.grpc.Code;
import jsinterop.annotations.JsOverlay;
import jsinterop.annotations.JsPackage;
import jsinterop.annotations.JsProperty;
import jsinterop.annotations.JsType;
import jsinterop.base.Js;
import jsinterop.base.JsPropertyMap;

@JsType(
        isNative = true,
        name = "dhinternal.grpcWeb.unary.UnaryOutput",
        namespace = JsPackage.GLOBAL)
public interface UnaryOutput<TResponse> {
    @JsOverlay
    static UnaryOutput create() {
        return Js.uncheckedCast(JsPropertyMap.of());
    }

    @JsProperty
    BrowserHeaders getHeaders();

    @JsProperty
    TResponse getMessage();

    @JsProperty
    Code getStatus();

    @JsProperty
    String getStatusMessage();

    @JsProperty
    BrowserHeaders getTrailers();

    @JsProperty
    void setHeaders(BrowserHeaders headers);

    @JsProperty
    void setMessage(TResponse message);

    @JsProperty
    void setStatus(Code status);

    @JsProperty
    void setStatusMessage(String statusMessage);

    @JsProperty
    void setTrailers(BrowserHeaders trailers);
}
