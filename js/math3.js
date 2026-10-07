// Small 3D helpers: vectors are [x, y, z], matrices are 3x3 arrays of rows.

export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const len = a => Math.hypot(a[0], a[1], a[2]);
export const norm = a => scale(a, 1 / (len(a) || 1));

export const IDENTITY = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

export function apply(m, v) {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

export function mul(a, b) {
  const out = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    out[i][j] = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j];
  }
  return out;
}

// Rotation by `angle` radians about the unit vector `axis` (right-hand rule).
export function rotation(axis, angle) {
  const [x, y, z] = norm(axis);
  const c = Math.cos(angle), s = Math.sin(angle), t = 1 - c;
  return [
    [t * x * x + c, t * x * y - s * z, t * x * z + s * y],
    [t * x * y + s * z, t * y * y + c, t * y * z - s * x],
    [t * x * z - s * y, t * y * z + s * x, t * z * z + c],
  ];
}

// The shortest rotation that turns unit vector a into unit vector b.
export function align(a, b) {
  a = norm(a); b = norm(b);
  const c = dot(a, b);
  if (c > 0.999999) return IDENTITY;
  if (c < -0.999999) {
    const helper = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    return rotation(cross(a, helper), Math.PI);
  }
  return rotation(cross(a, b), Math.acos(c));
}
