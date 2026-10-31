/** Number formatting shared by the gallery and part pages. Lengths come in millimetres. */

export const int = (x) => Number(x).toLocaleString('en-US');

/** A distance in the unit that keeps it readable: mm, µm or nm. */
export function length(mm) {
  if (mm == null || !Number.isFinite(mm)) return '–';
  if (mm < 1e-8) return '< 0.01 nm';
  if (mm < 1e-3) return `${sig(mm * 1e6)} nm`;
  if (mm < 1) return `${sig(mm * 1e3)} µm`;
  return `${sig(mm)} mm`;
}

export function sig(x, n = 2) {
  if (x === 0) return '0';
  const v = Number(x.toPrecision(n));
  return Math.abs(v) >= 100 ? int(Math.round(v)) : String(v);
}

/** A ratio such as 1.4e-7, written as "1.4 × 10⁻⁷". */
export function ratio(x) {
  if (x == null || !Number.isFinite(x)) return '–';
  if (x === 0) return '0';
  const e = Math.floor(Math.log10(x));
  const m = x / 10 ** e;
  const sup = String(e).replace(/[-0-9]/g, (c) => '⁻⁰¹²³⁴⁵⁶⁷⁸⁹'['-0123456789'.indexOf(c)]);
  return `${sig(m)} × 10${sup}`;
}

export function bytes(n) {
  if (n < 1e3) return `${n} B`;
  if (n < 1e6) return `${sig(n / 1e3)} KB`;
  return `${sig(n / 1e6)} MB`;
}

export const ORDER = ['plane', 'cylinder', 'cone', 'sphere', 'torus', 'bspline', 'revolution', 'extrusion', 'other'];
export const kindVar = (k) => `var(--k-${['revolution', 'extrusion'].includes(k) ? 'other' : k})`;
