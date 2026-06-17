/**
 * Static fixture mimicking an Ashby application form. Selectors match
 * extension/src/configs/ashby.ts — a combined name field plus a react-select
 * work-authorization widget (`.rs-control` + `.rs-menu`, wired by
 * installReactSelectMock), exercising the react-select strategy on a second
 * board (spec §5.3).
 */
export const ashbyFixtureHtml = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Nimbus — Product Engineer · Ashby</title></head>
  <body>
    <h1>Product Engineer</h1>
    <div class="_description"><p>Build the apply pipeline. React, Supabase, Salesforce.</p></div>
    <form>
      <label>Name <input name="_systemfield_name" type="text" /></label>
      <label>Email <input name="_systemfield_email" type="email" /></label>
      <label>LinkedIn <input aria-label="LinkedIn URL" type="url" /></label>
      <div class="rs" data-field="work_auth">
        <span>Are you authorized to work in the US?</span>
        <div id="ashby_work_auth_control" class="rs-control" tabindex="0"
             data-options="Authorized to work in the US|Require sponsorship">Select…</div>
        <div class="rs-menu" hidden></div>
      </div>
      <label>Resume <input type="file" /></label>
      <button type="submit">Submit</button>
    </form>
  </body>
</html>`
