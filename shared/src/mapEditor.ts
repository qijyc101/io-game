import {
  DEFAULT_MAP_HEIGHT,
  DEFAULT_MAP_WIDTH,
  DEFAULT_TEXTURE_Z_INDEX,
} from "./config.js";
import type { ObstacleDef } from "./obstacles.js";

export interface MapCircleDef {
  id: string;
  x: number;
  y: number;
  radius: number;
}

export interface MapLineDef {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness: number;
}

export type MapShape =
  | ({ kind: "rect" } & ObstacleDef)
  | ({ kind: "circle" } & MapCircleDef)
  | ({ kind: "line" } & MapLineDef);

export interface MapTextureDef {
  id: string;
  file: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex?: number;
  opacity?: number;
}

export function getTextureZIndex(texture: MapTextureDef): number {
  const zIndex = texture.zIndex;
  return Number.isFinite(zIndex) ? zIndex! : DEFAULT_TEXTURE_Z_INDEX;
}

export interface StoredMapFile {
  name: string;
  width: number;
  height: number;
  shapes: MapShape[];
  textures: MapTextureDef[];
  updatedAt: string;
}

export interface MapSize {
  width: number;
  height: number;
}

export function shapesToObstacles(shapes: MapShape[]): ObstacleDef[] {
  return filterRectShapes(shapes).map(({ id, x, y, width, height }) => ({
    id,
    x,
    y,
    width,
    height,
  }));
}

export function filterRectShapes(shapes: MapShape[]): Array<{ kind: "rect" } & ObstacleDef> {
  return shapes.filter((shape): shape is { kind: "rect" } & ObstacleDef => shape.kind === "rect");
}

export function moveShape(shape: MapShape, dx: number, dy: number): MapShape {
  if (shape.kind === "rect") {
    return { ...shape, x: shape.x + dx, y: shape.y + dy };
  }
  if (shape.kind === "circle") {
    return { ...shape, x: shape.x + dx, y: shape.y + dy };
  }
  return {
    ...shape,
    x1: shape.x1 + dx,
    y1: shape.y1 + dy,
    x2: shape.x2 + dx,
    y2: shape.y2 + dy,
  };
}

export function moveTexture(texture: MapTextureDef, dx: number, dy: number): MapTextureDef {
  return { ...texture, x: texture.x + dx, y: texture.y + dy };
}

export function collectSnapGuides(
  shapes: MapShape[],
  excludeIds: ReadonlySet<string> | null,
  mapSize: MapSize,
): { xs: number[]; ys: number[] } {
  const xs = [0, mapSize.width / 2, mapSize.width];
  const ys = [0, mapSize.height / 2, mapSize.height];

  for (const shape of shapes) {
    if (excludeIds?.has(shape.id)) continue;

    if (shape.kind === "rect") {
      xs.push(shape.x, shape.x + shape.width / 2, shape.x + shape.width);
      ys.push(shape.y, shape.y + shape.height / 2, shape.y + shape.height);
    } else if (shape.kind === "circle") {
      xs.push(shape.x - shape.radius, shape.x, shape.x + shape.radius);
      ys.push(shape.y - shape.radius, shape.y, shape.y + shape.radius);
    } else {
      xs.push(shape.x1, shape.x2, (shape.x1 + shape.x2) / 2);
      ys.push(shape.y1, shape.y2, (shape.y1 + shape.y2) / 2);
    }
  }

  return { xs, ys };
}

export function snapScalar(
  value: number,
  gridSize: number,
  guides: number[],
  threshold: number,
  enabled: boolean,
): number {
  if (!enabled) return value;

  let best = Math.round(value / gridSize) * gridSize;
  let bestDistance = Math.abs(value - best);

  for (const guide of guides) {
    const distance = Math.abs(value - guide);
    if (distance <= threshold && distance < bestDistance) {
      best = guide;
      bestDistance = distance;
    }
  }

  return best;
}

export function snapPoint(
  x: number,
  y: number,
  gridSize: number,
  guides: { xs: number[]; ys: number[] },
  threshold: number,
  enabled: boolean,
): { x: number; y: number } {
  return {
    x: snapScalar(x, gridSize, guides.xs, threshold, enabled),
    y: snapScalar(y, gridSize, guides.ys, threshold, enabled),
  };
}

export function parseMapShapes(raw: unknown): MapShape[] {
  if (!Array.isArray(raw)) {
    throw new Error("Expected a JSON array of shapes.");
  }

  return raw.map((item, index) => {
    if (!item || typeof item !== "object" || !("kind" in item)) {
      throw new Error(`Invalid shape at index ${index}.`);
    }

    const shape = item as Record<string, unknown>;
    if (shape.kind === "rect") {
      return {
        kind: "rect",
        id: String(shape.id ?? `r${index + 1}`),
        x: Number(shape.x),
        y: Number(shape.y),
        width: Number(shape.width),
        height: Number(shape.height),
      } satisfies MapShape;
    }
    if (shape.kind === "circle") {
      return {
        kind: "circle",
        id: String(shape.id ?? `c${index + 1}`),
        x: Number(shape.x),
        y: Number(shape.y),
        radius: Number(shape.radius),
      } satisfies MapShape;
    }
    if (shape.kind === "line") {
      return {
        kind: "line",
        id: String(shape.id ?? `l${index + 1}`),
        x1: Number(shape.x1),
        y1: Number(shape.y1),
        x2: Number(shape.x2),
        y2: Number(shape.y2),
        thickness: Number(shape.thickness),
      } satisfies MapShape;
    }

    throw new Error(`Unknown shape kind at index ${index}.`);
  });
}

export function parseMapTextures(raw: unknown): MapTextureDef[] {
  if (raw == null) {
    return [];
  }
  if (!Array.isArray(raw)) {
    throw new Error("Expected a JSON array of textures.");
  }

  return raw.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`Invalid texture at index ${index}.`);
    }

    const texture = item as Record<string, unknown>;
    const opacity = Number(texture.opacity);
    const zIndex = Number(texture.zIndex);

    return {
      id: String(texture.id ?? `t${index + 1}`),
      file: String(texture.file ?? ""),
      x: Number(texture.x),
      y: Number(texture.y),
      width: Number(texture.width),
      height: Number(texture.height),
      ...(Number.isFinite(zIndex) ? { zIndex } : {}),
      ...(Number.isFinite(opacity) ? { opacity } : {}),
    } satisfies MapTextureDef;
  });
}

export function parseStoredMap(raw: unknown, name: string): StoredMapFile {
  const data = (raw && typeof raw === "object" ? raw : {}) as Partial<StoredMapFile>;
  const width = Number(data.width);
  const height = Number(data.height);

  return {
    name,
    width: Number.isFinite(width) && width > 0 ? width : DEFAULT_MAP_WIDTH,
    height: Number.isFinite(height) && height > 0 ? height : DEFAULT_MAP_HEIGHT,
    shapes: parseMapShapes(data.shapes ?? []),
    textures: parseMapTextures(data.textures ?? []),
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : new Date().toISOString(),
  };
}

export function createEmptyMap(name: string, width = DEFAULT_MAP_WIDTH, height = DEFAULT_MAP_HEIGHT): StoredMapFile {
  return {
    name,
    width,
    height,
    shapes: [],
    textures: [],
    updatedAt: new Date().toISOString(),
  };
}
