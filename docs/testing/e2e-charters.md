# E2E Exploratory Test Charters (Role × Flow, Time-Boxed) — #152

เอกสารนี้กำหนดขอบเขต (Scope) และชุด Charter สำหรับการทดสอบเชิงสำรวจแบบ End-to-End (E2E Exploratory Testing) ฝั่ง Frontend ควบคู่กับการตรวจสอบสถานะ Backend (AWS API Gateway / Lambda / DynamoDB / Cognito บน AWS Academy Learner Lab `dev` stack) เพื่อค้นหา Bug และ UX Flaw ก่อนการทดสอบกับผู้ใช้จริง (Real-User Testing #155 ในวันที่ 29–30 ต.ค. 2026)

---

## 1. กรอบเวลาและกติกาการทดสอบ (Time-Box & Rules)

- **ช่วงเวลาดำเนินการ (Time-Box รวม):** 1 วัน (ภายใน 24–26 ต.ค. 2026)
- **เวลาต่อ Charter:** ไม่เกิน **45 นาที** ต่อ 1 Charter (บันทึกเวลาเริ่ม–จบ และเวลาที่ใช้จริงใน [`docs/testing/e2e-session-log.md`](./e2e-session-log.md))
- **สภาพแวดล้อมทดสอบ (Test Environment):**
  - **Backend Stack:** AWS Academy Learner Lab (`us-east-1`, stack `torch-v2`, Cognito User Pool + DynamoDB `SmartFacultyLocations`, `SmartFacultySchedules`, `SmartFacultyPins`, `SmartFacultyGraph`)
  - **Frontend & Browser Matrix:**
    - ขนาดหน้าจอ: **Desktop (`1440×900`)** และ **Mobile (`375×812`)**
    - เบราว์เซอร์อย่างน้อย 2 ตัว (เช่น **Chromium** และ **Firefox / WebKit** ผ่าน Playwright E2E Runner)
- **รูปแบบประโยค Charter:**
  > **"สำรวจ [ฟีเจอร์/พื้นที่] ด้วย [ข้อมูล/มุมมอง/เทคนิค] เพื่อค้นหา [ความเสี่ยง/ปัญหาที่อาจซ่อนอยู่]"**

---

## 2. เมทริกซ์ความครอบคลุม Role × Flow

| Flow \ Role | `guest` (ไม่ล็อกอิน) | `user` (นักศึกษา/บุคลากรทั่วไป) | `staff` (เจ้าหน้าที่ดูแลห้อง/ตาราง) | `admin` (ผู้ดูแลระบบ) |
|---|---|---|---|---|
| **1. ค้นหา (วิชา / สอบ / ห้อง / กิจกรรม)** | **C-01** (EP/BVA, Responsive, Error Guessing) | **C-01** (ค้นหาหลังล็อกอิน + กด Pin จากผลลัพธ์) | **C-04** (`AdminSearchBox` ค้นหาห้อง/ตารางใน `/staff`) | **C-04**, **C-06** (ค้นหาใน `/staff` และ `/admin`) |
| **2. เปิดห้อง / ตารางรายสัปดาห์ (2D & 3D Map)** | **C-02** (State Transition, Responsive 375px, A11y) | **C-02** (ดูตารางเรียน/ตารางสอบ + สถานะ Pin) | **C-04** (เทียบข้อมูลที่แก้ใน `/staff` กับตารางบน `/map`) | **C-06** (ลบห้อง/ตารางแล้วตรวจผลบน `/map`) |
| **3. Pin + My Schedule + Export ปฏิทิน (.ics / Google)** | **C-03** (ตรวจการซ่อนปุ่ม Pin / Guard เมื่อไม่ล็อกอิน) | **C-03** (CRUD Pin, Orphaned Pin, State Transition, Export) | **C-03**, **C-04** (ผลกระทบต่อ Pin ของผู้ใช้เมื่อ Staff ย้ายห้อง/แก้เวลา) | **C-03**, **C-06** (ผลกระทบต่อ Pin เมื่อ Admin ลบตาราง/ห้อง/ผู้ใช้) |
| **4. Staff Pane (`/staff`: สร้าง/แก้ไข/ลบตาราง, แก้ห้อง)** | **C-07** (`RouteGuard` บล็อกเข้า `/staff` → `/login`) | **C-07** (`RouteGuard` บล็อก `user` เข้า `/staff` → `/map`) | **C-04** (CRUD Completeness), **C-05** (EP/BVA & Error Guessing), **C-08** (Mobile 375px & A11y) | **C-04**, **C-05**, **C-06** (สิทธิ์ลบตารางและ Danger Zone ลบห้อง) |
| **5. Admin จัดการผู้ใช้และข้อมูลอาคาร (`/admin`)** | **C-07** (`RouteGuard` บล็อกเข้า `/admin` → `/login`) | **C-07** (`RouteGuard` บล็อก `user` เข้า `/admin` → `/map`) | **C-07** (`RouteGuard` บล็อก `staff` เข้า `/admin` → `/map`) | **C-06** (CRUD ผู้ใช้/ข้อมูลอาคาร, Self/Last-Admin Guard), **C-08** (Mobile 375px & A11y) |
| **6. Login / First-Login Challenge (`/login` & Session)** | **C-07** (ล็อกอินผิด, บัญชีถูกระงับ, `NEW_PASSWORD_REQUIRED`) | **C-07** (ล็อกอินปกติ, Token หมดอายุ, Sign out) | **C-07** (สลับ Role / Sign out ระหว่างเปิดหน้า `/staff`) | **C-07** (สร้างผู้ใช้ใหม่ → ทดสอบ First-Login Challenge) |
| **7. นำทาง (Navigation UI — รอ #145)** | **C-09** *(Deferred รอ #145)* | **C-09** *(Deferred รอ #145)* | **C-09** *(Deferred รอ #145)* | **C-09** *(Deferred รอ #145)* |
| **8. ทางปิด / ปิดห้องชั่วคราว (Closures — รอ #147)** | **C-10** *(Deferred รอ #147)* | **C-10** *(Deferred รอ #147)* | **C-10** *(Deferred รอ #147)* | **C-10** *(Deferred รอ #147)* |

---

## 3. รายละเอียดเทคนิคการทดสอบที่ใช้ (Software Testing Techniques)

1. **CRUD Completeness (ความครบถ้วนของ Create / Read / Update / Delete และความสมบูรณ์ข้ามตาราง):**
   - ตรวจสอบทุก Entity (`Location/Room`, `Schedule/Event`, `Pin`, `User`, `Closure`) ว่ามี Create, Read, Update, Delete ครบตามที่ผู้ใช้แต่ละ Role ต้องใช้งานหรือไม่ หรือมีข้อจำกัดเชิงโครงสร้างแบบเดียวกับ #153 (ย้ายห้องไม่ได้) ซ่อนอยู่อีกหรือไม่
   - ตรวจสอบ **Cross-Entity Integrity**: เมื่อแก้ไขหรือลบข้อมูลต้นทาง (เช่น ย้ายห้อง/เปลี่ยนเวลาใน `SmartFacultySchedules` หรือลบห้องใน `SmartFacultyLocations`) ข้อมูลปลายทางที่อ้างอิงอยู่ (เช่น `SmartFacultyPins` ใน `MyScheduleDrawer` หรือตารางบน `/map`) อัปเดตตามอย่างถูกต้องหรือค้างเป็นข้อมูลกำพร้า (Orphaned/Stale Data)
2. **Equivalence Partitioning (EP) & Boundary Value Analysis (BVA):**
   - **เวลา (`start_time`, `end_time`):** `00:00`, `23:59`, `24:00`, `start_time == end_time`, `start_time > end_time` (เช่น `16:00` ถึง `09:00`), รูปแบบผิด (`25:99`, `9:00`, `abc`), คาบเวลาซ้อนทับกันในห้องเดียวกัน
   - **วันที่ (`event_date`):** วันที่ไม่มีจริง (`2026-02-30`), วันที่ในอดีต/อนาคตไกล, วันในสัปดาห์ (`day_of_week`) ขัดแย้งกับวันที่จริงของ `event_date` (เช่น เลือก `MON` แต่วันสอบคือวันพุธ), การเว้นว่าง `event_date` ใน `exam` เทียบกับ `other` และ `class`
   - **ข้อความ (`event_code`, `event_name`, `name_th`, คำค้นหา):** ค่าว่าง/ช่องว่างล้วน (`"   "`), ตัวพิมพ์เล็ก/ใหญ่ (`cs333` vs `CS333`), อักขระพิเศษที่เป็นตัวคั่นคีย์ (`#`, `/`, `%` ใน `event_code`), ภาษาไทย, ข้อความยาวมาก (500+ ตัวอักษร)
   - **ตัวเลข (`capacity`):** `0`, ค่าติดลบ (`-10`), ทศนิยม (`45.5`), การลบค่าออกเป็นช่องว่าง (`""` เพื่อล้างค่าความจุ), ตัวเลขขนาดใหญ่
3. **State Transition Testing:**
   - การเปลี่ยนสถานะ `guest` → `NEW_PASSWORD_REQUIRED` (First-login challenge) → `user`/`staff`/`admin` → Sign out
   - การเปิด `MyScheduleDrawer` หรือหน้า `/staff`, `/admin` ค้างไว้แล้วกด Sign out หรือปล่อยให้ Token หมดอายุ / ล้าง Session
   - การถูก Admin เปลี่ยน Role หรือระงับบัญชี (`enabled = false`) ขณะยังมี Session เปิดอยู่
   - ความสอดคล้องของสถานะข้อมูลเมื่อสลับหน้า `/staff` ↔ `/map` (ผลของ In-Memory Cache / LocalStorage Cache หลังทำรายการแก้ไข)
4. **Error Guessing:**
   - การกดปุ่ม Submit / Toggle ซ้ำอย่างรวดเร็ว (Double-click / Rapid-click บนปุ่มบันทึกตาราง, ปุ่มสลับสถานะผู้ใช้, ปุ่ม Pin)
   - การกดปุ่ม Back / Forward ของเบราว์เซอร์ หรือ Refresh (F5) กลางฟอร์ม / ระหว่างเปิด Modal
   - การปิดแล้วเปิด Modal ใหม่ (เช่น Modal เพิ่มผู้ใช้ใน `/admin`) ว่าล้างค่าและข้อความ Error เดิมหรือไม่
   - สถานะเครือข่ายออฟไลน์ / API ตอบกลับช้าหรือล้มเหลว (400, 403, 409, 500)
5. **Responsive / Cross-Device & Cross-Browser:**
   - เปรียบเทียบ **Mobile (`375×812`)** กับ **Desktop (`1440×900`)** ในทุก Route (`/`, `/login`, `/map`, `/staff`, `/admin`)
   - ตรวจการซ้อนทับของ Layer (z-index), การล้นหน้าจอแนวนอน (`overflow-x`), เมนูดรอปดาวน์ถูกตัดขอบ (Clipped Dropdown), และปุ่มควบคุมที่อาจถูกซ่อน (`hidden sm:flex`) จนใช้งานบนมือถือไม่ได้
   - ทดสอบบนเบราว์เซอร์ 2 ตัว (**Chromium** และ **Firefox**)
6. **Basic Accessibility (a11y):**
   - ลำดับการกดปุ่ม `Tab` (Tab Order), การผูก `<label htmlFor>` กับ `<input id>` หรือ `aria-label`
   - ปุ่มที่มีเฉพาะไอคอน (Icon-only buttons เช่น ปุ่มปิด `X`, ปุ่มลบ, ปุ่มย่อ Sidebar) ต้องมีชื่อที่ Screen Reader อ่านได้ (`aria-label`)
   - การทำงานของ Modal/Dialog (`role="dialog"`, `aria-modal="true"`, การกด `Escape` เพื่อปิด) และระดับความคมชัดของสี (Contrast)

---

## 4. รายการ Charters (Role × Flow)

### Charter C-01: การค้นหาห้อง วิชา ตารางสอบ และกิจกรรม (`guest`, `user`)
- **Charter Statement:**
  > สำรวจ **ระบบค้นหาบนหน้า `/` (Landing) และ `/map` (Search Bar & Dropdown Results)** ด้วย **คำค้นหาขอบเขต (EP/BVA: รหัสวิชาตัวพิมพ์เล็ก/ใหญ่, ช่องว่างหน้า-หลัง, ภาษาไทย, อักขระพิเศษ, ข้อความยาวมาก, รหัสสอบ)** เพื่อค้นหา **ความผิดพลาดในการกรองผลลัพธ์, การซิงก์ URL Query (`?q=`, `?room=`), และ UX บนมือถือ 375px**
- **Roles:** `guest`, `user`
- **Flows:** ค้นหา (วิชา/สอบ/ห้อง/กิจกรรม)
- **Techniques:** Equivalence Partitioning, Boundary Values, Error Guessing (Back/Forward), Responsive (`375px` vs `1440px`)
- **Time-Box:** ≤ 45 นาที

### Charter C-02: แผนที่ 2D/3D และการเปิดดูรายละเอียดห้อง/ตารางรายสัปดาห์ (`guest`, `user`)
- **Charter Statement:**
  > สำรวจ **แผนที่ 2D/3D, การสลับชั้น (Floor 1–3), และหน้าต่างรายละเอียดห้อง (`RoomDetailModal` / Mobile Bottom Sheet / `WeeklyTimetable`)** ด้วย **การสลับมุมมอง 2D↔3D, ข้อมูลตารางเรียน/สอบหลากหลายรูปแบบ และการย่อ/ขยายหน้าจอ** เพื่อค้นหา **บั๊กการแสดงผลตารางรายสัปดาห์, ข้อมูลที่สร้างจาก `/staff` แล้วไม่แสดงผลบน `/map`, และปัญหาการซ้อนทับบนมือถือ 375px**
- **Roles:** `guest`, `user`
- **Flows:** เปิดห้อง / ตารางรายสัปดาห์
- **Techniques:** State Transition, Responsive (`375px` vs `1440px`), Cross-Browser (Chromium & Firefox), Basic A11y
- **Time-Box:** ≤ 45 นาที

### Charter C-03: การปักหมุด (Pin), My Schedule Drawer และการส่งออกปฏิทิน (`guest`, `user`, `staff`)
- **Charter Statement:**
  > สำรวจ **ระบบ Pin ตารางเรียน/สอบ, หน้าต่าง `MyScheduleDrawer`, และฟีเจอร์ส่งออก `.ics` / Google Calendar** ด้วย **การกด Pin/Unpin ซ้ำเร็ว ๆ, การย้ายห้อง/แก้ไข/ลบตารางต้นทางที่ถูก Pin ไว้, และการกดออกจากระบบขณะเปิด Drawer** เพื่อค้นหา **ปัญหา Orphaned/Stale Pins, Race Condition, และ State ค้างหลังออกจากระบบ**
- **Roles:** `guest` (ตรวจสิทธิ์), `user`, `staff`
- **Flows:** Pin + My Schedule + Export ปฏิทิน
- **Techniques:** CRUD Completeness, Cross-Entity Integrity, State Transition, Error Guessing
- **Time-Box:** ≤ 45 นาที

### Charter C-04: Staff Pane — ความครบถ้วนของ CRUD ห้องและตารางกิจกรรม (`staff`, `admin`)
- **Charter Statement:**
  > สำรวจ **หน้า `/staff` (`AdminPage`: แท็บจัดการห้องและแท็บจัดการตารางสอน/สอบ)** ด้วย **การตรวจสอบ CRUD Completeness ของทุกฟิลด์ (การแก้ไขชื่อห้อง/การล้างค่าความจุ, การสร้างตารางแต่ละประเภท `lecture`/`lab`/`exam`/`other`, การย้ายห้อง #153, การลบตารางโดย Staff vs Admin) และการตรวจผลลัพธ์ทันทีบน `/map`** เพื่อค้นหา **ช่องโหว่ CRUD ที่ทำให้แก้ไข/ลบข้อมูลไม่ได้, ข้อมูลไม่ปรากฏบนหน้าแผนที่, และปัญหา Stale Cache 60 วินาที**
- **Roles:** `staff`, `admin`
- **Flows:** Staff Pane (สร้าง/แก้ไข/ลบตาราง, แก้ห้อง) + เปิดห้องบน `/map`
- **Techniques:** CRUD Completeness, State Transition (Cache Sync `/staff` ↔ `/map`)
- **Time-Box:** ≤ 45 นาที

### Charter C-05: Staff Pane — ขอบเขตข้อมูล (EP/BVA) และการเดาข้อผิดพลาดในฟอร์มตาราง/ห้อง (`staff`)
- **Charter Statement:**
  > สำรวจ **ฟอร์มสร้างและแก้ไขตาราง/ห้องใน `/staff`** ด้วย **ค่าขอบเขตและค่าผิดปกติ (เวลา `00:00`, `23:59`, `24:00`, `start >= end`, เวลาเป็นข้อความ, วันที่ `2026-02-30`, วันสอบไม่ตรงกับ `day_of_week`, รหัสวิชาที่มี `/` หรือ `#` หรือช่องว่างล้วน, ความจุติดลบ/ทศนิยม, ชื่อยาว 500+ ตัวอักษร)** เพื่อค้นหา **ช่องโหว่ Validation ที่ปล่อยให้ข้อมูลพังลงฐานข้อมูล DynamoDB หรือทำให้แก้ไข/ลบแถวนั้นไม่ได้อีก**
- **Roles:** `staff`
- **Flows:** Staff Pane (สร้าง/แก้ไขตาราง, แก้ห้อง)
- **Techniques:** Equivalence Partitioning, Boundary Value Analysis, Error Guessing
- **Time-Box:** ≤ 45 นาที

### Charter C-06: Admin Management — การจัดการผู้ใช้ สิทธิ์ และข้อมูลอาคาร (`admin`)
- **Charter Statement:**
  > สำรวจ **หน้า `/admin` (`AdminManagementPage`: แท็บจัดการผู้ใช้และสิทธิ์ และแท็บจัดการข้อมูลอาคาร)** ด้วย **การสร้างผู้ใช้ใหม่, เปลี่ยน Role, ระงับ/เปิดบัญชี, ลบผู้ใช้ (รวมถึงกดซ้ำ/ปิด-เปิด Modal ใหม่), และการลบห้อง/ตาราง** เพื่อค้นหา **ปัญหา CRUD ผู้ใช้ไม่ครบ (เช่น รีเซ็ตรหัสผ่านไม่ได้), สเตตค้างใน Modal, Race Condition เมื่อกดสลับสถานะรัว ๆ, และผลกระทบต่อข้อมูล Pin เมื่อลบห้อง/ตาราง/ผู้ใช้**
- **Roles:** `admin`
- **Flows:** Admin จัดการผู้ใช้ + จัดการข้อมูลอาคาร
- **Techniques:** CRUD Completeness, Error Guessing (Double-Click, Modal Reset), State Transition
- **Time-Box:** ≤ 45 นาที

### Charter C-07: การยืนยันตัวตน, First-Login Challenge และการป้องกัน Route (`guest`, `user`, `staff`, `admin`)
- **Charter Statement:**
  > สำรวจ **หน้า `/login`, ขั้นตอนเปลี่ยนรหัสผ่านครั้งแรก (`NEW_PASSWORD_REQUIRED`), และ `RouteGuard` บน `/staff` และ `/admin`** ด้วย **การเข้าถึง URL โดยตรงในแต่ละ Role, รหัสผ่านใหม่ที่ไม่ผ่านเกณฑ์ Cognito, และการหมดอายุของ Session / การลบ Session ระหว่างเปิดหน้าจัดการ** เพื่อค้นหา **ข้อความแจ้งเตือนภาษาอังกฤษดิบจาก Cognito, หน้าจอค้างหลัง Session หมดอายุ, และช่องโหว่การเปลี่ยนสถานะผู้ใช้**
- **Roles:** `guest`, `user`, `staff`, `admin`
- **Flows:** Login / First-Login Challenge + Route Protection
- **Techniques:** State Transition, Equivalence Partitioning (Password Policy), Error Guessing
- **Time-Box:** ≤ 45 นาที

### Charter C-08: การแสดงผลบนมือถือ (Responsive 375px) และ Accessibility พื้นฐานทุกหน้า (`guest`, `user`, `staff`, `admin`)
- **Charter Statement:**
  > สำรวจ **ทุกหน้าหลัก (`/`, `/login`, `/map`, `/staff`, `/admin`) บนขนาดหน้าจอมือถือ `375×812` เปรียบเทียบกับ Desktop `1440×900` และตรวจสอบด้วย Keyboard / Accessibility Tree** ด้วย **การสลับหน้างาน (Workspace Switcher), การย่อ/ขยาย Sidebar บน `/staff`, การเปิด Dropdown ในตาราง `/admin`, การกด `Tab` / `Escape`, และการตรวจ `<label>` / `aria-label` / Contrast** เพื่อค้นหา **จุดที่ผู้ใช้มือถือถูกบล็อกจนใช้งานไม่ได้ และปัญหาการเข้าถึงพื้นฐาน (a11y)**
- **Roles:** `guest`, `user`, `staff`, `admin`
- **Flows:** ทุก Flow บน Mobile `375px` vs Desktop `1440px`
- **Techniques:** Responsive / Device Testing, Basic Accessibility (a11y)
- **Time-Box:** ≤ 45 นาที

---

### Charters ที่รอดำเนินการเมื่อฟีเจอร์พร้อม (Deferred / Blocked by Open Issues)

- **Charter C-09 (รอ #145 — Navigation UI):**
  > สำรวจ **UI การเลือกจุดเริ่มต้น/ปลายทาง และการวาดเส้นทางนำทางบนแผนที่ 2D/3D** ด้วย **ห้องต้นทาง/ปลายทางคนละชั้น, ห้องที่ไม่พบในกราฟ (`UNKNOWN_LOCATION`), และจุดหมายที่เป็นทางตัน (`NO_PATH`)** เพื่อค้นหา **ความผิดพลาดของการแสดงเส้นทางและการแจ้งเตือนผู้ใช้**
  - *สถานะปัจจุบัน:* Backend `GET /api/graph` และ `GET /api/route` (#144) พร้อมแล้วในโค้ด แต่ Frontend UI (#145) ยังเปิดอยู่และยังไม่ได้ merge เข้า `main`
- **Charter C-10 (รอ #147 — Closure Status & Staff Toggle):**
  > สำรวจ **การตั้งเวลาปิดห้อง/ทางเดินชั่วคราวใน `/staff` และผลต่อการค้นหา/นำทาง (#148)** ด้วย **ช่วงเวลาเริ่ม/สิ้นสุด (`closed_from` / `closed_until`), เขตเวลา `+07:00`, และการปิดทางเดินหลักระหว่างมีกิจกรรม** เพื่อค้นหา **บั๊กการคำนวณเส้นทางเลี่ยงทางปิดและ UX การแก้ไข/ยกเลิกสถานะปิด**
  - *สถานะปัจจุบัน:* #147 และ #148 ยังเปิดอยู่และยังไม่ได้ merge เข้า `main`

---

## 5. สิ่งที่อยู่นอกขอบเขต (Out of Scope)

เพื่อป้องกัน Scope Drift ระหว่างการทำ Time-Boxed Exploratory Testing รายการต่อไปนี้ถือว่า **อยู่นอกขอบเขตของ #152**:
1. **การทดสอบประสิทธิภาพและภาระงาน (Load / Stress / Performance Testing):** แยกไปดำเนินการใน **#150** (`docs: short load test and documented system limits`)
2. **การเขียนชุดทดสอบอัตโนมัติถาวรสำหรับ Regression TC1/TC2:** แยกไปดำเนินการใน **#154** (`testing: Playwright E2E for TC1/TC2 regression`)
3. **การทดสอบกับผู้ใช้จริงในอาคาร LC-3:** แยกไปดำเนินการใน **#155** (`testing: run real-user tests on 29-30 Oct`) และสรุปผลใน **#156**
4. **การแก้ไขโค้ด (Bug Fixing) ใน PR นี้:** งาน #152 มีผลลัพธ์เป็น **เอกสาร (`docs/testing/e2e-charters.md`, `docs/testing/e2e-session-log.md`) และ GitHub Issues รายงานบั๊กเท่านั้น** ห้ามแก้ไขโค้ดแอพพลิเคชันในกิ่ง `testing/e2e-charters`
5. **การเจาะระบบความปลอดภัยเชิงลึกของ AWS IAM / Lambda Infrastructure:** ยกเว้นกรณีที่ส่งผลกระทบโดยตรงต่อ Validation/UX ของผู้ใช้ผ่าน API ปกติ
6. **การทดสอบ E2E ของ UI นำทาง (#145) และ UI ปิดทางเดิน (#147):** บันทึกเป็น Deferred Charter (C-09, C-10) เนื่องจากฟีเจอร์ยังไม่ถูก merge เข้า `main` ณ วันที่ทดสอบ (26 ต.ค. 2026)

