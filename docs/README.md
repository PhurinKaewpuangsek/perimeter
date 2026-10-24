# docs/ — เอกสารโครงการ Perimeter (Smart Faculty Navigator)

โฟลเดอร์นี้เก็บ **เอกสารอย่างเดียว** ทุกไฟล์เป็น Markdown (`.md`) ไม่มีโค้ดที่รันได้อยู่ในนี้

## กติกาของโฟลเดอร์นี้

| กติกา | รายละเอียด |
|---|---|
| นามสกุลไฟล์ | `.md` เท่านั้น (รูปภาพและไฟล์ต้นฉบับแผนผังสถาปัตยกรรมวางใน `docs/`) |
| ชื่อไฟล์ | ตัวพิมพ์เล็ก คั่นด้วย `-` เช่น `aws-cost-estimate.md` |
| Branch | ใช้ prefix `docs/` เช่น `docs/v4-docs-context` (ดู AGENTS.md) |
| Commit | ใช้ type `docs:` เช่น `docs: migrate docs to V4, rewrite README, create CONTEXT.md (#140)` |
| ภาษา | เขียนไทยได้ แต่ศัพท์เทคนิค/ชื่อ service ให้คงภาษาอังกฤษ |

## สารบัญเอกสารและสถาปัตยกรรม

| ไฟล์ / ผัง | เนื้อหา | สถานะ |
|---|---|---|
| [TorchV3_architecture.drawio.png](./TorchV3_architecture.drawio.png) | ภาพรวมสถาปัตยกรรม V3 ที่ deploy ทำงานอยู่ปัจจุบันบน AWS (S3, Cognito, Lambda, DynamoDB 3 ตาราง) | ใช้งานใน README หลัก (Current Deployed Stack) |
| [Perimeter_V4_architecture.drawio.png](./Perimeter_V4_architecture.drawio.png) | ภาพรวมสถาปัตยกรรม Perimeter V4 เป้าหมาย (เพิ่ม Lambda `get-graph`, `get-route`, `update-closure` และตาราง `SmartFacultyGraph`) | แผนภาพสถาปัตยกรรมเป้าหมาย V4 (Planned) |
| [Perimeter_V4_architecture.drawio](./Perimeter_V4_architecture.drawio) | ไฟล์ต้นฉบับไดอะแกรม Perimeter V4 สำหรับเปิดแก้ไขใน diagrams.net / draw.io | ไฟล์ต้นฉบับ V4 |
| [../CONTEXT.md](../CONTEXT.md) | คลังคำศัพท์โดเมนระบบ Perimeter (Domain Glossary) นิยามความหมาย คำศัพท์โค้ด และคำที่ควรหลีกเลี่ยงตามแนวทาง Matt Pocock | บังคับอ่านก่อนเริ่มงาน |
| [adr/0001-separate-graph-table.md](./adr/0001-separate-graph-table.md) | บันทึกการตัดสินใจทางสถาปัตยกรรม (ADR): การแยกตาราง `SmartFacultyGraph` ใน DynamoDB | ใช้งานได้ |
| [design/uber-designmd.md](./design/uber-designmd.md) | Design system source of truth (Light theme only, อิง DesignMD ของ Uber) พร้อม token mapping ของ frontend | ใช้งานได้ |
| [3d-map-preview.md](./3d-map-preview.md) | รายละเอียดและแนวทางการพัฒนาแผนที่ 3D Floor Plan (Three.js / WebGL / GLTF optimization) | ใช้งานได้ |
| [google-calendar-oauth.md](./google-calendar-oauth.md) | รายละเอียดขั้นตอนการตั้งค่า Google Calendar OAuth (GIS Token Flow) สำหรับระบบ My Schedule | ใช้งานได้ |
| [aws-cost-estimate.md](./aws-cost-estimate.md) | ประเมินและสรุปค่าใช้จ่าย AWS สำหรับนำเสนอ (สถาปัตยกรรม Serverless ภายใต้ Free Tier / Learner Lab) | เอกสารอ้างอิง |
| [TorchV2_architecture.drawio.png](./TorchV2_architecture.drawio.png) | ภาพรวมสถาปัตยกรรม V2 ช่วงโค้ดเนมเดิม (Serverless DynamoDB + Lambda Migration) | เก็บเป็นประวัติ |
| [TorchV1_architecture.drawio.png](./TorchV1_architecture.drawio.png) | ภาพรวมสถาปัตยกรรม V1 ช่วงโค้ดเนมเดิม (Legacy Express / Local JSON) | เก็บเป็นประวัติ |
| [v2-user-feedback-summary.md](./v2-user-feedback-summary.md) | สรุปผลการทดสอบ Peer Testing V2, รายการบั๊ก, ปัญหา UX/UI และผลการตรวจสอบ | เก็บเป็นประวัติ (V2) |
| [V2_user_feedback/](./V2_user_feedback/) | ไฟล์เอกสารและใบประเมินผลการทดสอบจากผู้ใช้งานจริงรอบ V2 | เก็บเป็นประวัติ (V2) |

## เอกสารที่กำลังพัฒนาตาม Milestone V4 (Wave 1 & 2)

- `scale-readiness.md` (#149) — บันทึกการตั้งค่า Caching, Throttling และ Concurrency ของ Lambda/DynamoDB
- `load-test-results.md` (#150) — ผลการทดสอบโหลดระยะสั้นและขีดจำกัดจริงของระบบ (System Limits)
