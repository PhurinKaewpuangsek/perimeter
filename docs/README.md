# 📚 docs/ — เอกสารโครงการ TORCH (Smart Faculty Navigator)

โฟลเดอร์นี้เก็บ **เอกสารอย่างเดียว** ทุกไฟล์เป็น Markdown (`.md`) ไม่มีโค้ดที่รันได้อยู่ในนี้

## กติกาของโฟลเดอร์นี้

| กติกา | รายละเอียด |
|---|---|
| นามสกุลไฟล์ | `.md` เท่านั้น (รูปประกอบวางใน `docs/assets/`) |
| ชื่อไฟล์ | ตัวพิมพ์เล็ก คั่นด้วย `-` เช่น `aws-cost-estimate.md` |
| Branch | ใช้ prefix `docs/` เช่น `docs/cost-estimate` (ดู AGENTS.md §3) |
| Commit | ใช้ type `docs:` เช่น `docs: add AWS cost estimate for sprint 1-2` |
| ภาษา | เขียนไทยได้ แต่ศัพท์เทคนิค/ชื่อ service ให้คงภาษาอังกฤษ |

## สารบัญเอกสาร

| ไฟล์ | เนื้อหา | สถานะ |
|---|---|---|
| [aws-cost-estimate.md](./aws-cost-estimate.md) | สรุปค่าใช้จ่าย AWS สำหรับนำเสนอ — สปรินต์ปัจจุบัน (S3) และสปรินต์ถัดไป (DynamoDB + Lambda) | ✅ ใช้งานได้ |
| [v2-user-feedback-summary.md](./v2-user-feedback-summary.md) | สรุปผลการทดสอบ Peer Testing V2, รายการบั๊ก, ปัญหา UX/UI, และแผนพัฒนา | ✅ ใช้งานได้ |
| [design/uber-designmd.md](./design/uber-designmd.md) | Design system source of truth (Light theme only, อิง DesignMD ของ Uber) พร้อม token mapping ของ frontend | ✅ ใช้งานได้ |

## เอกสารที่ควรมีเพิ่มในอนาคต (ยังไม่ได้เขียน)

- `system-boundary-v1.md` — ขอบเขตระบบ V1 (อะไรอยู่ใน / นอก scope)
- `data-model.md` — โครงสร้างข้อมูลใน DynamoDB table `SmartFacultyLocations` และ contract ของ `GET /api/locations`
- `deployment-runbook.md` — ขั้นตอน deploy + วิธีต่อ AWS credentials ของ Learner Lab
