// occt-import-js is an emscripten-compiled WASM module (the OpenCascade
// CAD kernel, used by CadViewer.tsx to render .step/.stp files in-browser
// — see that file's top comment). Its JS glue code fetches its .wasm
// binary at runtime via a plain URL string, not via an import/require that
// webpack can see — so Next's bundler never touches that fetch and won't
// automatically ship the .wasm file. It has to exist as a real static
// asset the browser can request directly.
//
// This copies it into public/ on every `npm install` (including
// Cloudflare Pages' build step, which always runs install before build)
// so it's always in sync with whatever occt-import-js version is in
// node_modules, without committing a binary blob to git.
//
// If you bump the occt-import-js version in package.json, nothing else
// needs to change here — this always copies from node_modules, not a
// pinned path.

const fs = require("fs");
const path = require("path");

const src = path.join(
  __dirname,
  "..",
  "node_modules",
  "occt-import-js",
  "dist",
  "occt-import-js.wasm"
);
const destDir = path.join(__dirname, "..", "public");
const dest = path.join(destDir, "occt-import-js.wasm");

if (!fs.existsSync(src)) {
  // Don't fail the install over this — a missing wasm file should degrade
  // to "STEP preview doesn't load" (caught by CadViewer's loadError state,
  // same UX as any other failed model load), not break every other build
  // step. But it's surprising enough to be worth a loud warning.
  console.warn(
    "[copy-occt-wasm] occt-import-js.wasm not found in node_modules " +
      `(looked at ${src}) — skipping copy. The in-browser STEP/STP viewer ` +
      "will fail to load until this runs successfully."
  );
  process.exit(0);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log("[copy-occt-wasm] Copied occt-import-js.wasm to public/occt-import-js.wasm");
