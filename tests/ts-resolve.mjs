// Lets node:test import app modules that use extensionless relative TypeScript imports ("./product-agent-rules").
// "server-only" resolves to its empty build (as on the server), so server modules such as lib/instagram/graph.ts load.
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") return nextResolve(specifier, { ...context, conditions: [...context.conditions, "react-server"] });
  try { return await nextResolve(specifier, context); }
  catch (error) {
    if (error?.code === "ERR_MODULE_NOT_FOUND" && /^\.{1,2}\//.test(specifier) && !/\.[cm]?[jt]s$/.test(specifier)) return nextResolve(`${specifier}.ts`, context);
    throw error;
  }
}
