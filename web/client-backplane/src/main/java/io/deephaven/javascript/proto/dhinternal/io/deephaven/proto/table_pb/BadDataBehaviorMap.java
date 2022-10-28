package io.deephaven.javascript.proto.dhinternal.io.deephaven.proto.table_pb;

import jsinterop.annotations.JsOverlay;
import jsinterop.annotations.JsPackage;
import jsinterop.annotations.JsProperty;
import jsinterop.annotations.JsType;
import jsinterop.base.Js;
import jsinterop.base.JsPropertyMap;

@JsType(
        isNative = true,
        name = "dhinternal.io.deephaven.proto.table_pb.BadDataBehaviorMap",
        namespace = JsPackage.GLOBAL)
public interface BadDataBehaviorMap {
    @JsOverlay
    static BadDataBehaviorMap create() {
        return Js.uncheckedCast(JsPropertyMap.of());
    }

    @JsProperty(name = "POISON")
    double getPOISON();

    @JsProperty(name = "RESET")
    double getRESET();

    @JsProperty(name = "SKIP")
    double getSKIP();

    @JsProperty(name = "THROW")
    double getTHROW();

    @JsProperty(name = "POISON")
    void setPOISON(double POISON);

    @JsProperty(name = "RESET")
    void setRESET(double RESET);

    @JsProperty(name = "SKIP")
    void setSKIP(double SKIP);

    @JsProperty(name = "THROW")
    void setTHROW(double THROW);
}
