# ข้อมูลทดสอบและการเตรียม test stack (#151)

เอกสารนี้เป็น worksheet สำหรับผู้ดำเนินการทดสอบผู้ใช้จริง V4 โดยระบุข้อมูลที่เสนอให้ใช้ ไม่ใช่ข้อมูลที่ deploy ไว้แล้ว ข้อความใน issue ที่กล่าวถึง “prod/stack used for testing” **ไม่ได้** อนุญาตให้เขียนข้อมูลลง production: ให้ใช้เฉพาะ personal AWS Academy **dev** stack ที่แยกออกมาต่างหาก ระบบ production ดำเนินการผ่าน GitHub Actions CD pipeline และห้ามใช้ทดสอบตามแผนนี้

## 1. ตรวจสอบและอนุมัติ test stack

กรอกข้อมูลส่วนนี้ให้ครบก่อนรันคำสั่งใด ๆ ที่เปลี่ยนแปลง AWS resources:

| รายการ | ค่าที่อนุมัติ |
|---|---|
| AWS environment | ใช้เฉพาะ AWS Academy personal sandbox / dev |
| AWS account ID จาก `aws sts get-caller-identity` | กรอกในเครื่อง ห้ามเผยแพร่ credentials |
| SAM config environment | `dev` |
| Stack name | กรอกและตรวจสอบกับ personal sandbox |
| Region | `us-east-1` ตาม dev SAM config ของ repository |
| Stack status | ต้องเป็น `CREATE_COMPLETE` หรือ `UPDATE_COMPLETE` |
| API URL / frontend URL | กรอกจาก stack outputs ที่เลือก |
| ผู้รับผิดชอบทดสอบและเวลาอนุมัติ | |

ขณะจัดทำเอกสารนี้ [`samconfig.toml`](../../samconfig.toml) ของ repository ตั้งค่า `dev` ให้ใช้ stack `torch-v2` ใน `us-east-1`; ส่วน `prod` ก็ใช้ชื่อ `torch-v2` เช่นกัน แต่อยู่ใน `ap-southeast-1` **ชื่อ stack เพียงอย่างเดียวไม่สามารถระบุ environment ได้** ให้ตรวจ AWS caller identity, config environment, region, CloudFormation stack outputs และ frontend API URL แยกจากกัน ห้ามดำเนินการต่อหากค่าใดชี้ไปยัง production, shared account หรือ stack ของผู้ทดสอบคนอื่น

stack helpers ใช้ `--config-env dev` เป็นค่าเริ่มต้น แต่ `--stack`, `--region` และ environment variables สามารถแทนที่ค่าเริ่มต้นได้ ห้ามกำหนด `--config-env prod`, ตั้ง `TORCH_STACK_NAME` ให้ชี้ไปยัง production stack หรือตั้ง `AWS_REGION` เป็น production region ห้ามรัน `npm run bootstrap`, `npm run deploy`, `npm run seed` หรือ `npm run seed:users` จนกว่าจะตรวจสอบและอนุมัติ target แล้ว เพราะคำสั่งเหล่านี้อาจสร้างหรือเปลี่ยน cloud resources/data ได้

รันคำสั่งตรวจสอบ identity แบบอ่านอย่างเดียวต่อไปนี้ก่อนตั้งค่าหรือรันคำสั่งที่เขียนข้อมูล:

```powershell
aws sts get-caller-identity
aws cloudformation describe-stacks --stack-name <approved-personal-dev-stack> --region us-east-1 --query "Stacks[0].[StackName,StackStatus,Outputs]" --output table
```

เปรียบเทียบ account และ outputs ที่ได้กับ AWS Academy sandbox และตาราง environment ด้านบน หาก identity, stack หรือ endpoint ไม่ตรงกัน ให้หยุดทันที การใช้ `us-east-1` เพียงอย่างเดียวไม่ได้ยืนยันว่า account นั้นเป็น sandbox

หลังเลือก stack แล้ว ให้บันทึก identity และ outputs ที่ตรวจสอบได้ในตารางนี้ (ห้ามบันทึก access keys, session tokens, passwords หรือ secrets อื่น ๆ):

| รายการตรวจสอบ | ค่า / ผลการตรวจ |
|---|---|
| account จาก `aws sts get-caller-identity` | |
| environment ใน `samconfig.toml` | |
| CloudFormation stack name และ region | |
| CloudFormation status | |
| `ApiUrl` / frontend URL ใช้ stack เดียวกัน | |
| ผู้ตรวจสอบ / วันที่ / เวลา | |

## 2. บัญชี demo สำหรับ task ของ staff

`npm run seed:users` จะรัน [`tools/create-demo-users.mjs`](../../tools/create-demo-users.mjs) โดยต้องกำหนด password variables **ทั้งสามรายการ** (`ADMIN_PASSWORD`, `STAFF_PASSWORD`, `USER_PASSWORD`) และจะสร้างหรืออัปเดตบัญชี admin, staff และ user สำหรับบัญชีที่มีอยู่แล้ว สคริปต์จะตั้งรหัสผ่านใหม่และเพิ่ม role group ให้ หากไม่ได้กำหนด email variables สคริปต์จะใช้ `admin@torch.dev`, `staff@torch.dev` และ `user@torch.dev` ดังนั้น:

- รันคำสั่งนี้เฉพาะใน personal dev stack ที่แยกออกมาต่างหากและผ่านการอนุมัติแล้ว หลังกรอกข้อมูลในหัวข้อ 1 เสร็จ คำสั่งนี้ไม่ได้จัดการเฉพาะบัญชี staff และอาจรบกวนผู้ที่ใช้บัญชีเดียวกันอยู่
- กำหนด email ทดสอบที่ไม่ซ้ำกันด้วย `ADMIN_EMAIL`, `STAFF_EMAIL` และ `USER_EMAIL`; ห้ามใช้ค่าเริ่มต้นใน environment ที่มีผู้ใช้ร่วมกัน
- กำหนดรหัสผ่านทั้งสามผ่าน environment variables ใน terminal ส่วนตัวที่ใช้งานเพียงชั่วคราว ห้ามใส่รหัสผ่านในไฟล์นี้, `.env`, command-line arguments, shell scripts, screenshots, chat หรือ shell history จำกัดผู้ที่เข้าถึงเครื่อง/terminal ได้ และลบ variables ทันทีหลังใช้
- ห้ามคัดลอกรหัสผ่าน demo เริ่มต้นหรือ credentials จากตาราง output ลง repository ให้ส่งข้อมูลเข้าถึงแก่ผู้ทดสอบผ่านช่องทางส่วนตัวที่ทีมอนุมัติแล้วเท่านั้น
- สคริปต์จะค้นหา Cognito user pool จาก stack outputs ที่เลือก (หรือ `COGNITO_USER_POOL_ID`) ห้ามกำหนด variable นี้ เว้นแต่ตรวจยืนยันแล้วว่าเป็นของ dev stack ที่อนุมัติ

ตัวอย่างคำสั่ง PowerShell ด้านล่างให้รันจาก repository root ระบบจะ prompt ขอรหัสผ่านแต่ละรายการโดยไม่แสดงข้อความที่พิมพ์ และเก็บค่าไว้เฉพาะ terminal session นี้ เปลี่ยน email ตัวอย่างเป็นที่อยู่ซึ่งสงวนไว้สำหรับ test stack นี้โดยเฉพาะ และเปลี่ยน `<approved-personal-dev-stack>` เป็นชื่อ stack ที่ตรวจสอบแล้วให้ตรงทุกตัวอักษรก่อนรัน:

```powershell
$env:STAFF_EMAIL = 'staff-v4-test@example.invalid'
$env:ADMIN_EMAIL = 'admin-v4-test@example.invalid'
$env:USER_EMAIL = 'user-v4-test@example.invalid'
$env:ADMIN_PASSWORD = [System.Net.NetworkCredential]::new('', (Read-Host 'Admin test password' -AsSecureString)).Password
$env:STAFF_PASSWORD = [System.Net.NetworkCredential]::new('', (Read-Host 'Staff test password' -AsSecureString)).Password
$env:USER_PASSWORD = [System.Net.NetworkCredential]::new('', (Read-Host 'User test password' -AsSecureString)).Password
npm run seed:users -- --config-env dev --stack <approved-personal-dev-stack> --region us-east-1
Remove-Item Env:ADMIN_PASSWORD, Env:STAFF_PASSWORD, Env:USER_PASSWORD, Env:ADMIN_EMAIL, Env:STAFF_EMAIL, Env:USER_EMAIL
```

ที่อยู่โดเมน `.invalid` ข้างต้นเป็นเพียงตัวอย่างเท่านั้น ให้ใช้ที่อยู่ซึ่ง Cognito configuration ของโปรเจกต์ยอมรับและอยู่ภายใต้การควบคุมของผู้รับผิดชอบการทดสอบ หากคำสั่งล้มเหลว ให้หยุดและตรวจสอบ stack ที่เลือกกับ caller identity ห้ามลองซ้ำโดยใช้ production credentials หรือ environment อื่น ระหว่างรัน ค่าของ environment variables จะถูกส่งให้ process ในรูปแบบข้อความธรรมดา ให้ใช้เครื่องที่เชื่อถือได้และอย่าเปิด terminal session ค้างไว้

## 3. ข้อมูลกิจกรรมและห้องที่เสนอให้ใช้ (TC2)

รหัสห้องและ location IDs ด้านล่างมีอยู่ใน LC3 location seed ที่สร้างขึ้นอัตโนมัติ ให้สร้างกิจกรรมนี้ใน test stack ที่อนุมัติผ่านหน้า staff หลัง build ที่จะทดสอบผ่าน readiness gate แล้ว ขณะนี้ยังไม่มีกิจกรรมนี้ใน seed

| รายการ | ค่าเริ่มต้นก่อนแต่ละ staff session | ค่าที่คาดหวังหลังแก้ไข |
|---|---|---|
| ชื่อกิจกรรม | `ประชุมแผนงาน V4` | คงเดิม |
| Event code | `V4-TEST-MTG-20261030` | คงเดิม |
| Event type | `other` | คงเดิม |
| Event date | `2026-10-30` | คงเดิม |
| วัน | `FRI` | คงเดิม |
| เวลา | `13:00–14:00` (`Asia/Bangkok`) | คงเดิม |
| Room code | `LC3-225` | `LC3-227` |
| Room location ID | `LC3-F2-R225` | `LC3-F2-R227` |
| Schedule key | `FRI#13:00#V4-TEST-MTG-20261030` | ใช้ event slot เดิม; ตรวจพฤติกรรมของ key ใน build ที่ deploy แล้ว |

ก่อนสร้าง fixture ให้ตรวจว่า event key นี้ยังไม่มีใน test stack ที่เลือก และห้องทั้งสองพร้อมใช้งาน ใน location seed ห้อง `LC3-225` จัดประเภทเป็น meeting room ส่วน `LC3-227` เป็น seminar room ให้ตรวจว่าชื่อและตำแหน่งบนแผนที่ที่ deploy แล้วถูกต้องและเข้าถึงได้ก่อนใช้ ห้ามสร้าง fixture นี้ใน production หรือแก้ไขไฟล์ seed ที่สร้างอัตโนมัติโดยตรง

### Fixture ข้อสอบ TC1

ใน seed มีรายการสอบจริงของ `BAS350` เวลา 13:00–16:00 ห้อง `LC3-103` วันที่ `2026-05-18` ซึ่งเป็นวันที่ผ่านไปแล้วเมื่อถึงวันทดสอบตามแผน ให้เตรียม record `exam` แยกสำหรับ `BAS350` วันที่ `2026-10-30` เวลา 13:00–16:00 ห้อง `LC3-103` ใน test stack เท่านั้น โดยใช้ slot key ที่ไม่ซ้ำและกำหนด `event_date: 2026-10-30` ตรวจว่าค้นหา record ได้และผลลัพธ์แสดงห้องถูกต้องก่อนเริ่มทดสอบ แต่อย่าเปิดเผยห้องให้ผู้เข้าร่วมทราบล่วงหน้า สำรองข้อมูล record/key ที่แน่นอนและลบหลังจบ session ห้ามแก้ seed ที่สร้างอัตโนมัติหรือข้อมูล production

## 4. การปิดทางเดินชั่วคราวที่เสนอให้ใช้ (TC2)

graph seed มีข้อมูลต่อไปนี้เป็นเพียง **ตัวเลือกเบื้องต้น** ยังไม่ได้ยืนยันชื่อทางเดินที่ผู้ใช้เข้าใจได้จากการสำรวจสถานที่:

| รายการ | ค่าที่เสนอ |
|---|---|
| ชั้น | 2 |
| Graph element | <code>EDGE#LC3_hallway-12&#124;LC3_F2_entry-14</code> |
| Graph endpoints | `LC3_hallway-12` ↔ `LC3_F2_entry-14` |
| Edge type ใน seed | `walk` |
| จุดเริ่มต้นเส้นทางที่เสนอ | `LC3_Junction_SM` (จุดเข้าตึกที่ seed เสนอเป็นค่าเริ่มต้น) |
| จุดหมายที่เสนอ | `LC3_F2_227` (ห้อง LC3-227) |
| ค่าการปิดที่เสนอ | `closed: true` ตั้งแต่ `2026-10-30T12:30:00+07:00` ถึง `2026-10-30T14:30:00+07:00` |
| เหตุผล | `บำรุงรักษาทางเดิน (ข้อมูลทดสอบ)` |

ขณะนี้เส้นทางที่สั้นที่สุดใน seed graph จากจุดเริ่มต้นที่เสนอไปยัง LC3-227 มี edge นี้อยู่ด้วย หากนำ edge นี้ออกจะมีเส้นทางอื่นใน graph แต่เส้นทางนั้นยาวกว่า และยังไม่ได้ตรวจสอบว่าใช้ได้จริง แสดงถูกต้อง หรือเดินได้อย่างปลอดภัยในอาคาร ก่อนอนุมัติ fixture ให้ตรวจสอบรายการต่อไปนี้:

- [ ] ยืนยันชื่อทางเดินที่ผู้ใช้เข้าใจได้และตำแหน่งที่ไฮไลต์บนแผนที่ใน staff UI ของ build ที่ deploy แล้ว ห้ามอ่าน graph IDs ภายในให้ผู้เข้าร่วมฟัง
- [ ] ตรวจ router ของ build ที่ deploy แล้วว่า closure ทำงานในช่วงเวลาที่กำหนด และเส้นทางหลีกเลี่ยง edge ที่ปิดโดยยังไปถึง LC3-227 ได้
- [ ] ทดลองเดินเส้นทางทางเลือกจริงร่วมกับผู้ดูแลอาคารที่ได้รับอนุญาต ยืนยันว่าเปิดและปลอดภัย และไม่ผ่านพื้นที่หวงห้ามหรือพื้นที่ที่เข้าถึงไม่ได้
- [ ] หากตรวจข้อใดไม่ผ่าน ห้ามใช้ edge นี้ ให้เลือก edge ที่ตรวจสอบแล้วและมีเส้นทางทางเลือกที่ปลอดภัยและใช้ได้จริง จากนั้นอัปเดต fixture sheet และ scenario card ก่อนทดสอบ
- [ ] กำหนดระยะเวลาปิดให้ครอบคลุมเวลาทำ task และตรวจว่าเวลาเริ่ม/สิ้นสุดตีความเป็น `Asia/Bangkok` โดยใช้ offset `+07:00` ตามรูปแบบ ISO-8601 ที่กำหนด

ห้ามกีดขวางทางเดินจริง การปิดทางจำลองเฉพาะในระบบทดสอบเท่านั้น ผู้เข้าร่วมต้องใช้เส้นทางจริงที่เปิดและปลอดภัยเสมอ

## 5. บันทึก baseline และการคืนค่าของผู้เข้าร่วมแต่ละรอบ

ผู้เข้าร่วมแต่ละคนต้องเริ่มจาก baseline เดียวกัน สำหรับ TC2 ให้ผู้เข้าร่วมที่เป็น staff เป็นผู้เปลี่ยนข้อมูล จากนั้นให้ผู้เข้าร่วมอีกคนทำ task ค้นหาข้อมูลสาธารณะจากสถานะที่เปลี่ยนแล้ว บันทึกผลของผู้เข้าร่วมทั้งคู่เป็น test cycle เดียว และคืนค่าทุกอย่างก่อนเริ่ม cycle ถัดไป

| รายการ | Snapshot ก่อนเริ่ม cycle | ค่าที่คาดหวังหลัง staff ทำ task | คืนค่าและตรวจสอบแล้วหลังจบ cycle |
|---|---|---|---|
| TC1 exam test record/key | | BAS350, 2026-10-30, 13:00–16:00, LC3-103 | |
| TC2 event item/key | | กิจกรรมเดิมย้ายจาก LC3-225 → LC3-227 | |
| Closure element และ fields เดิม | | ปิด element ที่เลือก/อนุมัติ เวลา 12:30–14:30 | |
| Test accounts / groups | | staff แก้ไขได้; participant อ่านข้อมูลได้โดยไม่มีสิทธิ์ staff | |
| Route จากจุดเริ่มต้นที่ปลอดภัยและกำหนดไว้ | | คำนวณใหม่โดยไม่ใช้ edge ที่ปิดและไปยังจุดหมายถูกต้อง | |
| ผู้คืนค่า / วันที่ / เวลา | ไม่เกี่ยวข้อง | ไม่เกี่ยวข้อง | |

ใช้ [reset-checklist.md](./reset-checklist.md) หลังจบทุก test cycle หากคืนค่าและตรวจสอบรายการใดไม่ได้ ให้หยุดก่อนเริ่มผู้เข้าร่วมคนถัดไป ห้ามถือว่าล้างข้อมูลสำเร็จโดยอาศัยเพียงข้อความแจ้งว่าสำเร็จบนหน้าจอ

หลังจบ cycle สุดท้าย ให้ลบเฉพาะ test accounts ที่สร้างขึ้นใหม่สำหรับการศึกษานี้ และนำ test-only Cognito group memberships ของบัญชีเหล่านั้นออกผ่านขั้นตอน admin ที่ได้รับอนุมัติ ก่อนดำเนินการ ให้ตรวจสอบ email แต่ละรายการให้ตรงกับบันทึกการสร้างบัญชี ห้ามลบหรือแก้ไขบัญชีที่มีอยู่ก่อน บัญชีที่ใช้ร่วมกัน บัญชี staff จริง หรือบัญชี production หากไม่แน่ใจว่าใครเป็นเจ้าของบัญชี ให้คงบัญชีนั้นไว้และแจ้งเจ้าของ test stack
