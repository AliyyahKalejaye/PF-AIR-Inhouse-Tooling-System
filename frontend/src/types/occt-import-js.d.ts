// occt-import-js ships no TypeScript types of its own (and there's no
// @types/occt-import-js package either) — this is a minimal ambient
// declaration covering only the surface CadViewer.tsx actually uses
// (ReadStepFile + the locateFile init option), not the library's full API.
declare module "occt-import-js" {
  interface OcctMeshAttribute {
    array: number[];
  }

  interface OcctMesh {
    name: string;
    // [r, g, b], each 0-1 — absent when the STEP file carries no color.
    color?: [number, number, number];
    attributes: {
      position: OcctMeshAttribute;
      normal?: OcctMeshAttribute;
    };
    index: OcctMeshAttribute;
  }

  interface OcctReadResult {
    success: boolean;
    meshes: OcctMesh[];
  }

  interface OcctModule {
    ReadStepFile(buffer: Uint8Array, params: unknown): OcctReadResult;
  }

  interface OcctInitOptions {
    locateFile?: (path: string, prefix: string) => string;
  }

  export default function occtimportjs(options?: OcctInitOptions): Promise<OcctModule>;
}
