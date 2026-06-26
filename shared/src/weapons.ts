export interface WeaponDef {
  id: string;
  name: string;
  damage: number;
  bulletSpeed: number;
  bulletRadius: number;
  /** Pixi-compatible color (0xRRGGBB) */
  bulletColor: number;
  fireRateMs: number;
  bulletTtlMs: number;
  muzzleGap: number;
}

export const DEFAULT_WEAPON_ID = "pistol";

export const WEAPONS: Record<string, WeaponDef> = {
  pistol: {
    id: "pistol",
    name: "Pistol",
    damage: 25,
    bulletSpeed: 600,
    bulletRadius: 5,
    bulletColor: 0xfbbf24,
    fireRateMs: 200,
    bulletTtlMs: 2000,
    muzzleGap: 2,
  },
};

export function getWeapon(weaponId: string): WeaponDef {
  return WEAPONS[weaponId] ?? WEAPONS[DEFAULT_WEAPON_ID];
}
