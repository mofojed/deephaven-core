package io.deephaven.javascript.proto.dhinternal.io.deephaven.proto.storage_pb;

import jsinterop.annotations.JsOverlay;
import jsinterop.annotations.JsPackage;
import jsinterop.annotations.JsProperty;
import jsinterop.annotations.JsType;
import jsinterop.base.Js;
import jsinterop.base.JsPropertyMap;

@JsType(
        isNative = true,
        name = "dhinternal.io.deephaven.proto.storage_pb.ItemTypeMap",
        namespace = JsPackage.GLOBAL)
public interface ItemTypeMap {
    @JsOverlay
    static ItemTypeMap create() {
        return Js.uncheckedCast(JsPropertyMap.of());
    }

    @JsProperty(name = "DIRECTORY")
    double getDIRECTORY();

    @JsProperty(name = "FILE")
    double getFILE();

    @JsProperty(name = "UNKNOWN")
    double getUNKNOWN();

    @JsProperty(name = "DIRECTORY")
    void setDIRECTORY(double DIRECTORY);

    @JsProperty(name = "FILE")
    void setFILE(double FILE);

    @JsProperty(name = "UNKNOWN")
    void setUNKNOWN(double UNKNOWN);
}
