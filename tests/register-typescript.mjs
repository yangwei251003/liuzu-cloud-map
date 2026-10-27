import { registerHooks } from "node:module";

// Node can strip erasable TypeScript syntax natively. This hook only supplies
// the extension resolution that application bundlers normally provide for
// imports such as "./knowledge" and "./gemini.server".
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: new URL("./server-only-stub.mjs", import.meta.url).href, shortCircuit: true };
    }
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith(".") && !specifier.endsWith(".ts")) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw error;
    }
  },
});
