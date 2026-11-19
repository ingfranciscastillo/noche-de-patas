import { GameMap, Pt } from './MapBuilder';

const SQRT2 = Math.SQRT2;
const DIRS: [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2],
];

/** Heurística octile: admisible para rejilla de 8 direcciones. */
function octile(ax: number, ay: number, bx: number, by: number) {
  const dx = Math.abs(ax - bx), dy = Math.abs(ay - by);
  return dx + dy + (SQRT2 - 2) * Math.min(dx, dy);
}

/** A* sobre la rejilla del mapa (8 direcciones, sin cortar esquinas). Devuelve casillas desde start (excluido) hasta goal. */
export function findPath(map: GameMap, start: Pt, goal: Pt, maxNodes = 2500): Pt[] | null {
  const W = map.w;
  if (!map.isWalkable(goal.x, goal.y)) {
    const alt = nearestWalkable(map, goal);
    if (!alt) return null;
    goal = alt;
  }
  if (!map.isWalkable(start.x, start.y)) {
    const alt = nearestWalkable(map, start);
    if (!alt) return null;
    start = alt;
  }
  const startI = start.y * W + start.x;
  const goalI = goal.y * W + goal.x;
  if (startI === goalI) return [];
  const g = new Map<number, number>([[startI, 0]]);
  const came = new Map<number, number>();
  const closed = new Set<number>();
  // Montículo binario simple de [f, i]
  const heap: [number, number][] = [[octile(start.x, start.y, goal.x, goal.y), startI]];
  const push = (n: [number, number]) => {
    heap.push(n);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  let expanded = 0;
  while (heap.length) {
    const [, cur] = pop();
    if (cur === goalI) break;
    if (closed.has(cur)) continue;
    closed.add(cur);
    if (++expanded > maxNodes) return null;
    const cx = cur % W, cy = (cur / W) | 0;
    const cg = g.get(cur)!;
    for (const [dx, dy, cost] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (!map.isWalkable(nx, ny)) continue;
      if (dx !== 0 && dy !== 0 && (!map.isWalkable(cx + dx, cy) || !map.isWalkable(cx, cy + dy))) continue;
      const ni = ny * W + nx;
      if (closed.has(ni)) continue;
      const ng = cg + cost;
      if (ng < (g.get(ni) ?? Infinity)) {
        g.set(ni, ng);
        came.set(ni, cur);
        push([ng + octile(nx, ny, goal.x, goal.y), ni]);
      }
    }
  }
  if (!came.has(goalI)) return null;
  const path: Pt[] = [];
  let c = goalI;
  while (c !== startI) {
    path.push({ x: c % W, y: (c / W) | 0 });
    c = came.get(c)!;
  }
  return path.reverse();
}

export function nearestWalkable(map: GameMap, p: Pt): Pt | null {
  for (let r = 1; r < 6; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++)
        if (map.isWalkable(p.x + dx, p.y + dy)) return { x: p.x + dx, y: p.y + dy };
  return null;
}
