import type { MapShape, MapTextureDef, StoredMapFile } from "@io-game/shared";

export function mapTextureUrl(mapName: string, file: string): string {
  return `/api/maps/${encodeURIComponent(mapName)}/textures/${encodeURIComponent(file)}`;
}

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
      textures: map.textures ?? [],
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

function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Failed to read "${file.name}".`));
    };
    image.src = url;
  });
}

export async function uploadMapTexture(mapName: string, file: File): Promise<MapTextureDef> {
  const { width, height } = await readImageDimensions(file);
  const response = await fetch(`/api/maps/${encodeURIComponent(mapName)}/textures`, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-File-Name": file.name,
      "X-Image-Width": String(width),
      "X-Image-Height": String(height),
    },
    body: file,
  });

  const payload = (await response.json()) as MapTextureDef & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? "Failed to upload texture.");
  }

  return payload;
}

export async function deleteMapTexture(mapName: string, file: string): Promise<void> {
  const response = await fetch(
    `/api/maps/${encodeURIComponent(mapName)}/textures/${encodeURIComponent(file)}`,
    { method: "DELETE" },
  );

  const payload = (await response.json()) as { ok?: boolean; error?: string };
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error ?? "Failed to delete texture.");
  }
}
