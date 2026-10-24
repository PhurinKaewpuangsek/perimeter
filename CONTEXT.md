# Perimeter Domain Context

Perimeter — Smart indoor map navigator and scheduling system for Faculty of Science and Technology (LC-3 building, Thammasat University).

## Language

### Physical Space & Navigation

**Location**:
A designated physical point of interest, room, entrance, or facility within the LC-3 building possessing fixed floor plan coordinates.
- _Code identifiers_: `location_id`, `room_code`, `room_name`, `floor`, `category`, `capacity`, `coordinates`
- _Avoid_: Spot, venue, place

**Room**:
An enclosed educational, instructional, laboratory, or administrative space within the facility.
- _Code identifiers_: `room_code` (e.g. `LC3-103`), `room_name`, `location_id`
- _Avoid_: Classroom (when referring generically to any room), hall, chamber

**Graph Node**:
A discrete topological vertex representing a room entrance, corridor junction, stairs landing, or facility waypoint in the building routing graph.
- _Code identifiers_: `element_id` (`NODE#<node_id>`), `node_id`, `floor`, `x`, `y`, `node_type`, `location_id`
- _Avoid_: Vertex, waypoint, point

**Graph Edge**:
A walkable bidirectional pathway segment connecting two adjacent graph nodes with a calculated travel distance.
- _Code identifiers_: `element_id` (`EDGE#<from>|<to>`), `from`, `to`, `distance`, `edge_type`
- _Avoid_: Link, line, connection, pathway

**Route**:
An ordered, navigable sequence of graph nodes calculated from a specified origin to a destination that avoids active closures.
- _Code identifiers_: `found` (boolean), `distance`, `floors`, `path` (`[{ node_id, floor, x, y, location_id? }]`), `closures_avoided`
- _Avoid_: Path (for the overall journey), trip, trail, direction

**Closure**:
A temporary administrative restriction marking a room node or walkway edge as impassable during a specified time window.
- _Code identifiers_: `closed` (boolean), `closed_from`, `closed_until`, `closed_reason`, `closed_by`
- _Avoid_: Blocked, barricade, outage, locked, disabled, shut down

**Availability Window**:
The temporal validity interval (`closed_from` to `closed_until`) during which a room or walkway closure is actively enforced.
- _Code identifiers_: `closed_from` (ISO-8601 string with timezone offset), `closed_until` (ISO-8601 string with timezone offset)
- _Avoid_: Downtime window, blocked period, maintenance schedule

### Scheduling & Timetables

**Schedule Slot**:
A recurring weekly or single-instance reservation of a room for an academic lecture, lab, examination, or event.
- _Code identifiers_: `schedule_slot` (e.g. `MON_09:00_10:30`), `day_of_week`, `start_time`, `end_time`, `room_code`
- _Avoid_: Reservation, booking, period, session

**Event**:
A scheduled campus occurrence occupying a room slot, typed specifically as a lecture class, examination, or faculty event.
- _Code identifiers_: `event_type` (`'class'` | `'exam'` | `'other'`), `event_code`, `event_name`, `instructor`
- _Avoid_: Happening, session, meeting

**Exam**:
A formal, dated academic evaluation event tied to a course code and assigned to a specific room and calendar date.
- _Code identifiers_: `event_type: 'exam'`, `event_date` (`YYYY-MM-DD`), `start_time`, `end_time`, `room_code`
- _Avoid_: Test, midterm, final, quiz

**Pin**:
A user-specific bookmark linking an authenticated account to a selected room schedule slot.
- _Code identifiers_: `pin_id` (`user_id#room_code#schedule_slot`), `room_code`, `schedule_slot`, `user_id` (or `sub`)
- _Avoid_: Bookmark, favorite, star, saved slot

### Identity & Access Control

**Role**:
A principal authorization level governing user permissions, UI management capabilities, and API route access.
- _Code identifiers_: `guest`, `user`, `staff`, `admin` (Cognito User Pool groups: `user`, `staff`, `admin`)
- _Avoid_: Permission tier, user type, account tier

**Guest**:
An unauthenticated visitor with public read access to interactive 2D/3D maps, public schedules, and navigation routes.
- _Code identifiers_: Unauthenticated request (no JWT token provided)
- _Avoid_: Anonymous, stranger, public user

**User**:
An authenticated individual authorized to pin schedule slots to a personal timetable and sync with Google Calendar.
- _Code identifiers_: Cognito group `user` (JWT `claims.sub`, `cognito:groups`)
- _Avoid_: Member, student (as a role name), standard user

**Staff**:
An authorized department faculty or staff member with permission to edit rooms, update schedules, and toggle closures.
- _Code identifiers_: Cognito group `staff`
- _Avoid_: Teacher, instructor, operator

**Admin**:
A system administrator holding comprehensive permissions to manage user accounts, assign roles, and perform deletions.
- _Code identifiers_: Cognito group `admin`
- _Avoid_: Superuser, root, webmaster
