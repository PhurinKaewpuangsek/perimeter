<div align="center">

<img src="frontend/src/assets/perimeter_logo_negative.png" width="450" alt="Perimeter Logo" />

# Smart indoor map Navigator (V2)

**ระบบแผนที่นำทางภายในอาคารอัจฉริยะสำหรับคณะวิทยาศาสตร์และเทคโนโลยี (CS333 / CS361)**

</div>

ยินดีต้อนรับสู่พื้นที่พัฒนาของโปรเจกต์ perimeter (ส่วนหนึ่งของรายวิชา CS333/CS361) ระบบแผนที่นำทางภายในอาคารอัจฉริยะสำหรับคณะวิทยาศาสตร์และเทคโนโลยีอาคาร บร.3 หรือ LC-3 
หากคุณคือผู้พัฒนาที่จะเข้ามาร่วมงานกับเรา เอกสารฉบับนี้คือสิ่งที่ทางเราแนะนำให้อ่านเพื่อทำความเข้าใจ Architecture และขั้นตอนการสร้าง Sandbox ส่วนตัวบน AWS ก่อนเริ่มรันระบบ
> [!TIP]
> **workflow ของโปรเจกต์ที่เราใช้คือ "Trunk-based development" และ "No ClickOps":** ทรัพยากรบน Cloud ทุกชิ้นต้องถูกจัดการด้วย Infrastructure as Code (IaC) ผ่านไฟล์ `template.yaml` เท่านั้น

## Live Demo & Core Features

[Live Demo (V2 Production บน AWS S3)](http://torch-v2-site-287785301136.s3-website-ap-southeast-1.amazonaws.com/)

**ฟีเจอร์หลักในเวอร์ชัน V2:**
- **Integrated Real LC-3 Schedules:** ผสานข้อมูลตารางเรียนและตารางใช้ห้องจริงของตึก LC-3 ประจำเทอมนี้ (อ้างอิงจากการลงพื้นที่สำรวจเก็บข้อมูลจริง)
- **Purpose-Based Search:** ค้นหาพิกัดห้องเป้าหมายได้ทันทีผ่าน "รหัสวิชา" (เช่น `CS361`) และ "เวลาเรียน"
- **Dynamic Schedules:** แสดงสถานะการใช้งานของแต่ละห้องแบบ Real-time ตามตารางที่ถูกเชื่อมต่อไว้
- **Interactive SVG Map:** แผนที่ตอบสนองการคลิก ซูม และเลื่อนโฟกัสไปที่เป้าหมายโดยอัตโนมัติ

> [!NOTE]
> **Upcoming Feature:** ระบบ Web-based CRUD สำหรับปรับปรุงและแก้ไขข้อมูลตารางเรียนผ่านหน้าเว็บ กำลังอยู่ในระหว่างการพัฒนา

## Architecture & Tech Stack

![TORCH V2 Architecture](docs/TorchV2_architecture.drawio.png)

- **Frontend:** React 18, Vite, TypeScript, Tailwind CSS, GitHub Octicons (Hosted on AWS S3)
- **Backend & Compute:** AWS Lambda (Node.js 24.x) via Implicit API Gateway
- **Database:** Amazon DynamoDB (On-Demand Capacity)
- **Infrastructure as Code (IaC):** AWS SAM (`template.yaml`), `samconfig.toml`
- **Data & Tooling:** Node.js Scripts สำหรับ Validator และนำเข้าข้อมูล (Data Seeding)
- **CI/CD:** GitHub Actions (Automated Linting, Vitest, และ Automated Deployment)

### Environments

| Environment | Account | Region | Who Deploys | Lifetime | Credentials |
| :-- | :-- | :-- | :-- | :-- | :-- |
| **Dev** | AWS Academy Learner Lab | `us-east-1` | Teammate (Local via `sam deploy --config-env dev`) | Temporary (4 hours) | Temporary Session Token |
| **Prod** | Real AWS Free Tier Account | `ap-southeast-1` | GitHub Actions CI/CD (`sam deploy --config-env prod`) | Persistent | OIDC Role (Least-privilege) |

> [!IMPORTANT]
> **Production Seeding & Deployment:** ดำเนินการผ่าน GitHub Actions CD Pipeline เท่านั้น บัญชี Production ไม่อนุญาตให้ใช้ Static Access Keys หรือส่ง Request จาก Local Dev โดยตรง

## Developer Quickstart (วิธีรันและทดสอบระบบ)

โปรเจกต์นี้ทำงานแบบ Serverless 100% เพื่อไม่ให้กวน Production ทีมงานทุกคนต้องสร้าง Sandbox บนบัญชี AWS Academy ของตัวเองก่อนเริ่มพัฒนา

### 1. Pre-requisites (สิ่งที่ต้องมี)
- ติดตั้ง **Node.js**, **AWS SAM CLI** และ **AWS CLI** ในเครื่อง
- **ข้อควรระวัง:** บัญชี AWS Academy เลิกเชื่อมต่อทุกๆ 4 ชั่วโมง เมื่อเปิด Lab ใหม่ ต้องกดก๊อปปี้ AWS Credentials มาวางใน Terminal เสมอ

### 2. The "Magic" Command
คิดไม่ออกว่าจะรันระบบยังไง ให้เปิด Terminal ที่โฟลเดอร์นอกสุด (Root) แล้วรันคำสั่งเดียวนี้:
```bash
npm run bootstrap

```

**คำสั่งเดียวนี้ทำอะไรให้บ้าง?**

* `sam build & deploy`: สร้าง Lambda, API Gateway, DynamoDB และ S3
* `seed`: นำเข้าข้อมูลห้องและตารางเรียนจริงเข้า DynamoDB ของคุณ
* `env:pull`: ดึง API URL มาใส่ใน `frontend/.env.local` ให้อัตโนมัติ (ไม่ต้องก๊อปมาวางเอง)
* `site:publish`: Build และ Publish หน้าเว็บของคุณขึ้น S3 ทันที

### 3. Cheat Sheet (คำสั่งที่ใช้บ่อย)

| หากต้องการทำสิ่งนี้... | ให้รันคำสั่งนี้ |
| --- | --- |
| **รันเว็บทดสอบในเครื่อง (Local)** | `npm run dev` (ข้างในโฟลเดอร์ frontend) |
| **ทดสอบเว็บบนมือถือ (Local Network)** | `npm run dev -- --host` (แล้วเข้าผ่าน URL ที่ปรากฏ) |
| **อัปเดต Tech Stack / Lambda** | `npm run bootstrap` |
| **สร้างบัญชี Demo Users (Admin/Staff/User)** | `npm run seed:users` |
| **อัปเดตเฉพาะหน้าบ้าน (Frontend)** | `npm run site:publish` |
| **อัปเดตข้อมูล Data ในฐานข้อมูล** | `npm run seed` |
| **ล้างระบบทิ้งทั้งหมด (Clean up)** | รัน `npm run site:empty` แล้วตามด้วย `sam delete --config-env dev` |

> [!IMPORTANT]
>(สำคัญ: ต้องรัน `npm run site:empty` ก่อนลบ Stack เสมอ ไม่งั้นจะลบไม่ผ่านเพราะ S3 Bucket ยังมีไฟล์อยู่)

### 4. Authentication & Role-Based Access Control (RBAC)

ระบบการจัดการสิทธิ์การเข้าถึงข้อมูลแบ่งออกเป็น 3 ระดับบทบาท (Roles) ผ่าน AWS Cognito User Pool:

| Role | Cognito Group | สิทธิ์การเข้าถึง (API Permissions) | หน้าจอที่เข้าถึงได้ |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin` | Full Access: อ่าน, สร้าง, แก้ไข, และลบข้อมูลห้องและตารางเรียน (`POST`, `PUT`, `DELETE`) | `/map`, `/staff` (แสดงปุ่มลบและ Danger Zone) |
| **Staff** | `staff` | Edit Access: อ่าน, สร้าง, แก้ไขข้อมูลห้องและตารางเรียน (`POST`, `PUT`); **ไม่อนุญาตให้ลบข้อมูล** (`DELETE` &rarr; `403 Forbidden`) | `/map`, `/staff` (ซ่อนปุ่มลบและ Danger Zone) |
| **User** | `user` | Read Only: อ่านข้อมูลผังอาคารและตารางเรียนเท่านั้น; เรียกเส้นทาง Write ใดๆ &rarr; `403 Forbidden` | `/map`, `/staff` (แจ้งเตือนไม่มีสิทธิ์บันทึก) |
| **Anonymous** | *(ไม่มีโทเค็น)* | Read Only: เข้าใช้งานแผนที่สาธารณะ (`GET /api/locations`, `GET /api/schedules`); เรียกเส้นทาง Write &rarr; `401 Unauthorized` | `/map` |

#### การสร้าง Demo Accounts
สร้างบัญชีตัวอย่างสำหรับแต่ละบทบาทโดยส่งผ่านรหัสผ่านผ่าน Environment Variables:

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

#### การสร้างและจัดการผู้ใช้งานด้วย AWS CLI
```bash
# 1. สร้างบัญชีใหม่
aws cognito-idp admin-create-user --user-pool-id <UserPoolId> --username newstaff@torch.dev --user-attributes Name=email,Value=newstaff@torch.dev Name=email_verified,Value=true --message-action SUPPRESS

# 2. ตั้งรหัสผ่านถาวร
aws cognito-idp admin-set-user-password --user-pool-id <UserPoolId> --username newstaff@torch.dev --password "<YourSecurePassword>" --permanent

# 3. กำหนดกลุ่มสิทธิ์ (admin | staff | user)
aws cognito-idp admin-add-user-to-group --user-pool-id <UserPoolId> --username newstaff@torch.dev --group-name staff
```

### 5. AI-Assisted Development (Matt Pocock Skills)

โปรเจกต์นี้ติดตั้ง Workflow ของ AI Agent ไว้เพื่อช่วยให้ทีมเขียนโค้ดและวางแผนได้รวดเร็วขึ้น สามารถเรียกใช้ผ่านแชทด้วย Slash Commands:

* **`/grill-with-docs`**: ใช้สัมภาษณ์/พูดคุยเพื่อรีดไอเดียและสร้าง Spec ให้ชัดเจนก่อนเริ่มเขียนโค้ด
* **`/to-spec` & `/to-tickets`**: สั่งแปลงบทสนทนาเป็น Technical Spec และแบ่งเป็น Ticket ย่อยๆ
* **`/tdd` หรือ `/implement`**: สั่งให้ AI ลงมือเขียนโค้ดตาม Spec หรือทำ Test-Driven Development ให้ทันที

## Testing & CI/CD
* **Frontend Tests:** รัน `npm test` (Unit & Component Tests) และ `npm run lint`
* **Backend / IaC:** รัน `sam validate` (ตรวจ template.yaml)
* **CI/CD Pipeline:** เมื่อเปิด PR ระบบ **CodeRabbit** จะรีวิวโค้ดอัตโนมัติ และเมื่อ Merge ลง `main` แล้ว GitHub Actions จะ Deploy โค้ดขึ้น Production ให้อัตโนมัติ

## Acknowledgments
- The interactive SVG floor plans and initial map navigation nodes were originally adapted from the [ronnakrit303/CS232-Map_Navigation](https://github.com/ronnakrit303/CS232-Map_Navigation) repository.


## License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details. 

**Exceptions and Third-Party Assets:**
The MIT License applies only to the original source code and assets created for this repository. Third-party assets, specifically the interactive SVG floor plans and map navigation nodes adapted from the [ronnakrit303/CS232-Map_Navigation](https://github.com/ronnakrit303/CS232-Map_Navigation) repository, retain their original copyright. They are used here with permission for academic purposes and are EXCLUDED from this MIT License grant. Anyone wishing to redistribute or reuse those specific assets must obtain permission from their respective original authors.
