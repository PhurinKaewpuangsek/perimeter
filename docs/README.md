# docs/ — เอกสารโครงการ TORCH (Smart Faculty Navigator)

โฟลเดอร์นี้เก็บ **เอกสารอย่างเดียว** ทุกไฟล์เป็น Markdown (`.md`) ไม่มีโค้ดที่รันได้อยู่ในนี้

## กติกาของโฟลเดอร์นี้

| กติกา | รายละเอียด |
|---|---|
| นามสกุลไฟล์ | `.md` เท่านั้น (รูปภาพแผนผังสถาปัตยกรรมวางใน `docs/`) |
| ชื่อไฟล์ | ตัวพิมพ์เล็ก คั่นด้วย `-` เช่น `aws-cost-estimate.md` |
| Branch | ใช้ prefix `docs/` เช่น `docs/demo-day-v3-readme` (ดู AGENTS.md) |
| Commit | ใช้ type `docs:` เช่น `docs: rewrite README and update architecture diagram to V3 (#135)` |
| ภาษา | เขียนไทยได้ แต่ศัพท์เทคนิค/ชื่อ service ให้คงภาษาอังกฤษ |

## สารบัญเอกสารและสถาปัตยกรรม

| ไฟล์ / ผัง | เนื้อหา | สถานะ |
|---|---|---|
| [TorchV3_architecture.drawio.png](./TorchV3_architecture.drawio.png) | ภาพรวมสถาปัตยกรรม V3 (AWS S3, Cognito Authorizer, Lambda, DynamoDB `SmartFacultyLocations`/`Schedules`/`Pins`) | ใช้งานใน README หลัก |
| [TorchV2_architecture.drawio.png](./TorchV2_architecture.drawio.png) | ภาพรวมสถาปัตยกรรม V2 (Legacy) | เก็บเป็นประวัติ |
| [aws-cost-estimate.md](./aws-cost-estimate.md) | สรุปค่าใช้จ่าย AWS สำหรับนำเสนอ — สปรินต์ปัจจุบัน (S3) และสปรินต์ถัดไป (DynamoDB + Lambda) | ใช้งานได้ |
| [v2-user-feedback-summary.md](./v2-user-feedback-summary.md) | สรุปผลการทดสอบ Peer Testing V2, รายการบั๊ก, ปัญหา UX/UI, และแผนพัฒนา | ใช้งานได้ |
| [3d-map-preview.md](./3d-map-preview.md) | รายละเอียดและแนวทางการพัฒนาแผนที่ 3D Floor Plan (Three.js / WebGL) | ใช้งานได้ |
| [design/uber-designmd.md](./design/uber-designmd.md) | Design system source of truth (Light theme only, อิง DesignMD ของ Uber) พร้อม token mapping ของ frontend | ใช้งานได้ |

## เอกสารที่ควรมีเพิ่มในอนาคต (ยังไม่ได้เขียน)

- `system-boundary-v1.md` — ขอบเขตระบบ V1 (อะไรอยู่ใน / นอก scope)
- `data-model.md` — โครงสร้างข้อมูลใน DynamoDB tables (`SmartFacultyLocations`, `SmartFacultySchedules`, `SmartFacultyPins`)
- `deployment-runbook.md` — ขั้นตอน deploy + วิธีต่อ AWS credentials ของ Learner Lab
