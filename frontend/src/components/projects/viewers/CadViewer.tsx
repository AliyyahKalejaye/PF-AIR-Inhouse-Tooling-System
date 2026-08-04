"use client";

// Full-screen 3D/CAD viewer — screen 16/17.
//
// Two families of files render in-browser here:
//  - "3d_render" media (.glb/.gltf/.obj, per MediaAttachments' upload
//    tile) — three.js's GLTFLoader transparently handles both binary
//    .glb and JSON .gltf, and OBJLoader covers .obj.
//  - "cad" media that's .step/.stp — parsed via occt-import-js, a WASM
//    build of the real OpenCascade geometry kernel (see
//    frontend/scripts/copy-occt-wasm.js for how its .wasm binary gets
//    into public/, and src/types/occt-import-js.d.ts for the ambient
//    types — the package ships none of its own). STEP is an open,
//    published format, so this is a real parse of the actual geometry,
//    not a fabricated preview — important in an aerospace/defense
//    context.
//
// "cad" media that's .sldprt is the one thing that still can't render
// here: SolidWorks' native format is proprietary and undocumented, and
// no open-source parser exists for it at any effort level — the only
// ways to read one are SolidWorks itself or a paid conversion service,
// neither of which this app has. The "!renderable" branch below shows an
// honest "preview unavailable, download to open in CAD software" state
// for those rather than faking geometry. If your CAD tool can export
// STEP (SolidWorks: File > Save As > .STEP), attaching that alongside
// the .SLDPRT gets you an in-browser preview.
//
// The model tree in the sidebar is built from the real scene graph's
// named meshes (whatever the file itself calls them), not fabricated
// part names.
//
// Debugging note: if every .glb/.obj file fails with "Couldn't load this
// 3D model" (the loadError branch below) while images and video work
// fine on the same project, check the R2 bucket's CORS policy before
// suspecting this component. <img>/<video> render cross-origin bytes
// without needing CORS; GLTFLoader/OBJLoader fetch the file via
// fetch()/XHR, which the browser silently blocks cross-origin without
// an R2 CORS policy allowing it. See SETUP_GUIDE.md's R2 section
// ("3c", step 7) for the exact policy to add.

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
// three.js doesn't ship its own .d.ts files in a way "moduleResolution:
// bundler" picks up (confirmed by CI: TS7016 "could not find a
// declaration file for module 'three'"), so this project depends on
// DefinitelyTyped's @types/three package instead. That package only
// declares the addon modules under the older "three/examples/jsm/..."
// path, not the newer "three/addons/..." alias — same underlying file
// either way, but only this import path resolves to actual types.
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ProjectMediaRead } from "@/lib/projects";
import { DarkViewerTopBar, DOT_SEP } from "./DarkViewerTopBar";

interface Props {
  media: ProjectMediaRead;
  onClose: () => void;
}

type MaterialMode = "wireframe" | "shaded" | "xray";

// STEP is an open format occt-import-js can actually parse; .sldprt is
// SolidWorks' proprietary native format and stays download-only (see the
// top-of-file comment).
const STEP_EXTENSIONS = new Set(["step", "stp"]);

function fileExtension(media: ProjectMediaRead): string {
  const source = media.filename ?? media.file_url;
  const clean = source.split("?")[0]?.split("#")[0] ?? source;
  const parts = clean.split(".");
  return parts.length > 1 ? (parts[parts.length - 1] ?? "").toLowerCase() : "";
}

function applyMaterialMode(materials: THREE.Material[], mode: MaterialMode) {
  materials.forEach((mat) => {
    const m = mat as THREE.Material & { wireframe?: boolean };
    if (typeof m.wireframe === "boolean") m.wireframe = mode === "wireframe";
    if (mode === "xray") {
      m.transparent = true;
      m.opacity = 0.35;
      m.depthWrite = false;
    } else {
      m.transparent = false;
      m.opacity = 1;
      m.depthWrite = true;
    }
    m.needsUpdate = true;
  });
}

function collectMeshInfo(root: THREE.Object3D): { materials: THREE.Material[]; meshNames: string[] } {
  const materials: THREE.Material[] = [];
  const meshNames: string[] = [];
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      if (Array.isArray(child.material)) materials.push(...child.material);
      else materials.push(child.material);
      if (child.name) meshNames.push(child.name);
    }
  });
  return { materials, meshNames };
}

export function CadViewer({ media, onClose }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const interactionRef = useRef<{
    materials: THREE.Material[];
    resetView: () => void;
  } | null>(null);

  const [mode, setMode] = useState<MaterialMode>("shaded");
  const [meshNames, setMeshNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const ext = useMemo(() => fileExtension(media), [media]);
  const renderable =
    media.media_type === "3d_render" || (media.media_type === "cad" && STEP_EXTENSIONS.has(ext));

  // The load effect below intentionally doesn't depend on `mode` (that
  // would tear down and rebuild the whole scene just to change a
  // material flag) — so its onLoad callback closes over whatever `mode`
  // was at effect-setup time. Reading through a ref instead means a mode
  // change made while a model is still loading is picked up correctly
  // once it finishes, rather than silently reverting to a stale value.
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!renderable) return;
    const container = mountRef.current;
    if (!container) return;

    let disposed = false;
    let animationFrame = 0;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, Math.max(container.clientWidth, 1) / Math.max(container.clientHeight, 1), 0.01, 1000);
    camera.position.set(2.4, 1.8, 2.4);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0, 0);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x30363f, 1.3));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.8);
    dirLight.position.set(3, 5, 2);
    scene.add(dirLight);
    const fillLight = new THREE.DirectionalLight(0x818cf8, 0.5);
    fillLight.position.set(-3, -1, -2);
    scene.add(fillLight);

    const resetView = () => {
      camera.position.set(2.4, 1.8, 2.4);
      controls.target.set(0, 0, 0);
      controls.update();
    };
    interactionRef.current = { materials: [], resetView };

    const handleLoadedObject = (object: THREE.Object3D) => {
      if (disposed) return;
      const box = new THREE.Box3().setFromObject(object);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const scale = 1.6 / maxDim;
      // Center first (in the model's original units), then scale — scale
      // is applied in the object's local space and doesn't affect where
      // its position sits relative to the scene origin, so doing this in
      // the other order would leave the model off-center.
      object.position.sub(center);
      object.scale.setScalar(scale);
      scene.add(object);

      const { materials, meshNames: names } = collectMeshInfo(object);
      applyMaterialMode(materials, modeRef.current);
      if (interactionRef.current) interactionRef.current.materials = materials;
      setMeshNames(names);
      setLoading(false);
    };

    // occt-import-js has no progress-callback equivalent to the three.js
    // loaders' onProgress, and its own fetch of the STEP file happens
    // outside three.js entirely — so this branch fetches the file itself
    // (same media.file_url, same R2 CORS requirement as the GLB/OBJ
    // branches below) and hands the raw geometry arrays to three.js by
    // hand rather than going through a Loader subclass.
    async function loadStepModel() {
      try {
        const [{ default: occtimportjs }, response] = await Promise.all([
          import("occt-import-js"),
          fetch(media.file_url),
        ]);
        if (disposed) return;
        if (!response.ok) throw new Error(`HTTP ${response.status} fetching STEP file`);
        const buffer = await response.arrayBuffer();
        if (disposed) return;

        const occt = await occtimportjs({
          // The wasm binary is a plain static file at the site root (see
          // frontend/scripts/copy-occt-wasm.js) — not something webpack
          // bundles, since occt-import-js's own glue code fetches it by
          // URL at runtime rather than via an import statement.
          locateFile: (path) => (path.endsWith(".wasm") ? "/occt-import-js.wasm" : path),
        });
        if (disposed) return;

        const result = occt.ReadStepFile(new Uint8Array(buffer), null);
        if (disposed) return;
        if (!result.success || result.meshes.length === 0) {
          throw new Error("occt-import-js returned no geometry for this file");
        }

        const group = new THREE.Group();
        result.meshes.forEach((mesh, i) => {
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute(
            "position",
            new THREE.Float32BufferAttribute(mesh.attributes.position.array, 3)
          );
          if (mesh.attributes.normal) {
            geometry.setAttribute(
              "normal",
              new THREE.Float32BufferAttribute(mesh.attributes.normal.array, 3)
            );
          } else {
            geometry.computeVertexNormals();
          }
          geometry.setIndex(mesh.index.array);

          // STEP files often carry no color at all — fall back to a
          // neutral engineering-gray rather than three.js's default
          // stark white, which looks like a loading/error state.
          const color = mesh.color
            ? new THREE.Color(mesh.color[0], mesh.color[1], mesh.color[2])
            : new THREE.Color(0x9ca8c4);
          const material = new THREE.MeshStandardMaterial({ color, metalness: 0.15, roughness: 0.55 });

          const threeMesh = new THREE.Mesh(geometry, material);
          threeMesh.name = mesh.name || `Part ${i + 1}`;
          group.add(threeMesh);
        });

        handleLoadedObject(group);
      } catch (err) {
        if (!disposed) {
          // eslint-disable-next-line no-console
          console.error("STEP load failed:", err);
          setLoadError("Couldn't load this CAD model.");
          setLoading(false);
        }
      }
    }

    if (STEP_EXTENSIONS.has(ext)) {
      loadStepModel();
    } else if (ext === "obj") {
      new OBJLoader().load(
        media.file_url,
        (object) => handleLoadedObject(object),
        undefined,
        () => {
          if (!disposed) {
            setLoadError("Couldn't load this 3D model.");
            setLoading(false);
          }
        }
      );
    } else {
      new GLTFLoader().load(
        media.file_url,
        (gltf) => handleLoadedObject(gltf.scene),
        undefined,
        () => {
          if (!disposed) {
            setLoadError("Couldn't load this 3D model.");
            setLoading(false);
          }
        }
      );
    }

    function animate() {
      animationFrame = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    function handleResize() {
      if (!container) return;
      const width = Math.max(container.clientWidth, 1);
      const height = Math.max(container.clientHeight, 1);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    }
    window.addEventListener("resize", handleResize);

    return () => {
      disposed = true;
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animationFrame);
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      interactionRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media.file_url, renderable, ext]);

  useEffect(() => {
    if (interactionRef.current) applyMaterialMode(interactionRef.current.materials, mode);
  }, [mode]);

  const topBar = (
    <DarkViewerTopBar
      icon={
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
          <path d="M3.27 6.96L12 12.01l8.73-5.05" />
          <path d="M12 22.08V12" />
        </svg>
      }
      iconBg="linear-gradient(135deg,#4f46e5,#7c3aed)"
      title={media.filename ?? (renderable ? "3D Render" : "CAD File")}
      subtitle={
        <>
          <span className="font-mono uppercase">{ext || (renderable ? "3D Render" : "CAD")}</span>
          {DOT_SEP}
          <span>Uploaded {new Date(media.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
        </>
      }
      onClose={onClose}
      downloadUrl={media.file_url}
      downloadName={media.filename}
    />
  );

  if (!renderable) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-[#020617] text-white">
        {topBar}
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/[.06] text-indigo-200">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M4 7l8-4 8 4M4 7v10l8 4M4 7l8 4M20 7v10l-8 4M20 7l-8 4m0 0v10" />
            </svg>
          </div>
          <div>
            <p className="mb-1.5 text-[14px] font-bold text-white">Preview isn&apos;t available for this file type</p>
            <p className="mx-auto max-w-sm text-[13px] leading-relaxed text-slate-400">
              {ext ? `.${ext}`.toUpperCase() : "These"} files need CAD software to open — download it and view it there.
            </p>
          </div>
          <a href={media.file_url} download={media.filename ?? undefined} className="btn-primary">
            Download {media.filename ?? "file"}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#020617] text-white">
      {topBar}

      <div className="relative min-h-0 flex-1">
        <div ref={mountRef} className="absolute inset-0" />

        {loading && !loadError && (
          <div className="absolute inset-0 flex items-center justify-center text-[13.5px] text-slate-400">Loading model…</div>
        )}
        {loadError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
            <p className="text-[13.5px] text-slate-400">{loadError}</p>
            <a href={media.file_url} download={media.filename ?? undefined} className="btn-primary">
              Download instead
            </a>
          </div>
        )}

        {!loading && !loadError && (
          <>
            {/* The floating Model Tree panel eats most of a phone's width
                at a fixed 240px, leaving almost nothing for the actual
                model underneath — it's a nice-to-have inspector, not
                essential to viewing the model, so it just hides below
                `sm` rather than trying to squeeze in. */}
            <div className="absolute left-4 top-4 bottom-24 z-10 hidden w-[240px] overflow-hidden overflow-y-auto rounded-xl border border-white/10 bg-slate-900/65 backdrop-blur sm:block">
              <div className="border-b border-white/10 px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                Model Tree
              </div>
              <div className="p-2">
                {meshNames.length === 0 ? (
                  <div className="px-2.5 py-2 text-[12px] text-slate-500">No named parts in this file.</div>
                ) : (
                  meshNames.map((name, i) => (
                    <div key={`${name}-${i}`} className="truncate rounded-lg px-2.5 py-2 font-mono text-[12.5px] text-slate-300">
                      {name}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="absolute bottom-4 left-4 right-4 z-10 flex items-center justify-end gap-3 rounded-xl border border-white/10 bg-slate-900/65 px-4 py-2.5 backdrop-blur sm:justify-between">
              <p className="hidden text-[11.5px] text-slate-400 sm:block">Drag to rotate &middot; scroll to zoom &middot; right-drag to pan</p>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-0.5 rounded-lg bg-white/[.08] p-1">
                  {(["wireframe", "shaded", "xray"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMode(m)}
                      className={`rounded-md px-3 py-1.5 text-[12px] font-semibold capitalize ${
                        mode === m ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {m === "xray" ? "X-ray" : m}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => interactionRef.current?.resetView()}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[.08] text-slate-200 hover:bg-white/[.14]"
                  title="Reset view"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                  </svg>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
