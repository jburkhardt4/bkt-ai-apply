import type { FitPanelData } from './types'

/**
 * Injects the Match-Score + Fit-Summary panel into the page (spec §4.2),
 * mirroring the Phase 2a JobFitPanel and rendered BEFORE the user applies
 * (UAT-1).
 *
 * SELF-CONTAINED (DOM + argument only) so the same function is used by the
 * Playwright fixture tests and the MV3 content script. Idempotent: re-rendering
 * replaces any prior panel. The real content script will mount this inside a
 * shadow root so host-page CSS cannot collide; here it uses a stable id.
 */
export function renderMatchScorePanel(data: FitPanelData): void {
  const PANEL_ID = 'bkt-fit-panel'
  document.getElementById(PANEL_ID)?.remove()

  const label = data.score >= 80 ? 'Strong fit' : data.score >= 65 ? 'Possible fit' : 'Weak fit'

  const panel = document.createElement('div')
  panel.id = PANEL_ID
  panel.setAttribute('data-bkt', 'fit-panel')
  panel.setAttribute('role', 'complementary')

  const heading = document.createElement('div')
  heading.setAttribute('data-bkt', 'score')
  heading.textContent = `${data.score}/100 · ${label}${data.estimated ? ' (estimated)' : ''}`
  panel.appendChild(heading)

  if (data.recommendation) {
    const rec = document.createElement('div')
    rec.setAttribute('data-bkt', 'recommendation')
    rec.textContent = `Recommendation: ${data.recommendation}`
    panel.appendChild(rec)
  }

  const addList = (title: string, items: string[], kind: string): void => {
    const section = document.createElement('div')
    section.setAttribute('data-bkt', kind)
    const h = document.createElement('div')
    h.textContent = title
    section.appendChild(h)
    const ul = document.createElement('ul')
    for (const item of items) {
      const li = document.createElement('li')
      li.textContent = item
      ul.appendChild(li)
    }
    section.appendChild(ul)
    panel.appendChild(section)
  }
  addList('Matched skills', data.matched, 'matched')
  addList('Missing keywords', data.missing, 'missing')

  document.body.appendChild(panel)
}
