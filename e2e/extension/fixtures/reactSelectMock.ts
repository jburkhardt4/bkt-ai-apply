/**
 * Installs a minimal vanilla react-select-like widget so the macro's
 * react-select strategy can be tested deterministically (no real React).
 *
 * Convention: a control element `.rs-control` carries `data-options` (a
 * pipe-separated option list) and is paired with a sibling `.rs-menu`. Clicking
 * the control renders `[role="option"]` divs into the menu; clicking an option
 * writes its label back onto the control (`data-value` + text) and closes the
 * menu — mirroring how react-select opens on click and commits on option click.
 *
 * SELF-CONTAINED (DOM only) so it runs via Playwright `page.evaluate`.
 */
export function installReactSelectMock(): void {
  const controls = Array.from(document.querySelectorAll<HTMLElement>('.rs-control'))
  for (const control of controls) {
    const menu = control.parentElement?.querySelector<HTMLElement>('.rs-menu')
    if (!menu) continue
    const options = (control.getAttribute('data-options') ?? '').split('|').filter(Boolean)
    control.addEventListener('click', () => {
      menu.innerHTML = ''
      for (const label of options) {
        const opt = document.createElement('div')
        opt.setAttribute('role', 'option')
        opt.textContent = label
        opt.addEventListener('click', () => {
          control.textContent = label
          control.setAttribute('data-value', label)
          menu.innerHTML = ''
          menu.hidden = true
        })
        menu.appendChild(opt)
      }
      menu.hidden = false
    })
  }
}
