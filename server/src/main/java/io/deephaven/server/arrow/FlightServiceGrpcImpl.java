/**
 * Copyright (c) 2016-2022 Deephaven Data Labs and Patent Pending
 */
package io.deephaven.server.arrow;

import com.google.protobuf.ByteString;
import com.google.protobuf.ByteStringAccess;
import com.google.protobuf.InvalidProtocolBufferException;
import com.google.rpc.Code;
import io.deephaven.auth.AuthenticationException;
import io.deephaven.auth.AuthenticationRequestHandler;
import io.deephaven.auth.BasicAuthMarshaller;
import io.deephaven.extensions.barrage.BarrageStreamGenerator;
import io.deephaven.extensions.barrage.util.GrpcUtil;
import io.deephaven.internal.log.LoggerFactory;
import io.deephaven.io.logger.Logger;
import io.deephaven.proto.backplane.grpc.ExportNotification;
import io.deephaven.proto.backplane.grpc.WrappedAuthenticationRequest;
import io.deephaven.extensions.barrage.BarrageStreamGeneratorImpl;
import io.deephaven.server.session.SessionService;
import io.deephaven.server.session.SessionState;
import io.deephaven.server.session.TicketRouter;
import io.deephaven.auth.AuthContext;
import io.grpc.stub.StreamObserver;
import org.apache.arrow.flight.impl.Flight;
import org.apache.arrow.flight.impl.FlightServiceGrpc;
import org.jetbrains.annotations.Nullable;

import javax.inject.Inject;
import javax.inject.Singleton;
import java.io.InputStream;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ScheduledExecutorService;

@Singleton
public class FlightServiceGrpcImpl extends FlightServiceGrpc.FlightServiceImplBase {
    private static final Logger log = LoggerFactory.getLogger(FlightServiceGrpcImpl.class);

    private final ScheduledExecutorService executorService;
    private final BarrageStreamGenerator.Factory<BarrageStreamGeneratorImpl.View> streamGeneratorFactory;
    private final SessionService sessionService;
    private final TicketRouter ticketRouter;
    private final ArrowFlightUtil.DoExchangeMarshaller.Factory doExchangeFactory;

    private final Map<String, AuthenticationRequestHandler> authRequestHandlers;

    @Inject
    public FlightServiceGrpcImpl(
            @Nullable final ScheduledExecutorService executorService,
            final BarrageStreamGenerator.Factory<BarrageStreamGeneratorImpl.View> streamGeneratorFactory,
            final SessionService sessionService,
            final TicketRouter ticketRouter,
            final ArrowFlightUtil.DoExchangeMarshaller.Factory doExchangeFactory,
            Map<String, AuthenticationRequestHandler> authRequestHandlers) {
        this.executorService = executorService;
        this.streamGeneratorFactory = streamGeneratorFactory;
        this.sessionService = sessionService;
        this.ticketRouter = ticketRouter;
        this.doExchangeFactory = doExchangeFactory;
        this.authRequestHandlers = authRequestHandlers;
    }

    @Override
    public StreamObserver<Flight.HandshakeRequest> handshake(
            StreamObserver<Flight.HandshakeResponse> responseObserver) {
        return GrpcUtil.rpcWrapper(log, responseObserver, () -> new HandshakeObserver(responseObserver));
    }

    private final class HandshakeObserver implements StreamObserver<Flight.HandshakeRequest> {

        private boolean isComplete = false;
        private final StreamObserver<Flight.HandshakeResponse> responseObserver;

        private HandshakeObserver(StreamObserver<Flight.HandshakeResponse> responseObserver) {
            this.responseObserver = responseObserver;
        }

        @Override
        public void onNext(final Flight.HandshakeRequest value) {
            // handle the scenario where authentication headers initialized a session
            SessionState session = sessionService.getOptionalSession();
            if (session != null) {
                respondWithAuthTokenBin(session);
                return;
            }

            final AuthenticationRequestHandler.HandshakeResponseListener handshakeResponseListener =
                    (protocol, response) -> {
                        GrpcUtil.safelyComplete(responseObserver, Flight.HandshakeResponse.newBuilder()
                                .setProtocolVersion(protocol)
                                .setPayload(ByteStringAccess.wrap(response))
                                .build());
                    };

            final ByteString payload = value.getPayload();
            final long protocolVersion = value.getProtocolVersion();
            Optional<AuthContext> auth;
            try {
                auth = login(BasicAuthMarshaller.AUTH_TYPE, protocolVersion, payload, handshakeResponseListener);
                if (auth.isEmpty()) {
                    final WrappedAuthenticationRequest req = WrappedAuthenticationRequest.parseFrom(payload);
                    auth = login(req.getType(), protocolVersion, req.getPayload(), handshakeResponseListener);
                }
            } catch (final AuthenticationException | InvalidProtocolBufferException err) {
                log.error().append("Authentication failed: ").append(err).endl();
                auth = Optional.empty();
            }

            if (auth.isEmpty()) {
                responseObserver.onError(GrpcUtil.statusRuntimeException(Code.UNAUTHENTICATED,
                        "Authentication details invalid"));
                return;
            }

            session = sessionService.newSession(auth.get());
            respondWithAuthTokenBin(session);
        }

        private Optional<AuthContext> login(String type, long version, ByteString payload,
                AuthenticationRequestHandler.HandshakeResponseListener listener) throws AuthenticationException {
            AuthenticationRequestHandler handler = authRequestHandlers.get(type);
            if (handler == null) {
                log.info().append("No AuthenticationRequestHandler registered for type ").append(type).endl();
                return Optional.empty();
            }
            return handler.login(version, payload.asReadOnlyByteBuffer(), listener);
        }

        /** send the bearer token as an AuthTokenBin, as headers might have already been sent */
        private void respondWithAuthTokenBin(SessionState session) {
            isComplete = true;
            responseObserver.onNext(Flight.HandshakeResponse.newBuilder()
                    .setPayload(session.getExpiration().getTokenAsByteString())
                    .build());
            responseObserver.onCompleted();
        }

        @Override
        public void onError(final Throwable t) {
            // ignore
        }

        @Override
        public void onCompleted() {
            if (isComplete) {
                return;
            }
            responseObserver.onError(
                    GrpcUtil.statusRuntimeException(Code.UNAUTHENTICATED, "no authentication details provided"));
        }
    }

    @Override
    public void listFlights(final Flight.Criteria request, final StreamObserver<Flight.FlightInfo> responseObserver) {
        GrpcUtil.rpcWrapper(log, responseObserver, () -> {
            ticketRouter.visitFlightInfo(sessionService.getOptionalSession(), responseObserver::onNext);
            responseObserver.onCompleted();
        });
    }

    @Override
    public void getFlightInfo(final Flight.FlightDescriptor request,
            final StreamObserver<Flight.FlightInfo> responseObserver) {
        GrpcUtil.rpcWrapper(log, responseObserver, () -> {
            final SessionState session = sessionService.getOptionalSession();

            final SessionState.ExportObject<Flight.FlightInfo> export =
                    ticketRouter.flightInfoFor(session, request, "request");

            if (session != null) {
                session.nonExport()
                        .require(export)
                        .onError(responseObserver)
                        .submit(() -> {
                            responseObserver.onNext(export.get());
                            responseObserver.onCompleted();
                        });
            } else {
                if (export.tryRetainReference()) {
                    try {
                        if (export.getState() == ExportNotification.State.EXPORTED) {
                            responseObserver.onNext(export.get());
                            responseObserver.onCompleted();
                        }
                    } finally {
                        export.dropReference();
                    }
                } else {
                    responseObserver.onError(
                            GrpcUtil.statusRuntimeException(Code.FAILED_PRECONDITION, "Could not find flight info"));
                }
            }
        });
    }

    @Override
    public void getSchema(final Flight.FlightDescriptor request,
            final StreamObserver<Flight.SchemaResult> responseObserver) {
        GrpcUtil.rpcWrapper(log, responseObserver, () -> {
            final SessionState session = sessionService.getOptionalSession();

            final SessionState.ExportObject<Flight.FlightInfo> export =
                    ticketRouter.flightInfoFor(session, request, "request");

            if (session != null) {
                session.nonExport()
                        .require(export)
                        .onError(responseObserver)
                        .submit(() -> {
                            responseObserver.onNext(Flight.SchemaResult.newBuilder()
                                    .setSchema(export.get().getSchema())
                                    .build());
                            responseObserver.onCompleted();
                        });
            } else {
                if (export.tryRetainReference()) {
                    try {
                        if (export.getState() == ExportNotification.State.EXPORTED) {
                            responseObserver.onNext(Flight.SchemaResult.newBuilder()
                                    .setSchema(export.get().getSchema())
                                    .build());
                            responseObserver.onCompleted();
                        }
                    } finally {
                        export.dropReference();
                    }
                } else {
                    responseObserver.onError(
                            GrpcUtil.statusRuntimeException(Code.FAILED_PRECONDITION, "Could not find flight info"));
                }
            }
        });
    }

    public void doGetCustom(final Flight.Ticket request, final StreamObserver<InputStream> responseObserver) {
        GrpcUtil.rpcWrapper(log, responseObserver, () -> ArrowFlightUtil.DoGetCustom(
                streamGeneratorFactory, sessionService.getCurrentSession(), ticketRouter, request, responseObserver));
    }

    /**
     * Establish a new DoPut bi-directional stream.
     *
     * @param responseObserver the observer to reply to
     * @return the observer that grpc can delegate received messages to
     */
    public StreamObserver<InputStream> doPutCustom(final StreamObserver<Flight.PutResult> responseObserver) {
        return GrpcUtil.rpcWrapper(log, responseObserver, () -> new ArrowFlightUtil.DoPutObserver(
                sessionService.getCurrentSession(), ticketRouter, responseObserver));
    }

    /**
     * Establish a new DoExchange bi-directional stream.
     *
     * @param responseObserver the observer to reply to
     * @return the observer that grpc can delegate received messages to
     */
    public StreamObserver<InputStream> doExchangeCustom(final StreamObserver<InputStream> responseObserver) {
        return GrpcUtil.rpcWrapper(log, responseObserver,
                () -> doExchangeFactory.openExchange(sessionService.getCurrentSession(), responseObserver));
    }
}
