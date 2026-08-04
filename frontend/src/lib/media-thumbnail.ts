"use client";

// Generates a real, content-based grid-tile preview for the media types
// that don't already have one — a captured video frame, or an off-screen
// three.js/occt-import-js render of a 3D/STEP model — at upload-staging
// time in MediaAttachments.tsx, before the file even reaches the backend.
// Images don't need this (the original file *is* the thumbnail); .sldprt
// and `code` entries have nothing that can be rendered to a snapshot, so
// generateMediaThumbnail() returns null for those and the grid falls back
// to its existing icon+gradient placeholder — same as if generation fails
// for any other reason (corrupt file, browser can't decode it). A missing
// thumbnail is never a fatal upload error, only a plainer tile.
//
// Deliberately NOT sharing loader code with CadViewer.tsx: CadViewer's
// GLTFLoader/OBJLoader/occt-import-js calls stream a remote URL into a
// full interactive viewer with progress/error UI; this loads a local
// `File` object and only needs one rendered frame off-screen. Factoring
// out a "shared" loader across those two different call shapes would add
// indirection without removing real duplication.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import type { MediaType } from "./projects";

const STEP_EXTENSIONS = new Set(["step", "stp"]);
const THUMBNAIL_SIZE = 512;

function extensionOf(filename: string): string {
  const parts = filename.split(".");
  return parts.length > 1 ? (parts[parts.length - 1] ?? "").toLowerCase() : "";
}

export async function generateMediaThumbnail(
  mediaType: MediaType,
  file: File
): Promise<Blob | null> {
  try {
    if (mediaType === "video") return await videoThumbnail(file);
    if (mediaType === "3d_render") return await modelThumbnail(file, extensionOf(file.name));
    if (mediaType === "cad") {
      const ext = extensionOf(file.name);
      if (STEP_EXTENSIONS.has(ext)) return await modelThumbnail(file, ext);
      return null; // .sldprt — nothing can render a preview for it
    }
    return null; // image (has its own preview), code (no file at all)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`Thumbnail generation failed for ${file.name}:`, err);
    return null;
  }
}

// --- Video: capture a frame partway into the clip as a JPEG ---

function videoThumbnail(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    let settled = false;
    const finish = (result: Blob | null) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve(result);
    };
    // A corrupt/unsupported video should degrade to "no thumbnail", not
    // hang the upload picker forever waiting for events that never fire.
    const timeout = setTimeout(() => finish(null), 8000);

    video.onloadedmetadata = () => {
      // A bit into the clip, not frame zero — many videos fade in from
      // black, which would otherwise be captured as the thumbnail.
      video.currentTime = Math.min(0.5, (video.duration || 1) / 2);
    };
    video.onseeked = () => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 320;
      canvas.height = video.videoHeight || 180;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        clearTimeout(timeout);
        finish(null);
        return;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          clearTimeout(timeout);
          finish(blob);
        },
        "image/jpeg",
        0.82
      );
    };
    video.onerror = () => {
      clearTimeout(timeout);
      finish(null);
    };
    video.src = url;
    video.load();
  });
}

// --- 3D render (glb/gltf/obj) + STEP: render one off-screen frame ---

async function modelThumbnail(file: File, ext: string): Promise<Blob | null> {
  const object = await loadObject(file, ext);
  if (!object) return null;
  return renderToBlob(object);
}

async function loadObject(file: File, ext: string): Promise<THREE.Object3D | null> {
  if (STEP_EXTENSIONS.has(ext)) {
    const buffer = await file.arrayBuffer();
    const { default: occtimportjs } = await import("occt-import-js");
    const occt = await occtimportjs({
      locateFile: (path) => (path.endsWith(".wasm") ? "/occt-import-js.wasm" : path),
    });
    const result = occt.ReadStepFile(new Uint8Array(buffer), null);
    if (!result.success || result.meshes.length === 0) return null;

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
      const color = mesh.color
        ? new THREE.Color(mesh.color[0], mesh.color[1], mesh.color[2])
        : new THREE.Color(0x9ca8c4);
      const material = new THREE.MeshStandardMaterial({ color, metalness: 0.15, roughness: 0.55 });
      const threeMesh = new THREE.Mesh(geometry, material);
      threeMesh.name = mesh.name || `Part ${i + 1}`;
      group.add(threeMesh);
    });
    return group;
  }

  const url = URL.createObjectURL(file);
  try {
    if (ext === "obj") return await new OBJLoader().loadAsync(url);
    const gltf = await new GLTFLoader().loadAsync(url);
    return gltf.scene;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function renderToBlob(object: THREE.Object3D): Promise<Blob | null> {
  return new Promise((resolve) => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 1000);
    camera.position.set(2.4, 1.8, 2.4);
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x30363f, 1.3));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.8);
    dirLight.position.set(3, 5, 2);
    scene.add(dirLight);
    const fillLight = new THREE.DirectionalLight(0x818cf8, 0.5);
    fillLight.position.set(-3, -1, -2);
    scene.add(fillLight);

    // Same center-then-scale approach as CadViewer.tsx's handleLoadedObject.
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale = 1.6 / maxDim;
    object.position.sub(center);
    object.scale.setScalar(scale);
    scene.add(object);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      // Without this, some browsers clear the drawing buffer immediately
      // after the render call, before toBlob() gets a chance to read it
      // back — this is a single off-screen frame, not an animation loop,
      // so there's no ongoing-render cost to worry about.
      preserveDrawingBuffer: true,
    });
    renderer.setSize(THUMBNAIL_SIZE, THUMBNAIL_SIZE);
    renderer.setPixelRatio(1);
    renderer.render(scene, camera);

    renderer.domElement.toBlob(
      (blob) => {
        renderer.dispose();
        resolve(blob);
      },
      "image/jpeg",
      0.85
    );
  });
}
