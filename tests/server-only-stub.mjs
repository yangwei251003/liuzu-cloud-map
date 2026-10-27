// Node integration tests do not run through the Next.js bundler that resolves
// the server-only marker. Resolving it to this empty test-only module lets the
// real server repositories run while production keeps its server boundary.
export {};
