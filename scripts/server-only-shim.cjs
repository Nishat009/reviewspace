/**
 * Lets CLI scripts (seed, maintenance) import server modules. `server-only`
 * exists to stop server code from reaching a client bundle; a Node script is
 * not a client bundle, so here it resolves to an empty module.
 */
const Module = require("node:module");
const original = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === "server-only") return require.resolve("./empty-module.cjs");
  return original.call(this, request, ...rest);
};
