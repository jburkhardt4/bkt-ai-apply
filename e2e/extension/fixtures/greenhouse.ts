/**
 * Static fixture mimicking a Greenhouse application form. Selectors match
 * extension/src/configs/greenhouse.ts so the autofill macro can be tested
 * deterministically with no network, auth, or CORS (spec §5.3). Exported as a
 * string and loaded via Playwright `page.setContent`.
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
      <label>Email <input id="email" name="email" type="email" /></label>
      <label>Phone <input id="phone" name="phone" type="tel" /></label>
      <label>LinkedIn
        <input id="linkedin" name="job_application[urls][LinkedIn]" type="url" />
      </label>
      <label>Resume
        <input id="resume" name="job_application[resume]" type="file" />
      </label>
      <label>Work authorization
        <select id="work_authorization">
          <option value="">Select…</option>
          <option value="yes">Authorized to work in the US</option>
          <option value="no">Not authorized</option>
        </select>
      </label>
      <button type="submit" id="submit_app">Submit Application</button>
    </form>
  </body>
</html>`
