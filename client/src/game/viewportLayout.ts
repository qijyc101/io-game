import { VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from '@io-game/shared'

export interface ViewportLayout {
  cssWidth: number
  cssHeight: number
  left: number
  top: number
  resolution: number
}

/** Compensate browser page zoom so backing-store density stays stable */
export function getViewportResolution(): number {
  const dpr = window.devicePixelRatio || 1
  const zoom = window.visualViewport?.scale ?? 1
  return dpr / zoom
}

export function computeViewportLayout(parent: HTMLElement): ViewportLayout {
  const width = parent.clientWidth
  const height = parent.clientHeight
  const resolution = getViewportResolution()

  if (width === 0 || height === 0) {
    return {
      cssWidth: VIEWPORT_WIDTH,
      cssHeight: VIEWPORT_HEIGHT,
      left: 0,
      top: 0,
      resolution,
    }
  }

  const scale = Math.min(width / VIEWPORT_WIDTH, height / VIEWPORT_HEIGHT)
  const cssWidth = VIEWPORT_WIDTH * scale
  const cssHeight = VIEWPORT_HEIGHT * scale

  return {
    cssWidth,
    cssHeight,
    left: (width - cssWidth) / 2,
    top: (height - cssHeight) / 2,
    resolution,
  }
}

function applyElementLayout(el: HTMLElement, layout: ViewportLayout): void {
  el.style.position = 'absolute'
  el.style.width = `${layout.cssWidth}px`
  el.style.height = `${layout.cssHeight}px`
  el.style.left = `${layout.left}px`
  el.style.top = `${layout.top}px`
}

export function bindViewportLayout(
  parent: HTMLElement,
  canvas: HTMLCanvasElement,
  fogCanvas: HTMLCanvasElement,
  onLayout: (layout: ViewportLayout) => void,
): () => void {
  parent.style.overflow = 'hidden'
  parent.style.position = 'relative'

  const update = () => {
    const layout = computeViewportLayout(parent)
    applyElementLayout(canvas, layout)
    applyElementLayout(fogCanvas, layout)
    onLayout(layout)
  }

  update()

  const resizeObserver = new ResizeObserver(update)
  resizeObserver.observe(parent)

  const vv = window.visualViewport
  vv?.addEventListener('resize', update)
  window.addEventListener('resize', update)

  return () => {
    resizeObserver.disconnect()
    vv?.removeEventListener('resize', update)
    window.removeEventListener('resize', update)
  }
}
