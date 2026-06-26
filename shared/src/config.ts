/** Game configuration — single source of truth for client and server */

// Network
export const SERVER_PORT = 3001
export const CLIENT_DEV_PORT = 5173

// Simulation
export const TICK_RATE = 20
export const TICK_MS = 1000 / TICK_RATE
export const MAX_FRAME_DT = 0.05

// Client interpolation
export const INTERP_MS = TICK_MS
export const EXTRAP_MS = TICK_MS * 2

// Map
export const MAP_WIDTH = 1500
export const MAP_HEIGHT = 1500

// Player
export const PLAYER_RADIUS = 20
export const PLAYER_SPEED = 250
export const PLAYER_MAX_HP = 100
export const PLAYER_AIM_LINE_LENGTH = 10

// Vision
export const VIEW_RANGE = 900
export const VIEW_ANGLE = (2 * Math.PI) / 3

// Fog of war overlay (client)
export const FOG_OVERLAY_FILL = 'rgba(0, 0, 0, 0.82)'
export const FOG_OVERLAY_EDGE_COLOR = 'rgba(56, 189, 248, 0.15)'
export const FOG_OVERLAY_EDGE_WIDTH = 2

// Visibility polygon for fog (client)
export const FOG_RAY_COUNT = 90
export const FOG_CORNER_ANGLE_EPS = 0.00015
export const FOG_CORNER_CONE_PADDING = 0.01
export const FOG_ANGLE_FILTER_EPS = 0.001

// Client viewport
export const VIEWPORT_WIDTH = 1600
export const VIEWPORT_HEIGHT = 800

// Camera dead zone (client) — player moves freely inside without scrolling
export const CAMERA_DEAD_ZONE_WIDTH = 120
export const CAMERA_DEAD_ZONE_HEIGHT = 120
/** Half-extent for camera scroll; debug rect uses WIDTH/HEIGHT above */
export const CAMERA_DEAD_ZONE_RUBBER = 10
export const CAMERA_SMOOTH_DECAY = 0.04
export const CAMERA_DEBUG_DEAD_ZONE = true

// Spawn
export const SPAWN_MAP_MARGIN = 50
export const SPAWN_OBSTACLE_CLEARANCE = 8
export const SPAWN_ATTEMPTS = 50

// Client prediction reconciliation
export const PREDICTION_SNAP_DISTANCE = 100
export const PREDICTION_BLEND_THRESHOLD = 0.5
export const PREDICTION_BLEND_FACTOR = 0.4

// Game rules
export const RESPAWN_DELAY_MS = 2000
export const NICKNAME_MAX_LENGTH = 16
export const LEADERBOARD_SIZE = 10
