<div align="center">

<img src="frontend/src/assets/perimeter_logo_negative.png" width="450" alt="Perimeter Logo" />

# Smart indoor map Navigator (V3)

**ระบบแผนที่นำทางภายในอาคารอัจฉริยะสำหรับคณะวิทยาศาสตร์และเทคโนโลยี (CS333 / CS361)**

</div>

ยินดีต้อนรับสู่พื้นที่พัฒนาของโปรเจกต์ perimeter (ส่วนหนึ่งของรายวิชา CS333/CS361) ระบบแผนที่นำทางภายในอาคารอัจฉริยะสำหรับคณะวิทยาศาสตร์และเทคโนโลยี อาคาร บร.3 หรือ LC-3 
หากคุณคือผู้พัฒนาที่จะเข้ามาร่วมงานกับเรา เอกสารฉบับนี้คือสิ่งที่ทางเราแนะนำให้อ่านเพื่อทำความเข้าใจ Architecture, ระบบจัดการสิทธิ์ผู้ใช้งาน และขั้นตอนการสร้าง Sandbox ส่วนตัวบน AWS ก่อนเริ่มรันระบบ

## Live Demo & Core Features

[Live Demo (V3 Production บน AWS S3)](http://torch-v2-site-287785301136.s3-website-ap-southeast-1.amazonaws.com/)

**ฟีเจอร์หลักในเวอร์ชัน V3:**
- **Interactive 2D SVG & 3D Floor Map:** แผนที่ผังอาคารแบบ 2D SVG ที่ตอบสนองการคลิก ซูม และเลื่อนโฟกัสไปที่เป้าหมายโดยอัตโนมัติ พร้อมมุมมองโมเดล 3 มิติ (Three.js) แสดงโครงสร้างอาคาร LC-3 ทั้ง 4 ชั้น
- **Integrated Real LC-3 Schedules & Purpose-Based Search:** ผสานข้อมูลตารางเรียน ตารางใช้ห้อง และตารางสอบจริงของตึก LC-3 ค้นหาพิกัดห้องเป้าหมายได้ทันทีผ่าน "รหัสวิชา" (เช่น `CS361`) และ "เวลาเรียน" พร้อมแสดงสถานะการใช้งานของแต่ละห้องแบบ Real-time
- **My Schedule & Calendar Export:** ผู้ใช้ที่เข้าสู่ระบบสามารถบันทึก (Pin) คาบเรียนและรอบสอบที่สนใจเก็บไว้ในตารางส่วนตัว ส่งออกเป็นไฟล์ปฏิทิน `.ics` (พร้อมกฎการเกิดซ้ำตลอดภาคการศึกษา) หรือกดลิงก์เพิ่มลง Google Calendar ได้ทันที
- **Web-based Room & Schedule Editor (`/staff`):** ระบบจัดการข้อมูลห้องเรียนและตารางเรียนผ่านหน้าเว็บสำหรับเจ้าหน้าที่และผู้ดูแลระบบ
- **Unified Authentication & User Management (`/login`, `/admin`):** ระบบเข้าสู่ระบบผ่าน AWS Cognito รองรับการตั้งรหัสผ่านใหม่ในการเข้าใช้งานครั้งแรก และหน้าจัดการบัญชีผู้ใช้และบทบาทสำหรับผู้ดูแลระบบ

## Architecture & Tech Stack

![TORCH V3 Architecture](docs/TorchV3_architecture.drawio.png)

- **Frontend:** React 18, Vite, TypeScript, Tailwind CSS, Three.js (`@react-three/fiber`, `@react-three/drei`), GitHub Octicons (Hosted on AWS S3)
- **Authentication:** AWS Cognito User Pool (`admin`, `staff`, `user` groups) และ `@aws-sdk/client-cognito-identity-provider`
- **Backend & Compute:** AWS Lambda (Node.js 24.x) ผ่าน Implicit API Gateway พร้อม Cognito User Pool Authorizer บนเส้นทางเขียนข้อมูลและข้อมูลส่วนตัว
- **Database:** Amazon DynamoDB (On-Demand Capacity: `SmartFacultyLocations`, `SmartFacultySchedules`, `SmartFacultyPins`)
- **Infrastructure as Code (IaC):** AWS SAM (`template.yaml`), `samconfig.toml`
- **Data & Tooling:** Node.js Scripts สำหรับ Validator, การนำเข้าข้อมูล (Data Seeding) และการดึงค่า Stack Outputs
- **CI/CD:** GitHub Actions (Automated Linting, Vitest, Pre-gzipped Asset Upload, และ Automated Deployment)

### Request Path & Data Flow
1. **Public Read Routes:** การเรียกดูข้อมูลผังห้อง (`GET /api/locations`) และตารางเรียน (`GET /api/schedules`) วิ่งผ่าน API Gateway ไปยัง Lambda และอ่านข้อมูลจากตาราง `SmartFacultyLocations` และ `SmartFacultySchedules` โดยไม่ต้องใช้โทเค็นยืนยันตัวตน
2. **Personal Schedule Routes (`My Schedule`):** เมื่อผู้ใช้บันทึกหรือดูตารางส่วนตัว (`GET / POST / DELETE /api/pins`) เบราว์เซอร์จะแนบ Cognito `IdToken` ไปกับ Request โดย API Gateway จะตรวจสอบโทเค็นผ่าน Cognito Authorizer และ Lambda จะอ่านค่า `claims.sub` จากโทเค็นโดยตรงเพื่อแยกข้อมูลรายบุคคลในตาราง `SmartFacultyPins`
3. **Role-Protected Write Routes (`Staff & Admin`):** การเพิ่ม/แก้ไข/ลบข้อมูลห้องและตารางเรียน รวมถึงการจัดการผู้ใช้ (`/api/users`) จะถูกตรวจสอบสิทธิ์ผ่าน Cognito Authorizer บน API Gateway และตรวจสอบกลุ่มสิทธิ์ (`cognito:groups`) ซ้ำภายใน Lambda Handler ตามระดับบทบาท

### Environments

| Environment | Account | Region | Who Deploys | Lifetime | Credentials |
| :-- | :-- | :-- | :-- | :-- | :-- |
| **Dev** | AWS Academy Learner Lab | `us-east-1` | Teammate (Local via `sam deploy --config-env dev`) | Temporary (4 hours) | Temporary Session Token |
| **Prod** | Real AWS Free Tier Account | `ap-southeast-1` | GitHub Actions CI/CD (`sam deploy --config-env prod`) | Persistent | OIDC Role (Least-privilege) |

> [!IMPORTANT]
> **Production Seeding & Deployment:** ดำเนินการผ่าน GitHub Actions CD Pipeline เท่านั้น บัญชี Production ไม่อนุญาตให้ใช้ Static Access Keys หรือส่ง Request จาก Local Dev โดยตรง

## Developer Quickstart (วิธีรันและทดสอบระบบ)

โปรเจกต์นี้ทำงานแบบ Serverless เพื่อไม่ให้กวน Production ทีมงานทุกคนต้องสร้าง Sandbox บนบัญชี AWS Academy ของตัวเองก่อนเริ่มพัฒนา

### 1. Pre-requisites (สิ่งที่ต้องมี)
- ติดตั้ง **Node.js**, **AWS SAM CLI** และ **AWS CLI** ในเครื่อง
- **ข้อควรระวัง:** บัญชี AWS Academy เลิกเชื่อมต่อทุกๆ 4 ชั่วโมง เมื่อเปิด Lab ใหม่ ต้องกดก๊อปปี้ AWS Credentials มาวางใน Terminal เสมอ

### 2. The "Magic" Command
คิดไม่ออกว่าจะรันระบบยังไง ให้เปิด Terminal ที่โฟลเดอร์นอกสุด (Root) แล้วรันคำสั่งเดียวนี้:
```bash
npm run bootstrap
```

**คำสั่งเดียวนี้ทำอะไรให้บ้าง?**

* `sam build & deploy`: สร้าง Lambda, API Gateway, Cognito User Pool, DynamoDB (`SmartFacultyLocations`, `SmartFacultySchedules`, `SmartFacultyPins`) และ S3
* `seed`: นำเข้าข้อมูลห้องและตารางเรียนจริงเข้า DynamoDB ของคุณ
* `env:pull`: ดึงค่า CloudFormation Outputs (`ApiUrl`, `UserPoolId`, `UserPoolClientId`) มาใส่ใน `frontend/.env.local` ให้อัตโนมัติ
* `site:publish`: Build และ Publish หน้าเว็บของคุณขึ้น S3 ทันที

### 3. Cheat Sheet (คำสั่งที่ใช้บ่อย)

| หากต้องการทำสิ่งนี้... | ให้รันคำสั่งนี้ |
| --- | --- |
| **รันเว็บทดสอบในเครื่อง (Local)** | `npm run dev` (หรือรันข้างในโฟลเดอร์ `frontend`) |
| **ทดสอบเว็บบนมือถือ (Local Network)** | `npm --prefix frontend run dev -- --host` (แล้วเข้าผ่าน URL ที่ปรากฏ) |
| **อัปเดต Tech Stack / Lambda** | `npm run bootstrap` |
| **ดึงค่า Env จาก Stack มาอัปเดต `.env.local`** | `npm run env:pull` |
| **สร้างบัญชี Demo Users (Admin/Staff/User)** | `npm run seed:users` |
| **อัปเดตเฉพาะหน้าบ้าน (Frontend)** | `npm run site:publish` |
| **อัปเดตข้อมูล Data ในฐานข้อมูล** | `npm run seed` |
| **ล้างระบบทิ้งทั้งหมด (Clean up)** | รัน `npm run site:empty` แล้วตามด้วย `sam delete --config-env dev` |

> [!IMPORTANT]
> สำคัญ: ต้องรัน `npm run site:empty` ก่อนลบ Stack เสมอ ไม่งั้นจะลบไม่ผ่านเพราะ S3 Bucket ยังมีไฟล์อยู่

### 4. Routes, Authentication & Role-Based Access Control (RBAC)

#### แผนผังเส้นทางหน้าเว็บ (Application Routes)

| Route | หน้าที่การใช้งาน | สิทธิ์การเข้าถึง |
| :--- | :--- | :--- |
| `/` | หน้า Landing Page นำทางเข้าสู่แผนที่หรือหน้าเข้าสู่ระบบ | ทุกคน (Public) |
| `/login` | หน้าเข้าสู่ระบบกลาง (Unified Sign-In) และหน้าตั้งรหัสผ่านใหม่สำหรับผู้ใช้ที่เข้าสู่ระบบครั้งแรก (`NEW_PASSWORD_REQUIRED`) | ทุกคน (Public) |
| `/map` | แผนที่นำทางภายในอาคาร (2D SVG / 3D Map), ระบบค้นหาห้องและวิชาเรียน, และแผงตารางเรียนส่วนตัว (My Schedule Drawer) | ทุกคน (Public อ่านได้ / ผู้ใช้ที่ Login บันทึก Pin ได้) |
| `/staff` | หน้าจัดการแก้ไขข้อมูลห้องเรียนและตารางสอน (Room & Schedule Editor) | เฉพาะกลุ่ม `staff` และ `admin` (ผู้ที่ยังไม่เข้าสู่ระบบจะถูกส่งไป `/login?redirect=/staff`) |
| `/admin` | หน้าจัดการบัญชีผู้ใช้งาน (สร้างผู้ใช้, เปลี่ยนบทบาท, รีเซ็ตรหัสผ่าน, ลบผู้ใช้) | เฉพาะกลุ่ม `admin` เท่านั้น |

#### ระดับบทบาทและสิทธิ์การเข้าถึง (Role Matrix)

ระบบการจัดการสิทธิ์แบ่งออกเป็น 4 ระดับผ่าน AWS Cognito User Pool:

| Role | Cognito Group | สิทธิ์การเข้าถึง (API Permissions) | หน้าจอที่เข้าถึงได้และหน้าเริ่มต้นหลังเข้าสู่ระบบ |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin` | Full Access: อ่าน, สร้าง, แก้ไข, ลบข้อมูลห้องและตารางเรียน (`POST`, `PUT`, `DELETE`), จัดการ Pin ของตนเอง และจัดการบัญชีผู้ใช้ทั้งหมด (`/api/users`) | เข้าถึงได้ทุกหน้า (`/map`, `/staff`, `/admin` พร้อมปุ่มลบและ Danger Zone) — หน้าเริ่มต้น: `/admin` |
| **Staff** | `staff` | Edit Access: อ่าน, สร้าง, แก้ไขข้อมูลห้องและตารางเรียน (`POST`, `PUT`) และจัดการ Pin ของตนเอง; **ไม่อนุญาตให้ลบข้อมูลหรือจัดการผู้ใช้** (`DELETE` &rarr; `403 Forbidden`) | เข้าถึง `/map`, `/staff` (ซ่อนปุ่มลบและ Danger Zone) — หน้าเริ่มต้น: `/staff` |
| **User** | `user` | Personal Schedule Access: อ่านข้อมูลผังอาคารและตารางเรียน และจัดการตารางเรียนส่วนตัว (`GET`, `POST`, `DELETE /api/pins`); เรียกเส้นทางแก้ไขข้อมูลกลาง &rarr; `403 Forbidden` | เข้าถึง `/map` และใช้งานแผง My Schedule — หน้าเริ่มต้น: `/map` |
| **Guest** | *(ไม่มีโทเค็น)* | Read Only: เข้าใช้งานแผนที่และดูตารางเรียนสาธารณะ (`GET /api/locations`, `GET /api/schedules`); เรียกเส้นทาง Write หรือ `/api/pins` &rarr; `401 Unauthorized` | เข้าถึง `/` และ `/map` (เมื่อกดปุ่ม Pin ระบบจะนำทางไปหน้า `/login`) |

#### การสร้าง Demo Accounts
สร้างบัญชีตัวอย่างสำหรับแต่ละบทบาทโดยกำหนดรหัสผ่านผ่าน Environment Variables (ห้ามบันทึกค่าลงในโค้ด):

**Bash / macOS / Linux:**
```bash
ADMIN_PASSWORD="<YourAdminPassword>" STAFF_PASSWORD="<YourStaffPassword>" USER_PASSWORD="<YourUserPassword>" npm run seed:users
```

**PowerShell (Windows):**
```powershell
$env:ADMIN_PASSWORD="<YourAdminPassword>"
$env:STAFF_PASSWORD="<YourStaffPassword>"
$env:USER_PASSWORD="<YourUserPassword>"
npm run seed:users
```
*(อีเมล Default: `admin@torch.dev`, `staff@torch.dev`, `user@torch.dev`)*

#### การสร้างและจัดการผู้ใช้งาน
ระบบไม่มีการเปิดให้สมัครสมาชิกด้วยตนเอง (No Self-Signup) การเพิ่มผู้ใช้งานสามารถทำได้ 2 ช่องทาง:
1. **ผ่านหน้าเว็บ `/admin` (แนะนำ):** เข้าสู่ระบบด้วยบัญชีกลุ่ม `admin` แล้วกดสร้างผู้ใช้ กำหนดกลุ่มสิทธิ์ (`admin`, `staff`, `user`) และรหัสผ่านชั่วคราว เมื่อผู้ใช้เข้าสู่ระบบครั้งแรกที่ `/login` ระบบจะให้ตั้งรหัสผ่านใหม่อัตโนมัติ
2. **ผ่าน AWS CLI (กรณีจัดการจากเครื่องนักพัฒนา):**
```bash
# 1. สร้างบัญชีใหม่
aws cognito-idp admin-create-user --user-pool-id <UserPoolId> --username newstaff@torch.dev --user-attributes Name=email,Value=newstaff@torch.dev Name=email_verified,Value=true --message-action SUPPRESS

# 2. ตั้งรหัสผ่านถาวร
aws cognito-idp admin-set-user-password --user-pool-id <UserPoolId> --username newstaff@torch.dev --password "<YourSecurePassword>" --permanent

# 3. กำหนดกลุ่มสิทธิ์ (admin | staff | user)
aws cognito-idp admin-add-user-to-group --user-pool-id <UserPoolId> --username newstaff@torch.dev --group-name staff
```

### 5. Frontend Environment Variables & Pipeline Parity

เมื่อ Frontend ต้องใช้ค่า Config จาก CloudFormation Stack ระบบใช้หลักการ **Four-Point Sync** เพื่อให้ Local Dev และ Production ทำงานตรงกันเสมอ:
1. **`template.yaml` (`Outputs`):** ส่งออกค่า `ApiUrl`, `UserPoolId`, `UserPoolClientId`, `SiteBucketName`, `LocationsTableName`, `SchedulesTableName`, `PinsTableName`
2. **`scripts/write-env.mjs` (`npm run env:pull`):** ดึงค่าจาก Stack มาเขียนลง `frontend/.env.local` (`VITE_API_BASE_URL`, `VITE_COGNITO_USER_POOL_ID`, `VITE_COGNITO_CLIENT_ID`)
3. **`.github/workflows/cd-frontend.yml`:** ดึงค่า Outputs เดียวกันในขั้นตอน Build ก่อนอัปโหลดขึ้น S3 Production
4. **`frontend/.env.example`:** เก็บโครงสร้างตัวแปรตัวอย่างสำหรับนักพัฒนา

### 6. AI-Assisted Development (Matt Pocock Skills)

โปรเจกต์นี้ติดตั้ง Workflow ของ AI Agent ไว้เพื่อช่วยให้ทีมเขียนโค้ดและวางแผนได้รวดเร็วขึ้น สามารถเรียกใช้ผ่านแชทด้วย Slash Commands:

* **`/grill-with-docs`**: ใช้สัมภาษณ์/พูดคุยเพื่อรีดไอเดียและสร้าง Spec ให้ชัดเจนก่อนเริ่มเขียนโค้ด
* **`/to-spec` & `/to-tickets`**: สั่งแปลงบทสนทนาเป็น Technical Spec และแบ่งเป็น Ticket ย่อยๆ
* **`/tdd` หรือ `/implement`**: สั่งให้ AI ลงมือเขียนโค้ดตาม Spec หรือทำ Test-Driven Development ให้ทันที

## Testing & CI/CD
* **Frontend Tests:** รัน `npm test` (Unit & Logic Tests), `npm --prefix frontend run test:ui` (Component Tests) และ `npm run lint`
* **Backend Lambda Tests:** รัน `node --test functions/<name>/index.test.mjs`
* **Backend / IaC Validation:** รัน `sam validate --lint` (ตรวจ `template.yaml`)
* **CI/CD Pipeline:** เมื่อเปิด PR ระบบ **CodeRabbit** จะรีวิวโค้ดอัตโนมัติ และเมื่อ Merge ลง `main` แล้ว GitHub Actions จะ Deploy โค้ดขึ้น Production ให้อัตโนมัติ

## Acknowledgments
- The interactive SVG floor plans and initial map navigation nodes were originally adapted from the [ronnakrit303/CS232-Map_Navigation](https://github.com/ronnakrit303/CS232-Map_Navigation) repository.

## License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details. 

**Exceptions and Third-Party Assets:**
The MIT License applies only to the original source code and assets created for this repository. Third-party assets, specifically the interactive SVG floor plans and map navigation nodes adapted from the [ronnakrit303/CS232-Map_Navigation](https://github.com/ronnakrit303/CS232-Map_Navigation) repository, retain their original copyright. They are used here with permission for academic purposes and are EXCLUDED from this MIT License grant. Anyone wishing to redistribute or reuse those specific assets must obtain permission from their respective original authors.
