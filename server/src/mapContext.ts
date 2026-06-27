import { DEFAULT_MAP_HEIGHT, DEFAULT_MAP_WIDTH } from "@io-game/shared";

let mapWidth = DEFAULT_MAP_WIDTH;
let mapHeight = DEFAULT_MAP_HEIGHT;

export function setMapSize(width: number, height: number): void {
  mapWidth = width;
  mapHeight = height;
}

export function getMapWidth(): number {
  return mapWidth;
}

export function getMapHeight(): number {
  return mapHeight;
}

export function getMapSize(): { width: number; height: number } {
  return { width: mapWidth, height: mapHeight };
}
