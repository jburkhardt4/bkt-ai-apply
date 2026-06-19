/**
 * Static fixture mimicking a Greenhouse application form. Selectors match
 * extension/src/configs/greenhouse.ts. The work-authorization field is a
 * react-select-style widget (`.rs-control` + `.rs-menu`) wired by
 * installReactSelectMock in the spec. No network, auth, or CORS (spec §5.3).
 */
export const greenhouseFixtureHtml = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Philo — Senior Software Engineer</title></head>
  <body>
    <h1 class="app-title">Senior Software Engineer</h1>
    <div id="content">
      <p>We are hiring a Senior Software Engineer with strong Salesforce and React
      experience to build our applicant pipeline. Apex, LWC, and API integration a plus.</p>
    </div>
    <form id="application_form">
      <label>First name <input id="first_name" name="first_name" type="text" /></label>
      <label>Last name <input id="last_name" name="last_name" type="text" /></label>
      <label>Preferred name <input id="preferred_name" name="preferred_name" type="text" /></label>
      <label>Email <input id="email" name="email" type="email" /></label>
      <label>Phone <input id="phone" name="phone" type="tel" /></label>
      <label>LinkedIn
        <input id="linkedin" name="job_application[urls][LinkedIn]" type="url" />
      </label>
      <label>Website
        <input name="job_application[urls][Website]" type="url" />
      </label>
      <label>Location <input id="job_application_location" name="job_application[location]" type="text" /></label>
      <label>Resume
        <input id="resume" name="job_application[resume]" type="file" />
      </label>
      <label>Cover letter
        <input id="cover_letter" name="job_application[cover_letter]" type="file" />
      </label>
      <div class="rs" data-field="work_auth">
        <span>Work authorization</span>
        <div id="work_auth_control" class="rs-control" tabindex="0"
             data-options="Authorized to work in the US|Not authorized">Select…</div>
        <div class="rs-menu" hidden></div>
      </div>
      <div class="rs" data-field="requires_sponsorship">
        <span>Will you now or in the future require sponsorship?</span>
        <div id="sponsorship_control" class="rs-control" tabindex="0"
             data-options="Yes|No">Select…</div>
        <div class="rs-menu" hidden></div>
      </div>
      <div class="rs" data-field="eeo_gender">
        <span>Gender</span>
        <div id="gender_control" class="rs-control" tabindex="0"
             data-options="Female|Male|Non-binary|Decline to self-identify">Select…</div>
        <div class="rs-menu" hidden></div>
      </div>
      <button type="submit" id="submit_app">Submit Application</button>
    </form>
  </body>
</html>`
