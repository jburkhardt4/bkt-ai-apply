/**
 * Static fixture mimicking Greenhouse's NEW "job-boards" (Remix) application
 * template — the one in the live NeuraFlash UAT (Jam 2e14758d). Unlike the
 * classic fixture (greenhouse.ts, semantic ids like `#first_name`), this template
 * keys EVERY field by an opaque `#question_<id>` and renders dropdowns as
 * react-select widgets keyed by question-id — so the config's semantic selectors
 * MISS and the only durable locator is each field's visible <label> text. This
 * fixture exercises the B5 label-text fallback matcher (autofill.ts).
 *
 * The react-select controls carry `.select__control` (real-world class, how the
 * matcher locates them) AND `.rs-control` + `data-options` (so installReactSelectMock
 * wires their option menus deterministically). No network/auth/CORS (spec §5.3).
 */
export const greenhouseQuestionIdsFixtureHtml = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>NeuraFlash — Salesforce Consultant</title></head>
  <body>
    <h1 class="app-title">Salesforce Consultant</h1>
    <form id="application_form">
      <div class="field">
        <label for="question_17770736004">First name*</label>
        <input id="question_17770736004" type="text" />
      </div>
      <div class="field">
        <label for="question_17770736005">Last name*</label>
        <input id="question_17770736005" type="text" />
      </div>
      <div class="field">
        <label for="question_17770736006">Email*</label>
        <input id="question_17770736006" type="email" />
      </div>
      <div class="field">
        <label for="question_17770736007">Phone*</label>
        <input id="question_17770736007" type="tel" />
      </div>
      <div class="field">
        <label for="question_17770736010">Please insert your LinkedIn profile link here.*</label>
        <input id="question_17770736010" type="text" />
      </div>

      <!-- State of residence — react-select keyed by an opaque question id. -->
      <div class="field">
        <label for="rs-state-input">In which state do you currently reside?*</label>
        <div id="state_rs" class="select__control rs-control" tabindex="0"
             data-options="California|Texas|New York|Florida">
          <div class="select__input-container"><input id="rs-state-input" class="select__input" /></div>
          <span class="select__placeholder">Select...</span>
        </div>
        <div class="rs-menu" hidden></div>
      </div>

      <!-- EEO / voluntary self-identification — sensitive (BR-156). A "Gender"
           label IS present, but eeo_gender is flagged sensitive, so the matcher
           must NEVER auto-locate it; it stays for the human to complete. -->
      <div class="field">
        <label for="rs-gender-input">Gender</label>
        <div id="gender_rs" class="select__control rs-control" tabindex="0"
             data-options="Female|Male|Non-binary|Decline to self-identify">
          <div class="select__input-container"><input id="rs-gender-input" class="select__input" /></div>
          <span class="select__placeholder">Select...</span>
        </div>
        <div class="rs-menu" hidden></div>
      </div>

      <button type="submit" id="submit-button">Submit Application</button>
    </form>
  </body>
</html>`
