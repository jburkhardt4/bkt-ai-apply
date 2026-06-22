// BKT Apply-Macro — draggable floating panel.
//
// Lets the user click-and-drag the control bar (#bkt-apply-root) to reposition
// it, with the Match-Score panel (#bkt-fit-panel) docked just below it so the two
// move together as a single unit. Movement is constrained to the RIGHT SIDE of
// the viewport (the panel never crosses into the left half where the application
// form lives) and the dropped position is remembered per-site via
// chrome.storage.local.
//
// The math (clampPanelPosition) is a pure, DOM-free function so it can be unit
// tested in node like the rest of the extension's helpers (stopConditions,
// answerSignals). The DOM wiring is kept thin on top of it.

export interface PanelPos {
  /** px from the top of the viewport to the control bar's top edge. */
  top: number
  /** px from the right of the viewport to the panel's right edge. */
  right: number
}

export interface Viewport {
  width: number
  height: number
}

/** Minimal element shape used by applyPanelPosition — satisfied by HTMLElement
 *  yet constructible as a stub in node tests. */
export interface StyleTarget {
  style: Pick<CSSStyleDeclaration, 'setProperty'>
  getBoundingClientRect(): { height: number }
}

const MARGIN = 8
/** The panel's left edge may not travel left of this fraction of the viewport
 *  width — i.e. it stays within the right portion of the page (the form area on
 *  the left is kept clear). */
const RIGHT_SIDE_LEFT_FRACTION = 0.5
const STORAGE_PREFIX = 'bkt-panel-pos:'
const DEFAULT_DOCK_GAP = 4

export function storageKey(host: string): string {
  return STORAGE_PREFIX + host
}

/**
 * Clamps a desired {top,right} so the panel stays fully on screen AND on the
 * right side of the page. `right` is the distance from the viewport's right edge
 * to the panel's right edge, so a LARGER right value moves the panel LEFT.
 *
 * - `top` is bounded to [MARGIN, height - controlHeight - MARGIN].
 * - `right` is bounded to [MARGIN, maxRight], where maxRight keeps the panel's
 *   left edge at or right of the right-side boundary. On viewports too narrow for
 *   the panel to honor that boundary, maxRight degrades gracefully to MARGIN
 *   (panel pinned to the right) rather than locking up.
 */
export function clampPanelPosition(
  pos: PanelPos,
  viewport: Viewport,
  panelWidth: number,
  controlHeight: number,
): PanelPos {
  // The furthest-left the panel's left edge may sit. Never demand a boundary the
  // panel physically can't satisfy (narrow screens) — fall back to the right edge.
  const leftBound = Math.min(
    viewport.width * RIGHT_SIDE_LEFT_FRACTION,
    Math.max(MARGIN, viewport.width - panelWidth - MARGIN),
  )
  const rightForLeftBound = viewport.width - panelWidth - leftBound
  const maxRight = Math.max(MARGIN, rightForLeftBound)
  const right = clamp(pos.right, MARGIN, maxRight)

  const maxTop = Math.max(MARGIN, viewport.height - controlHeight - MARGIN)
  const top = clamp(pos.top, MARGIN, maxTop)
  return { top, right }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** Writes the position to the control bar and docks the score panel below it.
 *  Uses `important` priority because injectStyles sets top/right with !important. */
export function applyPanelPosition(
  root: StyleTarget,
  panel: StyleTarget | null,
  pos: PanelPos,
  dockGap: number = DEFAULT_DOCK_GAP,
): void {
  root.style.setProperty('top', `${pos.top}px`, 'important')
  root.style.setProperty('right', `${pos.right}px`, 'important')
  root.style.setProperty('left', 'auto', 'important')
  if (panel) {
    const controlHeight = root.getBoundingClientRect().height || 48
    panel.style.setProperty('top', `${pos.top + controlHeight + dockGap}px`, 'important')
    panel.style.setProperty('right', `${pos.right}px`, 'important')
    panel.style.setProperty('left', 'auto', 'important')
  }
}

/** Reads the remembered position for this host; null when none/unavailable. */
export async function loadPanelPosition(host: string): Promise<PanelPos | null> {
  try {
    const key = storageKey(host)
    const got = await chrome.storage.local.get(key)
    const value = (got as Record<string, unknown>)[key]
    if (
      value &&
      typeof (value as PanelPos).top === 'number' &&
      typeof (value as PanelPos).right === 'number'
    ) {
      return { top: (value as PanelPos).top, right: (value as PanelPos).right }
    }
  } catch {
    /* storage unavailable — fall back to the default CSS position */
  }
  return null
}

/** Persists the dropped position for this host (best-effort, never throws). */
export function savePanelPosition(host: string, pos: PanelPos): void {
  try {
    void chrome.storage.local.set({ [storageKey(host)]: pos })
  } catch {
    /* ignore — position is a convenience, not critical state */
  }
}

export interface DraggableHandle {
  /** Re-applies the current position (call after the score panel is re-rendered). */
  relayout(): void
}

export interface MakeDraggableOptions {
  /** The drag handle — the control bar (#bkt-apply-root). */
  handle: HTMLElement
  /** Resolves the score panel (#bkt-fit-panel); it is re-created on each score. */
  getPanel: () => HTMLElement | null
  /** Host used as the persistence key. */
  host: string
  /** A previously-stored position to start from (null → keep default CSS spot). */
  initial?: PanelPos | null
  /** Persist hook (defaults to chrome.storage); injectable for tests. */
  save?: (host: string, pos: PanelPos) => void
}

/**
 * Makes the control bar draggable, carrying the score panel with it. Returns a
 * handle whose relayout() re-applies the position after the score panel is
 * replaced. Buttons inside the bar keep working — a pointerdown on a <button> is
 * ignored so clicks aren't swallowed by the drag.
 */
export function makeDraggable(options: MakeDraggableOptions): DraggableHandle {
  const { handle, getPanel, host } = options
  const save = options.save ?? savePanelPosition

  const viewport = (): Viewport => ({ width: window.innerWidth, height: window.innerHeight })

  let pos: PanelPos | null = options.initial
    ? clampPanelPosition(options.initial, viewport(), handle.offsetWidth, handle.offsetHeight)
    : null
  let dockGap = DEFAULT_DOCK_GAP

  // Capture the current gap between the control bar and the score panel so the
  // pair keeps its visual spacing once we start positioning them explicitly.
  const syncDockGap = (): void => {
    const panel = getPanel()
    if (!panel) return
    const gap = panel.getBoundingClientRect().top - handle.getBoundingClientRect().bottom
    if (Number.isFinite(gap) && gap >= 0) dockGap = gap
  }

  const relayout = (): void => {
    if (pos) applyPanelPosition(handle, getPanel(), pos, dockGap)
  }

  syncDockGap()
  relayout() // applies only when we started from a stored position

  // Where the bar sits right now, expressed as {top, right}.
  const currentPos = (): PanelPos => {
    const rect = handle.getBoundingClientRect()
    return { top: rect.top, right: Math.max(MARGIN, window.innerWidth - rect.right) }
  }

  let dragging = false
  let startX = 0
  let startY = 0
  let startPos: PanelPos = { top: 0, right: 0 }

  handle.addEventListener('pointerdown', (event) => {
    // Let the action buttons handle their own clicks.
    if ((event.target as HTMLElement | null)?.closest('button')) return
    if (event.button !== 0) return
    dragging = true
    syncDockGap() // freeze the gap before the panel starts moving
    if (!pos) pos = currentPos()
    startPos = pos
    startX = event.clientX
    startY = event.clientY
    try {
      handle.setPointerCapture(event.pointerId)
    } catch {
      /* capture is best-effort */
    }
    handle.style.setProperty('cursor', 'grabbing', 'important')
    event.preventDefault()
  })

  handle.addEventListener('pointermove', (event) => {
    if (!dragging) return
    const dx = event.clientX - startX
    const dy = event.clientY - startY
    // Dragging left (dx < 0) increases `right`; dragging down increases `top`.
    const desired = { top: startPos.top + dy, right: startPos.right - dx }
    pos = clampPanelPosition(desired, viewport(), handle.offsetWidth, handle.offsetHeight)
    applyPanelPosition(handle, getPanel(), pos, dockGap)
  })

  const endDrag = (event: PointerEvent): void => {
    if (!dragging) return
    dragging = false
    try {
      handle.releasePointerCapture(event.pointerId)
    } catch {
      /* ignore */
    }
    handle.style.removeProperty('cursor')
    if (pos) save(host, pos)
  }
  handle.addEventListener('pointerup', endDrag)
  handle.addEventListener('pointercancel', endDrag)

  // Keep the panel on screen / on the right side when the window is resized.
  window.addEventListener('resize', () => {
    if (!pos) return
    pos = clampPanelPosition(pos, viewport(), handle.offsetWidth, handle.offsetHeight)
    applyPanelPosition(handle, getPanel(), pos, dockGap)
  })

  return { relayout }
}
