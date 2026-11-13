import type * as Core from '@deephaven/jsapi-core';

/** The protocol bindings module a server serves as `/jsapi/dh-core2.js`. */
export type CoreModule = typeof Core;

/** Where the server serves the protocol bindings, relative to its base URL. */
export const CORE_MODULE_PATH = 'jsapi/dh-core2.js';

/**
 * Loads the protocol bindings from the server. Importing them from the server, rather than bundling them, keeps the
 * client speaking the protocol of whichever server it connects to.
 */
export async function loadCoreModule(serverUrl: URL): Promise<CoreModule> {
  const url = new URL(CORE_MODULE_PATH, serverUrl).href;
  // Bundlers must leave this import alone: the module only exists on the server
  return (await import(/* @vite-ignore */ /* webpackIgnore: true */ url)) as CoreModule;
}
