/**
 * view.js — draws one gallery part: our exported STEP, triangulated per face and coloured by surface type,
 * with its B-rep edges. The data is parts/<id>/view.bin, written by Untessellator's ml/gallery_build.py:
 *
 *   'SGV1'  uint32 header length  JSON header (space-padded to 4 bytes)
 *   float32 positions [nv * 3]    uint32 triangle indices [nt * 3]    float32 edge segments [ns * 6]
 *
 * The header lists the faces as [kind, first vertex, vertex count, first triangle, triangle count]. Every
 * face has its own vertices, so normals are smooth within a face and sharp across its edges.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export const KIND_LABELS = {
  plane: 'Plane', cylinder: 'Cylinder', cone: 'Cone', sphere: 'Sphere', torus: 'Torus',
  bspline: 'B-spline', revolution: 'Revolution', extrusion: 'Extrusion', other: 'Other',
};
export const KIND_COLORS = {
  plane: '#b98cff', cylinder: '#2fc59a', cone: '#8a4fe0', sphere: '#ffc933', torus: '#ff5c8a',
  bspline: '#ff7a1a', revolution: '#8f8399', extrusion: '#8f8399', other: '#8f8399',
};
// Untessellator's filament colors, as the studio paints surface types; a hovered face goes white, which no type is
const HIGHLIGHT = new THREE.Color('#ffffff');

export async function loadView(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const buf = await res.arrayBuffer();
  if (new TextDecoder().decode(new Uint8Array(buf, 0, 4)) !== 'SGV1') throw new Error(`${url}: not a view file`);
  const headLen = new DataView(buf).getUint32(4, true);
  const head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, headLen)));
  let o = 8 + headLen;
  const pos = new Float32Array(buf, o, head.nv * 3); o += head.nv * 12;
  const idx = new Uint32Array(buf, o, head.nt * 3); o += head.nt * 12;
  const seg = new Float32Array(buf, o, head.ns * 6);
  return { head, pos, idx, seg };
}

/** The part as a THREE.Group centred on the origin, with `faceAt(triangle)` and `highlight(face)`. */
export function buildPart({ head, pos, idx, seg }) {
  const [x0, y0, z0, x1, y1, z1] = head.box;
  const centre = new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  const base = new Float32Array(head.nv * 3);
  head.faces.forEach(([k, v0, nv]) => {
    const c = new THREE.Color(KIND_COLORS[head.kinds[k]] ?? KIND_COLORS.other);
    for (let v = v0; v < v0 + nv; v++) base.set([c.r, c.g, c.b], v * 3);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(base.slice(), 3));
  geometry.setIndex(new THREE.BufferAttribute(idx, 1));
  geometry.computeVertexNormals();
  geometry.translate(-centre.x, -centre.y, -centre.z);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  }));
  const lines = new THREE.BufferGeometry();
  lines.setAttribute('position', new THREE.BufferAttribute(seg, 3));
  lines.translate(-centre.x, -centre.y, -centre.z);
  const edges = new THREE.LineSegments(lines, new THREE.LineBasicMaterial({ color: '#1c1027' }));
  const group = new THREE.Group();
  group.add(mesh, edges);
  group.userData = { centre, head, mesh, edges, base };

  const starts = head.faces.map((f) => f[3]);
  group.userData.faceAt = (tri) => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= tri) lo = mid; else hi = mid - 1; }
    return lo;
  };
  let lit = -1;
  group.userData.highlight = (face) => {
    if (face === lit) return;
    const color = geometry.getAttribute('color');
    if (lit >= 0) { const [, v0, nv] = head.faces[lit]; color.array.set(base.subarray(v0 * 3, (v0 + nv) * 3), v0 * 3); }
    if (face >= 0) { const [, v0, nv] = head.faces[face]; for (let v = v0; v < v0 + nv; v++) color.array.set([HIGHLIGHT.r, HIGHLIGHT.g, HIGHLIGHT.b], v * 3); }
    color.needsUpdate = true;
    lit = face;
  };
  return group;
}

function lightRig(scene, camera) {
  scene.add(new THREE.HemisphereLight('#ffffff', '#8a909c', 2.1));
  const key = new THREE.DirectionalLight('#ffffff', 1.3);
  key.position.set(0.5, 0.6, 1);
  camera.add(key);
  scene.add(camera);
}

/**
 * Points the camera at the part from an isometric-ish angle, Z up, and fits the part's box as the camera
 * sees it (not its bounding sphere, which leaves long parts small). Works for both camera kinds.
 */
export function frame(camera, group, controls, margin = 1.06) {
  const look = new THREE.Vector3(-1, 1.25, -0.85).normalize();
  const right = look.clone().cross(new THREE.Vector3(0, 0, 1)).normalize();
  const up = right.clone().cross(look);
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  const p = group.userData.mesh.geometry.getAttribute('position').array;
  for (let i = 0; i < p.length; i += 3) {
    const v = [right, up, look].map((a) => a.x * p[i] + a.y * p[i + 1] + a.z * p[i + 2]);
    for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], v[k]); hi[k] = Math.max(hi[k], v[k]); }
  }
  const target = right.clone().multiplyScalar((lo[0] + hi[0]) / 2)
    .addScaledVector(up, (lo[1] + hi[1]) / 2).addScaledVector(look, (lo[2] + hi[2]) / 2);
  let halfW = (hi[0] - lo[0]) / 2 * margin, halfH = (hi[1] - lo[1]) / 2 * margin;
  const depth = (hi[2] - lo[2]) / 2;
  const aspect = camera.isOrthographicCamera ? (camera.right - camera.left) / (camera.top - camera.bottom) || 1 : camera.aspect;
  if (halfW / halfH > aspect) halfH = halfW / aspect; else halfW = halfH * aspect;
  let dist;
  if (camera.isOrthographicCamera) {
    dist = depth * 3 + 1;
    Object.assign(camera, { left: -halfW, right: halfW, top: halfH, bottom: -halfH, zoom: 1 });
  } else {
    dist = halfH / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) + depth;
  }
  camera.up.set(0, 0, 1);         // the same roll as `up`; OrbitControls orbits about camera.up
  camera.position.copy(target).addScaledVector(look, -dist);
  camera.near = dist / 1000;
  camera.far = dist * 10 + depth * 4;
  camera.updateProjectionMatrix();
  camera.lookAt(target);
  if (controls) { controls.target.copy(target); controls.update(); }
}

/** A transparent PNG of the part, for the gallery's cards. */
export async function thumbnail(url, width, height) {
  const part = buildPart(await loadView(url));
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, 0.1, 1000);
  lightRig(scene, camera);
  scene.add(part);
  frame(camera, part, null, 1.08);
  renderer.render(scene, camera);
  const blob = await new Promise((resolve) => renderer.domElement.toBlob(resolve, 'image/png'));
  renderer.dispose();
  return blob;
}

/**
 * An interactive viewer in `canvas`: orbit, pan and zoom, hover a face to light it up (`onHover(face)` gets
 * its index or -1). Returns { part, fit, setEdges, addOverlay, removeOverlay }.
 */
export async function mountViewer(canvas, url, { onHover } = {}) {
  const part = buildPart(await loadView(url));
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 1000);
  camera.up.set(0, 0, 1);
  lightRig(scene, camera);
  scene.add(part);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  let dirty = true;
  controls.addEventListener('change', () => { dirty = true; });

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = canvas;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    dirty = true;
  };
  new ResizeObserver(resize).observe(canvas);
  resize();
  frame(camera, part, controls);

  const ray = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  canvas.addEventListener('pointermove', (e) => {
    if (e.buttons) return;
    const r = canvas.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(pointer, camera);
    const hit = part.userData.mesh.visible ? ray.intersectObject(part.userData.mesh)[0] : null;
    const face = hit ? part.userData.faceAt(hit.faceIndex) : -1;
    part.userData.highlight(face);
    onHover?.(face, e);
    dirty = true;
  });
  canvas.addEventListener('pointerleave', () => { part.userData.highlight(-1); onHover?.(-1); dirty = true; });

  const loop = () => {
    controls.update();
    if (dirty) { renderer.render(scene, camera); dirty = false; }
    requestAnimationFrame(loop);
  };
  loop();

  const overlays = new Map();
  return {
    part,
    fit: () => { frame(camera, part, controls); dirty = true; },
    setEdges: (on) => { part.userData.edges.visible = on; dirty = true; },
    setSolid: (on) => { part.userData.mesh.visible = on; dirty = true; },
    /** Adds a triangle soup (float32, in the file's coordinates) drawn as a wireframe over the part. */
    addOverlay: (name, soup) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(soup, 3));
      g.translate(-part.userData.centre.x, -part.userData.centre.y, -part.userData.centre.z);
      const wire = new THREE.LineSegments(new THREE.WireframeGeometry(g),
        new THREE.LineBasicMaterial({ color: '#2a1638', transparent: true, opacity: 0.55 }));
      g.dispose();
      scene.add(wire);
      overlays.set(name, wire);
      dirty = true;
    },
    removeOverlay: (name) => {
      const o = overlays.get(name);
      if (o) { scene.remove(o); o.geometry.dispose(); overlays.delete(name); dirty = true; }
    },
  };
}
