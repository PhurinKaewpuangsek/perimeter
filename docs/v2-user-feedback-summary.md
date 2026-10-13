# V2 User Feedback & Peer Testing Summary

> Project TORCH (Perimeter), CS361 V2 peer testing, Project 8. Date: 8 Oct 2026.
> Revised after code, CD-log and production-data inspection. Earlier drafts contained unverified theories; they are removed here.

## 1. Test results

Six tester sheets. Tasks: **TC1** admin updates a schedule, **TC2** search by course, **TC3** search exam/event.

| Tester | TC1 | TC2 | TC3 | Dev help |
|---|:---:|:---:|:---:|:---:|
| Jakkrapong Sunsalai | PASS | PASS | PASS (note) | No |
| Phonlakrit Chaimanee | PASS | PARTIAL | PASS | No |
| Chayanan Mariwan | PARTIAL | PASS | PASS | Yes (TC1) |
| Chayanon Puntuchoke | PASS | PARTIAL | PASS | No |
| Sirimongkol Dornsrikhot | FAIL | PASS | FAIL | Yes (TC1) |
| Tatchakrit Gike | PASS | PARTIAL | PASS | No |

Recurring comments: admin UI is cramped, hard to find, and the schedule view is hard to read; testers could not find a way back or into admin; a tester reported CS102 not found in a room.

## 2. Verified findings

### Major bugs (tracked as issues)

| Issue | Finding | Evidence |
|---|---|---|
| #91 | Course search (e.g. CS102) sometimes leads to rooms without that course; dev team sees it more on mobile than PC (hypothesis). Root cause **unknown**. | Tester reports + dev team. Production data is correct: CS102 exists in `LC3-121` and `LC3-122` (TUE/THU 11:00-12:30), 222 schedule items scanned in prod. |
| #90 | Console shows `map:1 ... 404 (Not Found)` when `/map` is opened directly. | CD verify log: S3 website endpoint serves the app for unknown paths with HTTP 404. |
| #89 | CD - Backend ends red after every deploy once admins edit data. | CD run 2026-10-06: deploy succeeded, but verify failed `SmartFacultySchedules holds 220, expected 219`. |

Order of work: **#89 first**; #90 and #91 are blocked by #89.

### Checked and not a bug
- Searching "exam"/"สอบ": seed has 10 exam rows, all with exam/สอบ in the name; no evidence of failure.
- Searching "SC3" returning ASC-coded courses: expected substring matching; works on PC.
- "Production tables vanished": false alarm. Prod is `ap-southeast-1` (Singapore); the console was on us-east-1. Stack `torch-v2` and both tables exist.

### Theories removed
- `RoomDetailModal` hiding schedules (the component is not used by any page; Landing links to `/map?room=&q=`).
- Mobile "ghost click" (selection fires on a single `onClick`).
- Missing `favicon.ico` as the 404 source.

## 3. UX/UI findings (out of scope for the bug-fix issues)

- No link to `/admin` from `/map`; admin login exists only on `/` and is hidden on mobile.
- No button to return to `/` from `/map`.
- Admin sidebar is narrow and visually cluttered; schedule view is dense.
- Search bar has no clear (X) button; results are hard to dismiss on mobile.

## 4. Feature backlog (not bugs)

- Real dates for exams/events (`event_date`), future event types beyond class/exam.

## 5. Tester questions (short answers)

- **Services used:** AWS SAM: S3 static site, API Gateway, Lambda (Node.js), DynamoDB on-demand (`SmartFacultyLocations`, `SmartFacultySchedules`).
- **Floor-plan data:** SVG floor plans plus extraction scripts in `tools/data-extraction/`, seeded from `lc3-locations.seed.json`.
- **Building scope:** LC3 (Lecture Complex 3), floors 1-2.
- **Other event types:** planned after V2.
