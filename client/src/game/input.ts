import { VIEWPORT_WIDTH, VIEWPORT_HEIGHT } from "@io-game/shared";

export interface InputState {
  move: { x: number; y: number }
  aim: number
  shoot: boolean
}

const keys = new Set<string>()

export function initInput(canvas: HTMLCanvasElement): () => InputState {
  const onKeyDown = (e: KeyboardEvent) => {
    keys.add(e.code)
    if (e.code === 'Space') e.preventDefault()
  }
  const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code)
  const onMouseDown = () => {
    mouseDown = true
  }
  const onMouseUp = () => {
    mouseDown = false
  }

  let mouseDown = false
  let mouseX = 0
  let mouseY = 0

  const onMouseMove = (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect()
    const scaleX = VIEWPORT_WIDTH / rect.width
    const scaleY = VIEWPORT_HEIGHT / rect.height
    mouseX = (e.clientX - rect.left) * scaleX
    mouseY = (e.clientY - rect.top) * scaleY
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  canvas.addEventListener('mousedown', onMouseDown)
  window.addEventListener('mouseup', onMouseUp)
  canvas.addEventListener('mousemove', onMouseMove)

  return () => {
    let mx = 0
    let my = 0

    if (keys.has('KeyW') || keys.has('ArrowUp')) my -= 1
    if (keys.has('KeyS') || keys.has('ArrowDown')) my += 1
    if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1
    if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1

    const centerX = VIEWPORT_WIDTH / 2
    const centerY = VIEWPORT_HEIGHT / 2
    const aim = Math.atan2(mouseY - centerY, mouseX - centerX)
    const shoot = mouseDown || keys.has('Space')

    return { move: { x: mx, y: my }, aim, shoot }
  }
}

export function cleanupInput(canvas: HTMLCanvasElement): void {
  // listeners are on window/canvas; cleaned up when canvas unmounts
  void canvas
}
