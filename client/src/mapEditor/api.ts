import type { MapShape, StoredMapFile } from "@io-game/shared";

export interface MapsIndexResponse {
  active: string;
  maps: string[];
}

export async function fetchMapsIndex(): Promise<MapsIndexResponse> {
  const response = await fetch("/api/maps");
  if (!response.ok) {
    throw new Error("Failed to load map list.");
  }
  return response.json() as Promise<MapsIndexResponse>;
}

export async function fetchMap(name: string): Promise<StoredMapFile> {
  const response = await fetch(`/api/maps/${encodeURIComponent(name)}`);
  if (!response.ok) {
    throw new Error("Failed to load map.");
  }
  return response.json() as Promise<StoredMapFile>;
}

export async function createMap(name: string, width: number, height: number): Promise<StoredMapFile> {
  const response = await fetch("/api/maps", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, width, height }),
  });

  const payload = (await response.json()) as StoredMapFile & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? "Failed to create map.");
  }

  return payload;
}

export async function saveMap(map: StoredMapFile): Promise<StoredMapFile> {
  const response = await fetch(`/api/maps/${encodeURIComponent(map.name)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      width: map.width,
      height: map.height,
      shapes: map.shapes,
    }),
  });

  const payload = (await response.json()) as StoredMapFile & { ok?: boolean; error?: string };
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error ?? "Failed to save map.");
  }

  return payload;
}

export async function deleteMap(name: string): Promise<MapsIndexResponse> {
  const response = await fetch(`/api/maps/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });

  const payload = (await response.json()) as MapsIndexResponse & { ok?: boolean; error?: string };
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error ?? "Failed to delete map.");
  }

  return payload;
}
