# AI UAT — Ad-Hoc Claude Code Chrome Extension Prompts

Use these prompts with the **Claude Code Chrome extension** to explore and test
BKT AI-Apply as a real user would. Open the app in Chrome, open the extension,
and paste any prompt below. No code required — Claude drives the browser for you.

---

## 1. Smoke Test (2 min, no login)

```
Take a screenshot of the current page, then navigate to https://bkt-ai-apply.vercel.app
and test the following:

1. Does the page load without errors?
2. Does it redirect to /login when I'm not authenticated?
3. Do the email field, password field, and Sign In button all render correctly?
4. Is there any visible JS error, broken layout, or console error?

Try submitting the login form with fake credentials (test@test.com / wrongpassword).
Does an appropriate error message appear?

Report each item as PASS / FAIL with a screenshot of any failure.
```

---

## 2. Full Login + Navigation Flow (5 min)

```
Test the complete login and navigation flow on https://bkt-ai-apply.vercel.app

Log in with: [YOUR-TEST-EMAIL] / [YOUR-TEST-PASSWORD]

After logging in:
1. What page does the app land on? Take a screenshot.
2. Navigate to the Pipeline page. Does it load? Any errors?
3. Navigate to the Prospector page. Does it load? Any job cards visible?
4. Navigate to Settings. Does it render without errors?
5. Go back to the Pipeline page. Does navigation feel snappy or laggy?

For each page: take a screenshot and note any broken UI, missing content, or
error messages. Rate the experience: PASS / PARTIAL / FAIL.
```

---

## 3. Pipeline Deep Dive (5 min)

```
You are a QA engineer exploring the Pipeline page of https://bkt-ai-apply.vercel.app

Log in with: [YOUR-TEST-EMAIL] / [YOUR-TEST-PASSWORD]
Navigate to the Pipeline page.

Explore and report on:
- What stage columns are visible? (Expected: Discovery, Applied, Screening,
  Interview Scheduled, Interview Complete, Offer, Hired, Rejected, Ghosted)
- Are application cards rendering with title, company, stage, and any metadata?
- Is there a proper empty state if no applications exist?
- Click on any application card — does a detail panel or modal open?
- Are there any create/add buttons? What happens when you click them?
- Any broken layout, overflow, or visual glitches?

Screenshot everything interesting. Provide a P0/P1/P2 severity rating for each issue.
```

---

## 4. AI Chat Interaction (5 min)

```
Test the AI assistant chat feature on https://bkt-ai-apply.vercel.app

Log in with: [YOUR-TEST-EMAIL] / [YOUR-TEST-PASSWORD]

Find and open the AI chat panel (may be in a sidebar or floating button).

1. Send the message: "Hello! What can you help me with?"
   - Did the AI respond? How long did it take?
   - Was the response coherent and relevant to a job application tool?

2. Send: "How do I move an application to the Interview stage?"
   - Is the answer accurate? Does it reflect how the app actually works?

3. Press Ctrl+Enter in the chat input — does it send the message or insert a newline?
   (Expected: sends the message, no newline inserted)

4. Are there any errors, loading failures, or broken states in the chat UI?

Screenshot the chat in action. Rate: PASS / FAIL for each check.
```

---

## 5. UI/UX Visual Audit (10 min)

```
Perform a comprehensive UI/UX audit of https://bkt-ai-apply.vercel.app

Log in with: [YOUR-TEST-EMAIL] / [YOUR-TEST-PASSWORD]
Visit every page: Pipeline, Prospector, AI Chat, Settings.

For each page, check:
TYPOGRAPHY
- Are headings, labels, and body text visually consistent?
- Any text that's too small, too close together, or overlapping?

SPACING & LAYOUT
- Are cards, buttons, and form elements consistently spaced?
- Any elements that overflow their containers or get cut off?
- Does the layout work at 1280px wide? Any awkward gaps or crowding?

INTERACTIVE STATES
- Hover over buttons — do they show a visual hover state?
- Are disabled elements clearly distinguishable?
- Are form inputs styled consistently?

LOADING & EMPTY STATES
- Is there a loading spinner when data is fetching?
- Is there a meaningful empty state if a page has no data?

COLOR & CONTRAST
- Is all text readable against its background?
- Any elements that seem off-brand or inconsistent in color?

Screenshot every issue found. Provide a severity (P0 = broken, P1 = significant, P2 = minor cosmetic).
```

---

## 6. Post-Deploy Regression Check (3 min)

```
Quick post-deploy regression check on https://bkt-ai-apply.vercel.app

Log in with: [YOUR-TEST-EMAIL] / [YOUR-TEST-PASSWORD]

Verify the following and report PASS / FAIL for each:
1. [ ] Login succeeds and lands on the main authenticated page
2. [ ] Pipeline page loads (with cards OR a proper empty state, no error screen)
3. [ ] Prospector page loads without errors
4. [ ] AI chat panel opens and the input field accepts text
5. [ ] Navigating between all pages works (no 404s, blank screens, or crashes)
6. [ ] No console errors appear during normal usage

If any FAIL: screenshot the issue and describe what's broken.
This should take under 3 minutes.
```

---

## 7. Bug Investigation

```
Investigate this reported bug on https://bkt-ai-apply.vercel.app

[PASTE BUG DESCRIPTION HERE]

Steps:
1. Log in with: [YOUR-TEST-EMAIL] / [YOUR-TEST-PASSWORD]
2. Follow the exact steps to reproduce the bug
3. Screenshot the failing state
4. Open DevTools Console — are there any errors when it fails?
5. Try any obvious workarounds

Report:
- Can you reproduce it? (Yes / No / Intermittent)
- What exactly happens vs. what should happen?
- Relevant console errors or network failures?
- Likely root cause (if obvious)?
- Suggested fix priority (P0/P1/P2)?
```

---

## Tips for Chrome Extension Testing

- **Set a real test user**: Create a dedicated Supabase auth account for testing.
  Never use your own account — UAT tests may create/modify data.
- **Use DevTools Console**: Ask Claude to "check the browser console for errors" at
  any point. Network tab is also useful: "check for any failed API requests."
- **Attach screenshots**: The extension can take screenshots and annotate them.
  Ask: "screenshot this and circle the broken element."
- **Compare dev vs prod**: Run the same prompt against both
  `https://vigilant-space-adventure-pjp4vv9vvvrv264vp-5173.app.github.dev` (dev)
  and `https://bkt-ai-apply.vercel.app` (prod) to catch deployment-only bugs.
