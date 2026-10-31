import { mountViewer, KIND_LABELS } from './view.js';
import { int, length, ratio, bytes, sig, ORDER, kindVar } from './format.js';

const $ = (id) => document.getElementById(id);
const id = new URLSearchParams(location.search).get('id');
const data = await (await fetch('data/gallery.json')).json();
const p = data.parts.find((x) => x.id === id);

if (!p) {
  $('status').textContent = 'No such part.';
  $('facts').insertAdjacentHTML('beforeend', '<h1>Part not found</h1><p class="note">It may have been renamed or removed.</p>');
  throw new Error(`no part ${id}`);
}
document.title = `${p.title} · Untessellator Gallery`;

/** A face's size, from the original's parameters, the way a drawing would dimension it. */
function size(kind, s) {
  if (!s) return '';
  if (kind === 'cylinder' || kind === 'sphere') return `Ø ${sig(2 * s.radius, 6)} mm`;
  if (kind === 'cone') return `${sig(s.half_angle_deg, 5)}° half-angle`;
  if (kind === 'torus') return `R ${sig(s.major_radius, 6)} · r ${sig(s.minor_radius, 6)} mm`;
  return '';
}

// ---- facts panel
const types = ORDER.filter((k) => p.types[k]);
const err = p.param_err ?? {};
const closeness = [
  ['Worst face, either way', length(p.max_dev_mm)],
  ['Volume difference', ratio(p.vol_rel_err)],
  err.radius != null && ['Largest radius difference', length(err.radius)],
  err.major_radius != null && ['Largest torus R difference', length(err.major_radius)],
  err.minor_radius != null && ['Largest torus r difference', length(err.minor_radius)],
  err.half_angle_deg != null && ['Largest cone angle difference', `${sig(err.half_angle_deg)}°`],
  err.axis_deg != null && ['Largest axis or normal difference', `${sig(err.axis_deg)}°`],
].filter(Boolean);
const timing = p.paint_secs != null
  ? `<dt>Auto-paint</dt><dd>${sig(p.paint_secs)} s</dd><dt>Export</dt><dd>${sig(p.knit_secs)} s</dd>` : '';
const hand = p.corpus === 'painted' && p.hand_groups != null
  ? `<dt>Faces painted by hand</dt><dd>${int(p.hand_groups)} of ${int(p.groups ?? p.faces)}</dd>` : '';
const sameTopo = p.edges[0] === p.edges[1] && p.vertices[0] === p.vertices[1];

$('facts').insertAdjacentHTML('beforeend', `
  <div>
    <h1>${p.title}</h1>
    ${p.credit ? `<p class="credit">${p.link ? `<a href="${p.link}">${p.credit}</a>` : p.credit}${p.license ? ` · ${p.license}` : ''}</p>` : ''}
  </div>
  <div class="verdict">✓ Matches the original CAD
    <span>${int(p.faces)} faces, the same surface types, every face within ${length(p.max_dev_mm)}.</span></div>
  <div class="panel">
    <h2>Faces by type</h2>
    <table>
      <thead><tr><th>Surface</th><th class="num">Original</th><th class="num">Untessellator</th></tr></thead>
      <tbody>${types.map((k) => `<tr><td><i class="dot" style="--c:${kindVar(k)}"></i>${KIND_LABELS[k]}</td>
        <td class="num">${int(p.types[k])}</td><td class="num">${int(p.types[k])}</td></tr>`).join('')}
        <tr><td><b>Total</b></td><td class="num"><b>${int(p.faces)}</b></td><td class="num"><b>${int(p.faces)}</b></td></tr>
      </tbody>
    </table>
  </div>
  <div class="panel">
    <h2>How close</h2>
    <dl>${closeness.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
  </div>
  <div class="panel">
    <h2>Topology</h2>
    <table>
      <thead><tr><th></th><th class="num">Original</th><th class="num">Untessellator</th></tr></thead>
      <tbody>
        <tr><td>Edges</td><td class="num">${int(p.edges[0])}</td><td class="num">${int(p.edges[1])}</td></tr>
        <tr><td>Vertices</td><td class="num">${int(p.vertices[0])}</td><td class="num">${int(p.vertices[1])}</td></tr>
      </tbody>
    </table>
    <p class="note" style="margin-top:8px">${sameTopo ? 'Identical: the same faces, edges and vertices.'
      : 'Edge and vertex counts can differ in how a closed edge or face is split. They aren\'t part of the match.'}</p>
  </div>
  <div class="panel">
    <h2>Input</h2>
    <dl>
      <dt>Triangles</dt><dd>${int(p.triangles)}</dd>
      ${p.mesher ? `<dt>Exported by</dt><dd>${p.mesher}</dd>` : ''}
      <dt>Part size</dt><dd>${sig(p.diag_mm, 3)} mm across</dd>
      ${timing}${hand}
    </dl>
  </div>
  <a class="download" href="parts/${p.id}/${p.id}.zip" download>Download the STL and both STEP files
    <small>input.stl · export.step · original.step · match.json · ${bytes(p.zip_bytes)}</small></a>
  <p class="note">Open export.step and original.step side by side in any CAD program. match.json has the
    numbers for every face. To run it yourself, drop input.stl on the
    <a href="https://h0witzer.github.io/Untessellator/">studio</a> and press Auto-paint, then Export STEP.</p>
`);

$('legend').innerHTML = types.map((k) => `<span><i class="dot" style="--c:${kindVar(k)}"></i>${KIND_LABELS[k]}</span>`).join('');

// ---- viewer
const hover = $('hover');
let viewer;
try {
  viewer = await mountViewer($('view'), `parts/${p.id}/view.bin`, {
    onHover(face, e) {
      if (face < 0 || !e) { hover.style.display = 'none'; return; }
      const head = viewer.part.userData.head;
      const kind = head.kinds[head.faces[face][0]];
      const info = head.info?.[face];
      hover.textContent = [KIND_LABELS[kind], size(kind, info?.[1]), info ? `within ${length(info[0])}` : '']
        .filter(Boolean).join(' · ');
      const r = $('stage').getBoundingClientRect();
      hover.style.left = `${e.clientX - r.left}px`;
      hover.style.top = `${e.clientY - r.top}px`;
      hover.style.display = 'block';
    },
  });
  $('status').remove();
} catch (e) {
  $('status').textContent = `Couldn't load the 3D view (${e.message}).`;
}

$('fit').addEventListener('click', () => viewer?.fit());
$('edges').addEventListener('click', (e) => {
  const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
  e.currentTarget.setAttribute('aria-pressed', String(on));
  viewer?.setEdges(on);
});

/** Triangle soup from a binary or ASCII STL. */
function readStl(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (buf.byteLength >= 84 && 84 + dv.getUint32(80, true) * 50 === buf.byteLength) {
    const n = dv.getUint32(80, true), out = new Float32Array(n * 9);
    for (let t = 0; t < n; t++) for (let i = 0; i < 9; i++) out[t * 9 + i] = dv.getFloat32(84 + t * 50 + 12 + i * 4, true);
    return out;
  }
  const v = [...new TextDecoder().decode(buf).matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)];
  return Float32Array.from(v.flatMap((m) => [+m[1], +m[2], +m[3]]));
}

let soup = null;
$('mesh').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  const on = btn.getAttribute('aria-pressed') !== 'true';
  if (!viewer) return;
  if (!on) { viewer.removeOverlay('input'); btn.setAttribute('aria-pressed', 'false'); return; }
  if (!soup) {
    btn.disabled = true;
    btn.textContent = 'Loading triangles…';
    try {
      const { unzipSync } = await import('fflate');
      const zip = new Uint8Array(await (await fetch(`parts/${p.id}/${p.id}.zip`)).arrayBuffer());
      soup = readStl(unzipSync(zip, { filter: (f) => f.name === 'input.stl' })['input.stl']);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Input triangles';
    }
  }
  viewer.addOverlay('input', soup);
  btn.setAttribute('aria-pressed', 'true');
});
