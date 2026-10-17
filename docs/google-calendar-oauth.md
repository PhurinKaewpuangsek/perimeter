# Google Calendar sync (OAuth setup)

The **My Schedule** drawer has a "ซิงก์ Google Calendar" button that pushes every pinned
class/exam into the user's **primary** Google Calendar in one click. It runs entirely in the
browser using the Google Identity Services (GIS) token flow, so there is no backend piece:
no refresh token and no client secret are stored anywhere. The access token lives in memory
only and is gone on page reload.

The `.ics` download and per-event "Google Calendar" links keep working without any of this.

## How the sync behaves

- **Scope:** `https://www.googleapis.com/auth/calendar.events` (create/read/delete events).
- **No duplicates:** each pin is sent with `events.import` using the same `iCalUID` as the `.ics`
  UID (`<pinKey>@perimeter`), so pressing the button again updates the existing event.
- **Two-way for our own events:** every event is tagged with the private extended property
  `source=torch`. A sync lists only events carrying that tag and deletes the ones whose pin has
  been removed. Events the app did not create are never touched.
- **Classes** become weekly recurring events (semester dates from `frontend/src/config/semester.ts`);
  **exams** use their `event_date`. Exams without an announced date are skipped and reported.
- **Failures:** each item is attempted independently and a summary is shown
  ("เพิ่ม/อัปเดต X ลบ Y ล้มเหลว Z"). If the existing events cannot be listed, the delete step is
  skipped. The button is disabled while pins are loading or failed to load, so a failed fetch can
  never look like "no pins" and wipe synced events.
- **Denying consent** leaves the app usable; `.ics` and links still work.

## One-time setup (done by a maintainer in Google Cloud Console)

1. Create (or reuse) a Google Cloud project and enable the **Google Calendar API**.
2. **OAuth consent screen:** user type *External*, publishing status **Testing**, add the
   `.../auth/calendar.events` scope.
3. **Credentials → Create OAuth client ID → Web application.** Add **Authorized JavaScript
   origins** for every origin that serves the app:
   - `http://localhost:5173` (Vite dev)
   - the production site URL (the S3 website / CloudFront origin)

   No redirect URIs are needed for the GIS token flow.
4. Copy the **Client ID** (it is public, not a secret).
5. Set it:
   - **Production:** GitHub → Settings → Secrets and variables → Actions → *Variables* →
     `VITE_GOOGLE_CLIENT_ID`. `cd-frontend.yml` passes it to the build.
   - **Local:** put `VITE_GOOGLE_CLIENT_ID=...` in `frontend/.env.local`
     (`scripts/write-env.mjs` leaves lines it does not own untouched). See `frontend/.env.example`.

If the variable is unset the sync button is hidden and nothing else changes.

## Test users

While the consent screen is in *Testing* mode only listed accounts can sign in (limit: 100).
Add them under **OAuth consent screen → Test users**. That page is the source of truth for the
list. Real addresses are intentionally **not** committed, because this repository is public.

| Role | Who should be added |
| --- | --- |
| Development team | Every developer who tests the sync |
| Tech lead | Reviewer who verifies the issue's acceptance criteria |
| Course staff / TAs | Anyone demoing or grading the feature |
| Pilot students | Students invited to try it (10–20 is typical) |
