import { int, length, ORDER, kindVar } from './format.js';

const NOTES = {
  oneshot: (c) => `Each of these went through the studio's own code with its default settings: open the STL,
    press Auto-paint, then Export STEP. Nobody painted anything. When an export isn't every face analytic, the
    studio offers Repair; the parts that needed it are marked. The ${int(c.tried + (c.pending ?? 0))} candidates
    are Onshape's own mesh exports of ABC parts that no Untessellator model was trained or tuned on.${c.pending
    ? ` ${int(c.tried)} have run so far, and the rest are still running.` : ''}`,
  painted: () => `Parts where Auto-paint came close, and a person repainted the faces it missed with the
    studio's fill brush. They're held to the same bar as the one-shot parts.`,
};
const MISS_LABELS = {
  'face types differ': 'A face was split, merged or given the wrong surface type',
  'not the same solids': "The export didn't close into valid solids",
  'a face is more than the tolerance off': 'Every face was right, but one is more than 1 µm off',
  'volume differs': 'Faces matched, but the volume is off',
  'faces do not pair one-to-one': "Faces don't pair one to one",
  'no export': "The export didn't finish",
};
const LABEL = { plane: 'Plane', cylinder: 'Cylinder', cone: 'Cone', sphere: 'Sphere', torus: 'Torus', bspline: 'B-spline' };

const $ = (id) => document.getElementById(id);
const data = await (await fetch('data/gallery.json')).json();
let corpus = location.hash === '#painted' ? 'painted' : 'oneshot';
const active = new Set();

const curved = (p) => p.faces - (p.types.plane ?? 0);
const SORTS = {
  faces: (a, b) => b.faces - a.faces,
  curved: (a, b) => curved(b) - curved(a) || b.faces - a.faces,
  dev: (a, b) => a.max_dev_mm - b.max_dev_mm,
  tris: (a, b) => b.triangles - a.triangles,
};

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
}

function stats() {
  const c = data.corpora[corpus];
  const parts = data.parts.filter((p) => p.corpus === corpus);
  const cells = corpus === 'oneshot'
    ? [[`${int(c.matched)} of ${int(c.tried)}`, `held-out parts matched with no painting${c.pending ? ' (run so far)' : ''}${
        c.repaired ? `, ${int(c.matched - c.repaired)} straight from Export` : ''}`],
       [int(parts.reduce((s, p) => s + p.faces, 0)), 'faces recovered, every one'],
       [length(median(parts.map((p) => p.max_dev_mm))), 'median distance, worst face of each part'],
       [int(Math.max(0, ...parts.map((p) => p.faces))), 'faces in the largest match']]
    : [[int(parts.length), 'parts matched after painting by hand'],
       [int(parts.reduce((s, p) => s + p.faces, 0)), 'faces recovered, every one'],
       [length(median(parts.map((p) => p.max_dev_mm))), 'median distance, worst face of each part'],
       [int(parts.reduce((s, p) => s + (p.hand_groups ?? 0), 0)), 'faces painted by hand']];
  $('stats').innerHTML = cells.map(([v, l]) => `<div class="stat"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('');
}

function chips(types) {
  return ORDER.filter((k) => types[k]).map((k) =>
    `<span title="${types[k]} ${LABEL[k] ?? k}"><i class="dot" style="--c:${kindVar(k)}"></i>${types[k]}</span>`).join('');
}

function card(p) {
  const hand = p.corpus === 'painted' && p.hand_groups != null
    ? `<div class="card-title">${int(p.hand_groups)} of ${int(p.faces)} faces painted by hand</div>`
    : p.repaired ? '<div class="card-title">after the Repair button</div>' : '';
  return `<a class="card" href="part.html?id=${encodeURIComponent(p.id)}">
    <div class="thumb"><img src="parts/${p.id}/thumb.png" loading="lazy" alt="${p.title}, ${p.faces} faces"></div>
    <div class="card-body">
      <div class="card-title">${p.title}</div>
      <div class="faces"><b>${int(p.faces)}</b> faces <span class="from">from ${int(p.triangles)} triangles</span></div>
      <div class="chips">${chips(p.types)}</div>
      ${hand}
      <div class="dev">✓ within <b>${length(p.max_dev_mm)}</b></div>
    </div>
  </a>`;
}

function filters(parts) {
  const present = ORDER.filter((k) => parts.some((p) => p.types[k]));
  for (const k of [...active]) if (!present.includes(k)) active.delete(k);
  $('filters').innerHTML = present.map((k) =>
    `<button class="filter" data-kind="${k}" aria-pressed="${active.has(k)}"><i class="dot" style="--c:${kindVar(k)}"></i>${LABEL[k] ?? k}</button>`).join('');
}

function misses() {
  const box = $('misses');
  const c = data.corpora[corpus];
  const rows = Object.entries(c.misses ?? {});
  if (corpus !== 'oneshot' || !rows.length) { box.hidden = true; return; }
  const total = rows.reduce((s, [, n]) => s + n, 0);
  box.hidden = false;
  box.innerHTML = `<h2>Why the other ${int(total)} didn't make it</h2>
    <p>Most of the misses are close. Fixing those faces by hand is what the second collection is for.</p>
    <div class="bars">${rows.map(([k, n]) => `<div class="bar"><span>${MISS_LABELS[k] ?? k}</span><span class="n">${int(n)}</span>
      <div class="track"><div class="fill" style="width:${(100 * n / total).toFixed(1)}%"></div></div></div>`).join('')}</div>`;
}

function render() {
  for (const t of document.querySelectorAll('.tab')) t.setAttribute('aria-selected', String(t.dataset.corpus === corpus));
  for (const el of document.querySelectorAll('[data-count]')) el.textContent = int(data.parts.filter((p) => p.corpus === el.dataset.count).length);
  $('grid').setAttribute('aria-labelledby', `tab-${corpus}`);
  $('corpus-note').textContent = NOTES[corpus](data.corpora[corpus]).replace(/\s+/g, ' ');
  if (data.engine) {
    $('engine').innerHTML = `Results from Untessellator at commit <a href="https://github.com/h0witzer/Untessellator/commit/${
      data.engine}"><code>${data.engine.slice(0, 7)}</code></a>, built ${data.generated}.`;
  }
  stats();
  const all = data.parts.filter((p) => p.corpus === corpus);
  filters(all);
  const shown = all.filter((p) => [...active].every((k) => p.types[k])).sort(SORTS[$('sort').value]);
  $('controls').hidden = !all.length;
  $('grid').innerHTML = shown.length ? shown.map(card).join('')
    : `<div class="empty">${all.length ? 'No part has all of those surface types.'
      : 'Nothing here yet. Hand-painted parts are on their way.'}</div>`;
  misses();
}

document.querySelector('.tabs').addEventListener('click', (e) => {
  const t = e.target.closest('.tab');
  if (!t) return;
  corpus = t.dataset.corpus;
  history.replaceState(null, '', corpus === 'painted' ? '#painted' : location.pathname);
  render();
});
$('filters').addEventListener('click', (e) => {
  const b = e.target.closest('.filter');
  if (!b) return;
  if (active.has(b.dataset.kind)) active.delete(b.dataset.kind); else active.add(b.dataset.kind);
  render();
});
$('sort').addEventListener('change', render);
render();
