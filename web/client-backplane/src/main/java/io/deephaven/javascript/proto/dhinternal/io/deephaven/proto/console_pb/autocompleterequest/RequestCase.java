package io.deephaven.javascript.proto.dhinternal.io.deephaven.proto.console_pb.autocompleterequest;

import jsinterop.annotations.JsEnum;
import jsinterop.annotations.JsPackage;

@JsEnum(
        isNative = true,
        name = "dhinternal.io.deephaven.proto.console_pb.AutoCompleteRequest.RequestCase",
        namespace = JsPackage.GLOBAL)
public enum RequestCase {
    CHANGE_DOCUMENT, CLOSE_DOCUMENT, GET_COMPLETION_ITEMS, OPEN_DOCUMENT, REQUEST_NOT_SET;
}
