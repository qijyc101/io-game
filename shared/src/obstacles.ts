export interface ObstacleDef {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Static arena cover — same layout on server and client */
export const OBSTACLES: ObstacleDef[] = [
  { id: "c-h", x: 1360, y: 1470, width: 280, height: 60 },
  { id: "c-v", x: 1470, y: 1360, width: 60, height: 280 },

  { id: "nw", x: 450, y: 450, width: 200, height: 350 },
  { id: "ne", x: 2350, y: 450, width: 200, height: 350 },
  { id: "sw", x: 450, y: 2200, width: 200, height: 350 },
  { id: "se", x: 2350, y: 2200, width: 200, height: 350 },

  { id: "ml", x: 850, y: 1300, width: 140, height: 220 },
  { id: "mr", x: 2010, y: 1300, width: 140, height: 220 },
  { id: "mt", x: 1300, y: 750, width: 220, height: 140 },
  { id: "mb", x: 1300, y: 2110, width: 220, height: 140 },

  { id: "l1", x: 1100, y: 950, width: 80, height: 180 },
  { id: "l2", x: 1820, y: 1870, width: 80, height: 180 },
];
