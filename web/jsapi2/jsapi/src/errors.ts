/** gRPC status codes, see https://grpc.github.io/grpc/core/md_doc_statuscodes.html */
export const GrpcCode = {
  OK: 0,
  CANCELLED: 1,
  UNKNOWN: 2,
  INVALID_ARGUMENT: 3,
  DEADLINE_EXCEEDED: 4,
  NOT_FOUND: 5,
  ALREADY_EXISTS: 6,
  PERMISSION_DENIED: 7,
  RESOURCE_EXHAUSTED: 8,
  FAILED_PRECONDITION: 9,
  ABORTED: 10,
  OUT_OF_RANGE: 11,
  UNIMPLEMENTED: 12,
  INTERNAL: 13,
  UNAVAILABLE: 14,
  DATA_LOSS: 15,
  UNAUTHENTICATED: 16,
} as const;

export type GrpcCode = (typeof GrpcCode)[keyof typeof GrpcCode];

const codeNames = Object.fromEntries(Object.entries(GrpcCode).map(([name, code]) => [code, name])) as Record<
  number,
  string
>;

/** A failed gRPC call, with the status the server (or the transport) reported. */
export class GrpcError extends Error {
  readonly code: number;
  readonly details: string;
  readonly metadata: Readonly<Record<string, string>>;

  constructor(code: number, details: string, metadata: Record<string, string> = {}) {
    super(`${codeNames[code] ?? `code ${code}`}: ${details}`);
    this.name = 'GrpcError';
    this.code = code;
    this.details = details;
    this.metadata = metadata;
  }
}

/** Thrown or rejected with when work is abandoned because the caller canceled it. */
export class CancelError extends Error {
  constructor(message = 'Operation canceled') {
    super(message);
    this.name = 'CancelError';
  }
}
