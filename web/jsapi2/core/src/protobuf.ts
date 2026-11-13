// The subset of the protobuf-es runtime a client needs to work with the generated messages. It is re-exported here so
// that a client loading this module from the server uses the same runtime as the message descriptors it was built with.
export { create, toBinary, fromBinary, clone, equals, isMessage } from '@bufbuild/protobuf';
export type { DescMessage, DescMethod, DescService, MessageShape, MessageInitShape } from '@bufbuild/protobuf';
export type { GenMessage, GenService } from '@bufbuild/protobuf/codegenv2';
