// Geometry helpers for freehand strokes. Points are [x, y] pairs in world units.

export const round = (n) => Math.round(n * 10) / 10;

// Smooth SVG path through the points, using each point as a quadratic control
// point and the midpoints between points as anchors.
export function strokePath(points) {
  if (points.length === 0) return '';
  const [x0, y0] = points[0];
  if (points.length === 1) return `M${x0} ${y0}L${x0 + 0.01} ${y0}`;
  let d = `M${x0} ${y0}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [ax, ay] = points[i];
    const [bx, by] = points[i + 1];
    d += `Q${ax} ${ay} ${round((ax + bx) / 2)} ${round((ay + by) / 2)}`;
  }
  const [lx, ly] = points[points.length - 1];
  return d + `L${lx} ${ly}`;
}

export function pointsBounds(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// True if (x, y) is within `radius` of the stroke's inked line.
export function hitStroke(stroke, x, y, radius) {
  const r = radius + stroke.width / 2;
  const b = pointsBounds(stroke.points);
  if (x < b.x - r || x > b.x + b.w + r || y < b.y - r || y > b.y + b.h + r) return false;
  const pts = stroke.points;
  if (pts.length === 1) return Math.hypot(x - pts[0][0], y - pts[0][1]) <= r;
  for (let i = 0; i < pts.length - 1; i++) {
    if (distToSegment(x, y, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]) <= r) return true;
  }
  return false;
}
