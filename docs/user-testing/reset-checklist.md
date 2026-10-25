# Checklist เตรียมและรีเซ็ตข้อมูลทดสอบ

## ข้อห้ามและขอบเขต

- [ ] ใช้ personal AWS Academy dev stack ที่แยกจาก production และ tester คนอื่น; อ้างอิง [test-fixtures.md](./test-fixtures.md) เพื่อยืนยัน AWS account, `--config-env dev`, region, stack, API URL และ frontend URL
- [ ] ให้ผู้ทดสอบสองคนตรวจยืนยัน target stack จาก `aws sts get-caller-identity` และ CloudFormation outputs ก่อนการเขียนข้อมูล; บันทึกเฉพาะ account ID/stack metadata ที่อนุญาต ไม่บันทึก AWS keys/session token
- [ ] ไม่แก้ production, ไม่แก้ไฟล์ seed ที่สร้างจาก generator และไม่เปลี่ยนข้อมูลผู้ใช้จริง
- [ ] ใช้ test account และข้อมูลที่มี prefix `V4-TEST`; ห้ามเก็บรหัสผ่าน, access token, API key หรือ secret ใน repo/เอกสารผล
- [ ] หากยืนยันไม่ได้ว่าเป็น personal dev test stack ให้หยุดและติดต่อผู้ดูแล ห้ามทดลองเขียนข้อมูล
- [ ] ถ้าต้องใช้ `npm run seed:users`, อ่านข้อจำกัดใน [test-fixtures.md](./test-fixtures.md) ก่อน: สคริปต์สร้าง/อัปเดต admin, staff และ user ทั้งหมด ไม่ใช่เฉพาะ staff และรีเซ็ตรหัสผ่านผู้ใช้ที่มีอยู่; ใช้เฉพาะ isolated personal dev stack พร้อม email เฉพาะชุดทดสอบ
- [ ] บันทึกผู้รับผิดชอบอนุมัติการเขียนข้อมูลและเวลาที่อนุมัติ; อย่ารัน `npm run bootstrap`, `deploy`, `seed`, `seed:users` หรือคำสั่งเขียนอื่นก่อนยืนยัน target

## ก่อนเริ่ม session

- [ ] บันทึก build/commit, URL ของ personal dev test stack, วันเวลา และผู้ดูแล session
- [ ] บันทึก baseline จาก [test-fixtures.md](./test-fixtures.md) และสำรองค่าทุก field/key ของ schedule/event, node/edge closure และบัญชีทดสอบที่จะเปลี่ยน; จำกัดสิทธิ์เข้าถึง snapshot และเก็บไว้นอก repo
- [ ] กำหนด fixture sheet ให้ครบ: รหัสกิจกรรม, event type/date/time, ห้องเดิม/ใหม่, ช่วงปิด, เหตุผล, จุดเริ่มต้นนำทาง, closure element และค่าก่อนทดสอบ
- [ ] ตรวจ TC1 พบรายการ BAS350 เวลา 13:00–16:00 ในวันที่ทดสอบและห้องไม่ปรากฏก่อนค้นหา; seed เดิมมีรายการ 2026-05-18 จึงต้องไม่สมมติว่ารายการเดิมค้นพบได้
- [ ] สร้าง TC1 fixture `BAS350` แยกใน test stack ด้วยวันที่ทดสอบและ key ที่ไม่ชน; ตรวจค้นหา/รายละเอียด/route แล้วจด primary key สำหรับลบหรือ restore
- [ ] สร้าง TC2 fixture `V4-TEST-MTG-20261030` ตาม [test-fixtures.md](./test-fixtures.md) ในห้อง `LC3-225`; ก่อนแต่ละ cycle ต้องเป็น baseline นี้
- [ ] ตรวจ TC2 staff ใช้บัญชี role `staff`; หากไม่มี ให้เตรียม test-only staff account ตาม [test-fixtures.md](./test-fixtures.md) ก่อน session (ห้ามใช้ `admin` แทน staff เพราะจะเปลี่ยน role ที่กำลังทดสอบ)
- [ ] ตรวจเส้นทางก่อนปิด closure และหลังปิด closure จากจุดเริ่มต้นเดียวกัน; ยืนยันว่าห้องใหม่ยังเข้าถึงได้และ route หลีกเลี่ยงช่วงปิด
- [ ] ซ้อมเดินเส้นทางจริงจากจุดเริ่มต้นที่กำหนด; ยืนยันว่าปลอดภัยและห้องปลายทางเข้าถึงได้ ห้ามกีดขวางทางเดินจริงเพื่อจำลอง closure ในระบบ
- [ ] ยืนยัน closure edge/ชื่อ corridor ใน UI และทดสอบ alternate route จริงก่อนใช้; candidate ที่ยังไม่ผ่านการตรวจใน [test-fixtures.md](./test-fixtures.md) ใช้ทดสอบไม่ได้
- [ ] ตรวจว่า fixture ไม่ชนกับตาราง/กิจกรรมอื่นในช่วงเวลาเดียวกัน
- [ ] เปิดแบบฟอร์มผลและเตรียมอุปกรณ์; ตรวจว่าไม่มีข้อมูล credential บนหน้าจอ/ภาพที่จะบันทึก

## ระหว่าง session

- [ ] TC1: ใช้ fixture ใน personal dev test stack ที่กำหนด; เก็บผลก่อนลบหรือ restore
- [ ] TC2 staff: ยืนยัน event เริ่มใน `LC3-225` และ closure เปิด; ให้ staff เปลี่ยนกิจกรรมและ closure ด้วยตนเอง
- [ ] ตรวจค่าที่ผู้เข้าร่วม staff บันทึกแล้วว่าตรงกับโจทย์ ก่อนเริ่ม TC2 participant
- [ ] **ห้าม reset ระหว่าง TC2 staff และ TC2 participant**; participant ต้องพบข้อมูลหลังการเปลี่ยนแปลงเดียวกัน
- [ ] จด primary key และผลที่เปลี่ยนจริงจาก API/UI โดยไม่บันทึก token; เก็บ snapshot หลักฐานที่ไม่มี secret
- [ ] หยุดทันทีหากข้อมูลถูกเขียนไป production, มี resource อื่นได้รับผลกระทบ, หรือไม่สามารถตรวจยืนยันการเปลี่ยนแปลงได้

## หลังจบแต่ละ test cycle (ก่อนผู้เข้าร่วมชุดถัดไป)

- [ ] คืน TC2 event ไป baseline ใน `LC3-225` และคืนทุก field ให้ตรง snapshot; ถ้าเป็น record ที่สร้างขึ้น ให้ลบเฉพาะ primary key ของ fixture หลังเก็บผลแล้ว
- [ ] เปิด node/edge ที่ปิดไว้; ตรวจ `closed` เป็น false และล้าง `closed_from`, `closed_until`, `closed_reason` ของ closure ทดสอบเท่านั้น
- [ ] ลบ TC1 exam fixture ของรอบนั้นด้วย key ที่บันทึกไว้; อย่าลบ record อื่นที่ใช้ `BAS350`
- [ ] ตรวจบัญชีทดสอบ: role/groups และผู้ใช้ที่ถูกสร้าง/ปรับโดย `seed:users`; ห้ามเปลี่ยนหรือลบรหัสผ่านของบัญชีที่ไม่ใช่บัญชีทดสอบ
- [ ] ตรวจซ้ำว่าข้อมูลจริงที่ไม่ใช่ fixture ไม่ถูกเปลี่ยน
- [ ] อ่านข้อมูลกลับจาก UI/API และตรวจ DynamoDB ด้วยวิธี read-only ที่อนุมัติ: fixture ถูกลบ/คืนค่า, closure ไม่มีผล, route กลับเหมือน baseline
- [ ] ให้ผู้ตรวจคนที่สองเซ็นยืนยันทุกแถวใน [test-fixtures.md](./test-fixtures.md) ก่อนเริ่มรอบถัดไป; success toast อย่างเดียวไม่ถือว่า verify
- [ ] บันทึกเวลาที่ restore, ผู้รับผิดชอบ, ผู้ตรวจยืนยัน และผลตรวจใน [result-template.md](./result-template.md)
- [ ] หาก restore ไม่ครบ ให้หยุดการทดสอบรอบถัดไป แจ้งผู้ดูแล และแนบเฉพาะหลักฐานที่ไม่มี secret
- [ ] เก็บผลแบบไม่ระบุตัวตนตามระยะเวลาที่ผู้จัดกำหนด และลบสำเนาที่ไม่จำเป็น

## หลังจบการทดสอบทั้งหมด

- [ ] ลบบัญชี Cognito เฉพาะบัญชีทดสอบที่สร้างขึ้นใหม่สำหรับงานนี้ หลังตรวจ email กับบันทึกการสร้างและได้รับอนุมัติจากเจ้าของ stack; ห้ามลบบัญชีที่มีอยู่ก่อน
- [ ] ล้าง environment variables ของบัญชีทดสอบ ปิด terminal session ที่ใช้ secrets และตรวจว่าไม่มี credential ถูกบันทึกใน history, screenshot, log หรือเอกสาร
- [ ] ให้เจ้าของ stack ตรวจยืนยันว่าไม่มี fixture/closure ทดสอบหลงเหลือและบันทึกผลการ cleanup
