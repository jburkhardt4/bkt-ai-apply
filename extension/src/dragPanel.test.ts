import { describe, expect, it } from 'vitest'
import {
  applyPanelPosition,
  clampPanelPosition,
  storageKey,
  type PanelPos,
  type StyleTarget,
} from './dragPanel'

const WIDE = { width: 1440, height: 900 }
const PANEL_W = 320
const CTRL_H = 48

describe('clampPanelPosition — viewport bounds', () => {
  it('keeps an in-bounds position unchanged', () => {
    const pos: PanelPos = { top: 120, right: 200 }
    expect(clampPanelPosition(pos, WIDE, PANEL_W, CTRL_H)).toEqual({ top: 120, right: 200 })
  })

  it('pins to the top/right margin when dragged past the top-right corner', () => {
    const out = clampPanelPosition({ top: -50, right: -50 }, WIDE, PANEL_W, CTRL_H)
    expect(out).toEqual({ top: 8, right: 8 })
  })

  it('never lets the control bar fall off the bottom', () => {
    const out = clampPanelPosition({ top: 100_000, right: 100 }, WIDE, PANEL_W, CTRL_H)
    expect(out.top).toBe(WIDE.height - CTRL_H - 8) // 844
  })
})

describe('clampPanelPosition — right-side constraint', () => {
  it("caps `right` so the panel's left edge cannot cross the viewport midpoint", () => {
    // maxRight = width - panelWidth - (width * 0.5) = 1440 - 320 - 720 = 400
    const out = clampPanelPosition({ top: 100, right: 9999 }, WIDE, PANEL_W, CTRL_H)
    expect(out.right).toBe(400)
    // left edge = width - right - panelWidth = 1440 - 400 - 320 = 720 = midpoint
    const leftEdge = WIDE.width - out.right - PANEL_W
    expect(leftEdge).toBe(WIDE.width / 2)
  })

  it('degrades gracefully on a viewport too narrow for the right-half rule', () => {
    // 600px wide, 320px panel: cannot honor a 300px left boundary — pin right.
    const narrow = { width: 600, height: 800 }
    const out = clampPanelPosition({ top: 50, right: 9999 }, narrow, PANEL_W, CTRL_H)
    expect(out.right).toBe(8) // MARGIN — panel stays pinned to the right edge
    expect(out.right).toBeGreaterThanOrEqual(8)
  })
})

describe('storageKey', () => {
  it('namespaces by host', () => {
    expect(storageKey('job-boards.greenhouse.io')).toBe('bkt-panel-pos:job-boards.greenhouse.io')
  })
})

describe('applyPanelPosition', () => {
  type Call = [string, string | null, string | undefined]
  function fakeTarget(height = CTRL_H): { target: StyleTarget; calls: Call[] } {
    const calls: Call[] = []
    const target: StyleTarget = {
      style: {
        setProperty: (property: string, value: string | null, priority?: string) => {
          calls.push([property, value, priority])
        },
      },
      getBoundingClientRect: () => ({ height }),
    }
    return { target, calls }
  }

  it('writes top/right with important priority and docks the panel below the bar', () => {
    const root = fakeTarget(48)
    const panel = fakeTarget()

    applyPanelPosition(root.target, panel.target, { top: 100, right: 60 }, 4)

    // bar gets the literal position, always at !important priority
    expect(root.calls).toContainEqual(['top', '100px', 'important'])
    expect(root.calls).toContainEqual(['right', '60px', 'important'])
    // panel docks at top + controlHeight + gap = 100 + 48 + 4 = 152, shares right
    expect(panel.calls).toContainEqual(['top', '152px', 'important'])
    expect(panel.calls).toContainEqual(['right', '60px', 'important'])
  })

  it('positions the bar even when the score panel is absent', () => {
    const root = fakeTarget()
    expect(() => applyPanelPosition(root.target, null, { top: 10, right: 10 })).not.toThrow()
    expect(root.calls).toContainEqual(['top', '10px', 'important'])
  })
})
