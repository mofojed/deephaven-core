package io.deephaven.javascript.proto.dhinternal.grpcweb.grpc;

import jsinterop.annotations.JsEnum;
import jsinterop.annotations.JsPackage;

@JsEnum(isNative = true, name = "dhinternal.grpcWeb.grpc.Code", namespace = JsPackage.GLOBAL)
public enum Code {
    Aborted, AlreadyExists, Canceled, DataLoss, DeadlineExceeded, FailedPrecondition, Internal, InvalidArgument, NotFound, OK, OutOfRange, PermissionDenied, ResourceExhausted, Unauthenticated, Unavailable, Unimplemented, Unknown;
}
