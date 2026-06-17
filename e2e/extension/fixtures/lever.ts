/**
 * Static fixture mimicking a Lever application form. Selectors match
 * extension/src/configs/lever.ts — notably the single combined `name` field
 * (vs Greenhouse's first/last), to verify the config-driven macro handles a
 * different field shape (spec §5.3).
 */
export const leverFixtureHtml = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Acme — Staff Engineer · Lever</title></head>
  <body>
    <div class="content">
      <div class="posting-headline"><h2>Staff Engineer</h2></div>
      <div class="posting-description"><p>Own our platform. Salesforce + React a plus.</p></div>
    </div>
    <form>
      <label>Full name <input name="name" type="text" /></label>
      <label>Email <input name="email" type="email" /></label>
      <label>Phone <input name="phone" type="tel" /></label>
      <label>LinkedIn URL <input name="urls[LinkedIn]" type="url" /></label>
      <label>Resume <input name="resume" type="file" /></label>
      <button type="submit" class="template-btn-submit">Submit application</button>
    </form>
  </body>
</html>`
