import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  ACTIVE_MAP,
  DEFAULT_TEXTURE_Z_INDEX,
  createEmptyMap,
  parseStoredMap,
  shapesToObstacles,
} from "@io-game/shared";
import type { MapShape, MapTextureDef, StoredMapFile } from "@io-game/shared";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAPS_DIR = path.resolve(__dirname, "../maps");
const TEXTURES_DIR = path.join(MAPS_DIR, "textures");
const ALLOWED_TEXTURE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

function mapJsonPath(name: string): string {
  return path.join(MAPS_DIR, `${name}.json`);
}

function sanitizeMapName(name: string): string {
  const trimmed = name.trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    throw new Error("Map name may only contain letters, numbers, _ and -.");
  }
  return trimmed;
}

function sanitizeTextureFileName(file: string): string {
  const base = path.basename(file);
  if (!/^[a-zA-Z0-9_.-]+$/.test(base)) {
    throw new Error("Invalid texture file name.");
  }
  const ext = path.extname(base).toLowerCase();
  if (!ALLOWED_TEXTURE_EXTENSIONS.has(ext)) {
    throw new Error("Texture must be PNG, JPG, WEBP, or GIF.");
  }
  return base;
}

function mapTexturesDir(name: string): string {
  return path.join(TEXTURES_DIR, sanitizeMapName(name));
}

function textureFilePath(mapName: string, file: string): string {
  return path.join(mapTexturesDir(mapName), sanitizeTextureFileName(file));
}

function createTextureId(textures: MapTextureDef[]): string {
  let index = textures.length + 1;
  const ids = new Set(textures.map((texture) => texture.id));
  while (ids.has(`t${index}`)) {
    index += 1;
  }
  return `t${index}`;
}

export class MapStore {
  private maps = new Map<string, StoredMapFile>();

  async init(): Promise<void> {
    await fs.mkdir(MAPS_DIR, { recursive: true });
    await fs.mkdir(TEXTURES_DIR, { recursive: true });
    const entries = await fs.readdir(MAPS_DIR);
    const mapNames = entries
      .filter((entry) => entry.endsWith(".json"))
      .map((entry) => entry.slice(0, -".json".length));

    if (mapNames.length === 0) {
      const seeded = createEmptyMap(ACTIVE_MAP);
      await this.writeMap(seeded);
      this.maps.set(seeded.name, seeded);
      return;
    }

    for (const name of mapNames) {
      this.maps.set(name, await this.readMap(name));
    }

    if (!this.maps.has(ACTIVE_MAP)) {
      const seeded = createEmptyMap(ACTIVE_MAP);
      await this.writeMap(seeded);
      this.maps.set(seeded.name, seeded);
    }
  }

  getActiveMapName(): string {
    return ACTIVE_MAP;
  }

  getActiveMap(): StoredMapFile {
    return this.getMap(ACTIVE_MAP);
  }

  getActiveObstacles() {
    return shapesToObstacles(this.getActiveMap().shapes);
  }

  listMaps(): string[] {
    return [...this.maps.keys()].sort();
  }

  getMap(name: string): StoredMapFile {
    const map = this.maps.get(name);
    if (!map) {
      throw new Error(`Map "${name}" not found.`);
    }
    return map;
  }

  getTexturePath(mapName: string, file: string): string {
    return textureFilePath(mapName, file);
  }

  async createMap(name: string, width?: number, height?: number): Promise<StoredMapFile> {
    const safeName = sanitizeMapName(name);
    if (this.maps.has(safeName)) {
      throw new Error(`Map "${safeName}" already exists.`);
    }

    const map = createEmptyMap(safeName, width, height);
    await this.writeMap(map);
    this.maps.set(map.name, map);
    return map;
  }

  async saveMap(
    name: string,
    data: { width: number; height: number; shapes: MapShape[]; textures: MapTextureDef[] },
  ): Promise<StoredMapFile> {
    const safeName = sanitizeMapName(name);
    const stored = parseStoredMap(
      {
        name: safeName,
        width: data.width,
        height: data.height,
        shapes: data.shapes,
        textures: data.textures,
        updatedAt: new Date().toISOString(),
      },
      safeName,
    );

    await this.writeMap(stored);
    this.maps.set(stored.name, stored);
    return stored;
  }

  async uploadTexture(
    mapName: string,
    originalFileName: string,
    buffer: Buffer,
    width: number,
    height: number,
  ): Promise<MapTextureDef> {
    const safeName = sanitizeMapName(mapName);
    if (!this.maps.has(safeName)) {
      throw new Error(`Map "${safeName}" not found.`);
    }
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      throw new Error("Invalid texture dimensions.");
    }
    if (buffer.length === 0) {
      throw new Error("Empty texture upload.");
    }

    const ext = path.extname(originalFileName).toLowerCase();
    if (!ALLOWED_TEXTURE_EXTENSIONS.has(ext)) {
      throw new Error("Texture must be PNG, JPG, WEBP, or GIF.");
    }

    const map = this.getMap(safeName);
    const id = createTextureId(map.textures);
    const file = `${id}${ext}`;
    const dir = mapTexturesDir(safeName);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, file), buffer);

    return {
      id,
      file,
      x: 0,
      y: 0,
      width,
      height,
      opacity: 1,
      zIndex: DEFAULT_TEXTURE_Z_INDEX,
    };
  }

  async deleteTextureFile(mapName: string, file: string): Promise<void> {
    const filePath = textureFilePath(mapName, file);
    await fs.unlink(filePath);
  }

  async deleteMap(name: string): Promise<void> {
    const safeName = sanitizeMapName(name);
    if (safeName === ACTIVE_MAP) {
      throw new Error(`Cannot delete the active map "${ACTIVE_MAP}".`);
    }
    if (this.maps.size <= 1) {
      throw new Error("Cannot delete the last map.");
    }
    if (!this.maps.has(safeName)) {
      throw new Error(`Map "${safeName}" not found.`);
    }

    await fs.unlink(mapJsonPath(safeName));
    await fs.rm(mapTexturesDir(safeName), { recursive: true, force: true });
    this.maps.delete(safeName);
  }

  private async readMap(name: string): Promise<StoredMapFile> {
    const raw = await fs.readFile(mapJsonPath(name), "utf8");
    return parseStoredMap(JSON.parse(raw) as unknown, name);
  }

  private async writeMap(stored: StoredMapFile): Promise<void> {
    await fs.mkdir(MAPS_DIR, { recursive: true });
    await fs.writeFile(mapJsonPath(stored.name), `${JSON.stringify(stored, null, 2)}\n`, "utf8");
  }
}
