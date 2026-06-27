import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  ACTIVE_MAP,
  createEmptyMap,
  parseStoredMap,
  shapesToObstacles,
} from "@io-game/shared";
import type { MapShape, ObstacleDef, StoredMapFile } from "@io-game/shared";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAPS_DIR = path.resolve(__dirname, "../maps");

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

export class MapStore {
  private maps = new Map<string, StoredMapFile>();

  async init(): Promise<void> {
    await fs.mkdir(MAPS_DIR, { recursive: true });
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

  getActiveObstacles(): ObstacleDef[] {
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
    data: { width: number; height: number; shapes: MapShape[] },
  ): Promise<StoredMapFile> {
    const safeName = sanitizeMapName(name);
    const stored = parseStoredMap(
      {
        name: safeName,
        width: data.width,
        height: data.height,
        shapes: data.shapes,
        updatedAt: new Date().toISOString(),
      },
      safeName,
    );

    await this.writeMap(stored);
    this.maps.set(stored.name, stored);
    return stored;
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
