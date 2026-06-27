import { mapTextureUrl } from "./api";

const imageCache = new Map<string, HTMLImageElement>();

function cacheKey(mapName: string, file: string): string {
  return `${mapName}/${file}`;
}

export function getCachedTextureImage(mapName: string, file: string): HTMLImageElement | null {
  const image = imageCache.get(cacheKey(mapName, file));
  return image?.complete && image.naturalWidth > 0 ? image : null;
}

export function loadEditorTextureImage(mapName: string, file: string): Promise<HTMLImageElement> {
  const key = cacheKey(mapName, file);
  const cached = imageCache.get(key);
  if (cached?.complete && cached.naturalWidth > 0) {
    return Promise.resolve(cached);
  }

  return new Promise((resolve, reject) => {
    const image = cached ?? new Image();
    image.onload = () => {
      imageCache.set(key, image);
      resolve(image);
    };
    image.onerror = () => {
      reject(new Error(`Failed to load texture "${file}".`));
    };
    image.src = mapTextureUrl(mapName, file);
  });
}

export function clearTextureCacheForMap(mapName: string): void {
  for (const key of imageCache.keys()) {
    if (key.startsWith(`${mapName}/`)) {
      imageCache.delete(key);
    }
  }
}
