import {
  MAP_GRID_SIZE,
  MAP_SNAP_THRESHOLD,
  collectSnapGuides,
  moveShape,
  snapPoint,
} from "@io-game/shared";
import type { MapShape, MapSize } from "@io-game/shared";

export type Tool = "select" | "rect" | "circle" | "line";
export type Draft = { startX: number; startY: number; endX: number; endY: number };
export type DragState = {
  shapeIds: string[];
  startX: number;
  startY: number;
  origins: MapShape[];
};
export type PanState = {
  startScreenX: number;
  startScreenY: number;
  originView: EditorViewState;
};

export interface Viewport {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface EditorViewState {
  zoom: number;
  panX: number;
  panY: number;
}

export const DEFAULT_EDITOR_VIEW: EditorViewState = {
  zoom: 1,
  panX: 0,
  panY: 0,
};

function getFitScale(canvas: HTMLCanvasElement, mapSize: MapSize): number {
  const padding = 32;
  const availableWidth = canvas.width - padding * 2;
  const availableHeight = canvas.height - padding * 2;
  return Math.min(availableWidth / mapSize.width, availableHeight / mapSize.height);
}

export function getViewport(
  canvas: HTMLCanvasElement,
  mapSize: MapSize,
  view: EditorViewState = DEFAULT_EDITOR_VIEW,
): Viewport {
  const fitScale = getFitScale(canvas, mapSize);
  const scale = fitScale * view.zoom;
  const mapWidthPx = mapSize.width * scale;
  const mapHeightPx = mapSize.height * scale;
  return {
    scale,
    offsetX: (canvas.width - mapWidthPx) / 2 + view.panX,
    offsetY: (canvas.height - mapHeightPx) / 2 + view.panY,
  };
}

export function zoomAtPoint(
  canvas: HTMLCanvasElement,
  mapSize: MapSize,
  view: EditorViewState,
  screenX: number,
  screenY: number,
  factor: number,
): EditorViewState {
  const viewport = getViewport(canvas, mapSize, view);
  const worldX = (screenX - viewport.offsetX) / viewport.scale;
  const worldY = (screenY - viewport.offsetY) / viewport.scale;

  const zoom = Math.max(0.25, Math.min(4, view.zoom * factor));
  const fitScale = getFitScale(canvas, mapSize);
  const scale = fitScale * zoom;
  const baseOffsetX = (canvas.width - mapSize.width * scale) / 2;
  const baseOffsetY = (canvas.height - mapSize.height * scale) / 2;

  return {
    zoom,
    panX: screenX - worldX * scale - baseOffsetX,
    panY: screenY - worldY * scale - baseOffsetY,
  };
}

export function createShapeId(prefix: string, shapes: MapShape[]): string {
  let index = shapes.length + 1;
  let id = `${prefix}${index}`;
  const ids = new Set(shapes.map((shape) => shape.id));
  while (ids.has(id)) {
    index += 1;
    id = `${prefix}${index}`;
  }
  return id;
}

export function toWorld(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
  viewport: Viewport,
  mapSize: MapSize,
  clamp = true,
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const x = ((clientX - rect.left) * (canvas.width / rect.width) - viewport.offsetX) / viewport.scale;
  const y = ((clientY - rect.top) * (canvas.height / rect.height) - viewport.offsetY) / viewport.scale;
  if (!clamp) {
    return { x, y };
  }
  return {
    x: Math.max(0, Math.min(mapSize.width, x)),
    y: Math.max(0, Math.min(mapSize.height, y)),
  };
}

export function applySnap(
  x: number,
  y: number,
  shapes: MapShape[],
  excludeIds: ReadonlySet<string> | null,
  mapSize: MapSize,
  snapEnabled: boolean,
): { x: number; y: number } {
  const guides = collectSnapGuides(shapes, excludeIds, mapSize);
  return snapPoint(x, y, MAP_GRID_SIZE, guides, MAP_SNAP_THRESHOLD, snapEnabled);
}

export function getShapeBounds(shape: MapShape): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  if (shape.kind === "rect") {
    return { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
  }
  if (shape.kind === "circle") {
    return {
      x: shape.x - shape.radius,
      y: shape.y - shape.radius,
      width: shape.radius * 2,
      height: shape.radius * 2,
    };
  }
  const minX = Math.min(shape.x1, shape.x2);
  const minY = Math.min(shape.y1, shape.y2);
  const pad = shape.thickness / 2;
  return {
    x: minX - pad,
    y: minY - pad,
    width: Math.abs(shape.x2 - shape.x1) + pad * 2,
    height: Math.abs(shape.y2 - shape.y1) + pad * 2,
  };
}

function rectsIntersect(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

export function shapeIntersectsRect(
  shape: MapShape,
  rect: { x: number; y: number; width: number; height: number },
): boolean {
  return rectsIntersect(getShapeBounds(shape), rect);
}

export function getShapesInRect(shapes: MapShape[], rect: { x: number; y: number; width: number; height: number }): string[] {
  return shapes.filter((shape) => shapeIntersectsRect(shape, rect)).map((shape) => shape.id);
}

export function getRangeSelectionIds(
  shapes: MapShape[],
  anchorId: string | null,
  targetId: string,
): string[] {
  if (!anchorId) {
    return [targetId];
  }
  const anchorIndex = shapes.findIndex((shape) => shape.id === anchorId);
  const targetIndex = shapes.findIndex((shape) => shape.id === targetId);
  if (anchorIndex < 0 || targetIndex < 0) {
    return [targetId];
  }
  const start = Math.min(anchorIndex, targetIndex);
  const end = Math.max(anchorIndex, targetIndex);
  return shapes.slice(start, end + 1).map((shape) => shape.id);
}

export function toggleSelectionId(selectedIds: readonly string[], id: string): string[] {
  const next = new Set(selectedIds);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return [...next];
}

export function mergeSelectionIds(selectedIds: readonly string[], ids: readonly string[]): string[] {
  return [...new Set([...selectedIds, ...ids])];
}

export function normalizeRect(startX: number, startY: number, endX: number, endY: number) {
  const x = Math.min(startX, endX);
  const y = Math.min(startY, endY);
  return {
    x,
    y,
    width: Math.abs(endX - startX),
    height: Math.abs(endY - startY),
  };
}

function distanceToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) {
    return Math.hypot(px - x1, py - y1);
  }
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  const closestX = x1 + t * dx;
  const closestY = y1 + t * dy;
  return Math.hypot(px - closestX, py - closestY);
}

export function hitTestShape(shape: MapShape, x: number, y: number): boolean {
  if (shape.kind === "rect") {
    return x >= shape.x && x <= shape.x + shape.width && y >= shape.y && y <= shape.y + shape.height;
  }
  if (shape.kind === "circle") {
    return Math.hypot(x - shape.x, y - shape.y) <= shape.radius;
  }
  return distanceToSegment(x, y, shape.x1, shape.y1, shape.x2, shape.y2) <= shape.thickness / 2;
}

function drawShape(ctx: CanvasRenderingContext2D, shape: MapShape, selected: boolean): void {
  ctx.save();
  ctx.fillStyle = selected ? "rgba(34, 211, 238, 0.45)" : "rgba(100, 116, 139, 0.55)";
  ctx.strokeStyle = selected ? "#22d3ee" : "#64748b";
  ctx.lineWidth = selected ? 2 : 1;

  if (shape.kind === "rect") {
    ctx.fillRect(shape.x, shape.y, shape.width, shape.height);
    ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
  } else if (shape.kind === "circle") {
    ctx.beginPath();
    ctx.arc(shape.x, shape.y, shape.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.lineCap = "round";
    ctx.lineWidth = shape.thickness;
    ctx.beginPath();
    ctx.moveTo(shape.x1, shape.y1);
    ctx.lineTo(shape.x2, shape.y2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawDraft(
  ctx: CanvasRenderingContext2D,
  draft: Draft,
  tool: Tool,
  lineThickness: number,
): void {
  ctx.save();
  ctx.strokeStyle = "#fbbf24";
  ctx.fillStyle = "rgba(251, 191, 36, 0.25)";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);

  if (tool === "rect") {
    const rect = normalizeRect(draft.startX, draft.startY, draft.endX, draft.endY);
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
  } else if (tool === "circle") {
    const radius = Math.hypot(draft.endX - draft.startX, draft.endY - draft.startY);
    ctx.beginPath();
    ctx.arc(draft.startX, draft.startY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (tool === "line") {
    ctx.lineCap = "round";
    ctx.lineWidth = lineThickness;
    ctx.beginPath();
    ctx.moveTo(draft.startX, draft.startY);
    ctx.lineTo(draft.endX, draft.endY);
    ctx.stroke();
  }

  ctx.restore();
}

function drawSelectionBox(ctx: CanvasRenderingContext2D, box: Draft): void {
  ctx.save();
  ctx.strokeStyle = "#22d3ee";
  ctx.fillStyle = "rgba(34, 211, 238, 0.12)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  const rect = normalizeRect(box.startX, box.startY, box.endX, box.endY);
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
  ctx.restore();
}

export function renderEditorCanvas(
  canvas: HTMLCanvasElement,
  mapSize: MapSize,
  shapes: MapShape[],
  selectedIds: ReadonlySet<string>,
  tool: Tool,
  draft: Draft | null,
  view: EditorViewState = DEFAULT_EDITOR_VIEW,
  lineThickness = 25,
  selectionBox: Draft | null = null,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const viewport = getViewport(canvas, mapSize, view);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(viewport.offsetX, viewport.offsetY);
  ctx.scale(viewport.scale, viewport.scale);

  ctx.fillStyle = "#1e293b";
  ctx.fillRect(0, 0, mapSize.width, mapSize.height);
  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, mapSize.width, mapSize.height);

  ctx.strokeStyle = "rgba(51, 65, 85, 0.45)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= mapSize.width; x += MAP_GRID_SIZE) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, mapSize.height);
    ctx.stroke();
  }
  for (let y = 0; y <= mapSize.height; y += MAP_GRID_SIZE) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(mapSize.width, y);
    ctx.stroke();
  }

  for (const shape of shapes) {
    drawShape(ctx, shape, selectedIds.has(shape.id));
  }

  if (selectionBox) {
    drawSelectionBox(ctx, selectionBox);
  }

  if (draft && tool !== "select") {
    drawDraft(ctx, draft, tool, lineThickness);
  }

  ctx.restore();
}

export function dragShapes(
  origins: MapShape[],
  startX: number,
  startY: number,
  currentX: number,
  currentY: number,
  shapes: MapShape[],
  mapSize: MapSize,
  snapEnabled: boolean,
): MapShape[] {
  if (origins.length === 0) {
    return [];
  }

  const excludeIds = new Set(origins.map((shape) => shape.id));
  const primary = origins[0]!;
  const rawDx = currentX - startX;
  const rawDy = currentY - startY;
  const anchor = getShapeAnchor(primary);
  const snapped = applySnap(
    anchor.x + rawDx,
    anchor.y + rawDy,
    shapes,
    excludeIds,
    mapSize,
    snapEnabled,
  );
  const dx = snapped.x - anchor.x;
  const dy = snapped.y - anchor.y;
  return origins.map((origin) => moveShape(origin, dx, dy));
}

export function dragShape(
  origin: MapShape,
  startX: number,
  startY: number,
  currentX: number,
  currentY: number,
  shapes: MapShape[],
  mapSize: MapSize,
  snapEnabled: boolean,
): MapShape {
  return dragShapes([origin], startX, startY, currentX, currentY, shapes, mapSize, snapEnabled)[0]!;
}

function getShapeAnchor(shape: MapShape): { x: number; y: number } {
  if (shape.kind === "rect") {
    return { x: shape.x, y: shape.y };
  }
  if (shape.kind === "circle") {
    return { x: shape.x, y: shape.y };
  }
  return { x: shape.x1, y: shape.y1 };
}

export function replaceShape(shapes: MapShape[], nextShape: MapShape): MapShape[] {
  return shapes.map((shape) => (shape.id === nextShape.id ? nextShape : shape));
}
