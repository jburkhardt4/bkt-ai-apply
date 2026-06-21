/**
 * Static fixture for the B7 native quick-apply detector (nativeApply.ts).
 *
 * Mirrors the live NeuraFlash UAT (Jam 2e14758d): a Greenhouse job-boards form
 * that ALSO offers Greenhouse's account-based accelerator, "Quick Apply with
 * MyGreenhouse" — the button JB clicked to fill the fields our macro couldn't.
 * Includes a plain "Submit Application" button as a negative control (it must
 * NOT be mistaken for a native quick-apply). No network / auth / OAuth — clicking
 * is never exercised (the detector is read-only; spec §5.3).
 */
export const nativeApplyFixtureHtml = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>NeuraFlash — Salesforce Consultant</title></head>
  <body>
    <h1 class="app-title">Salesforce Consultant</h1>
    <form id="application_form">
      <!-- Account-based accelerator (the one JB used in the UAT). Detected, never
           clicked — signing in is the human's to do (BR-151). -->
      <button type="button" id="mygreenhouse-btn">Quick Apply with MyGreenhouse</button>

      <div class="field">
        <label for="email">Email*</label>
        <input id="email" type="email" />
      </div>

      <!-- Negative control: a normal submit, NOT a native quick-apply. -->
      <button type="submit" id="submit-button">Submit Application</button>
    </form>
  </body>
</html>`
