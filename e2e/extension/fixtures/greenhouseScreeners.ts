/**
 * Static fixture for the B4 Master Answers Library pass (autofill.ts).
 *
 * Mirrors the live UAT (Jam 08627082): a Greenhouse job-boards form whose custom
 * screeners are opaque `#question_<id>` fields — a text "years of experience", a
 * react-select "2+ years?" Yes/No, and a sensitive "desired salary" text. None
 * have a stable selector, so the only durable locator is each question's visible
 * <label> text, matched against the stored answer's question_label. The salary
 * field proves the review-gate: a sensitive answer is NEVER auto-filled (BR-156).
 *
 * The react-select carries `.select__control` + `.rs-control` + `data-options` so
 * installReactSelectMock wires its menu (same convention as greenhouseQuestionIds).
 */
export const greenhouseScreenersFixtureHtml = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Tech Holding — Salesforce Architect</title></head>
  <body>
    <form id="application_form">
      <div class="field">
        <label for="question_700001">Years of professional Salesforce experience?*</label>
        <input id="question_700001" type="text" />
      </div>

      <div class="field">
        <label for="rs-sf2-input">Do you have 2+ years of Salesforce experience?*</label>
        <div id="sf2_rs" class="select__control rs-control" tabindex="0" data-options="Yes|No">
          <div class="select__input-container"><input id="rs-sf2-input" class="select__input" /></div>
          <span class="select__placeholder">Select...</span>
        </div>
        <div class="rs-menu" hidden></div>
      </div>

      <!-- Sensitive: desired salary. A label + value exist, but the matcher must
           hold it for the human — never auto-filled (BR-156). -->
      <div class="field">
        <label for="question_700003">Desired annual base salary*</label>
        <input id="question_700003" type="text" />
      </div>

      <button type="submit" id="submit-button">Submit Application</button>
    </form>
  </body>
</html>`
