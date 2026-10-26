# Scale Readiness: Caching, Throttling & Reserved Concurrency

เอกสารสรุปผลการปรับปรุงโครงสร้างพื้นฐานและการจัดการโหลดสำหรับการใช้งานหนาแน่น (Rush Hour / วันเริ่มภาคการศึกษา / วันสอบ) ตาม Issue [#149](https://github.com/PhurinKaewpuangsek/perimeter/issues/149).

---

## 1. ฐานการใช้งานก่อนการปรับปรุง (Baseline Measurement)

บันทึกจำนวนครั้งการเรียก API (Invocation) และขนาดข้อมูล (Payload Size) สำหรับผู้ใช้ 1 คนที่เปิดหน้า `/map`:

| Endpoint | Method | จำนวน Invocation | ขนาดข้อมูลดิบ (JSON) | ขนาดหลังบีบอัด (Gzip) | ลักษณะการเรียก |
| :--- | :---: | :---: | :---: | :---: | :--- |
| `/api/locations` | GET | 1 | ~135 KB (131 รายการ) | ~9.8 KB | โหลดพิกัดและข้อมูลห้องทั้งหมด |
| `/api/schedules` | GET | 1 | ~48 KB (~200 รายการ) | ~4.2 KB | โหลดตารางเรียน/สอบภาพรวม |
| `/api/graph` | GET | 1 | ~92 KB (590 รายการ) | ~9.5 KB | โหลด Topo Node และ Edge ทางเดิน |
| **รวมต่อ 1 ผู้ใช้** | - | **3 Invocations** | **~275 KB** | **~23.5 KB** | - |

### ปัญหาก่อนปรับปรุง
1. **การดึงซ้ำบ่อยครั้ง**: Hooks `useRooms` และ `useSchedules` มี event listener `window.onFocus` ที่ยิง request ใหม่ทุกครั้งที่สลับแท็บกลับมาหน้าเว็บ
2. **การสลับหน้ายิงใหม่**: การสลับไปหน้าระหว่าง `/`, `/map`, `/admin` ทำให้ Hook mount ใหม่และดึงข้อมูลจากเครือข่ายซ้ำ
3. **ไม่มี Cache Header จากฝั่ง Cloud**: Lambda ส่งเฉพาะ `Access-Control-Allow-Origin: *` และฝั่ง frontend กำหนด `{ cache: 'no-store' }` ทำให้เบราว์เซอร์ไม่เก็บแคช ต้องดึงข้อมูลเต็มจำนวนทุกครั้ง
4. **ความเสี่ยง Lambda Concurrency Starvation**: ใน AWS Academy Learner Lab หากมีผู้ใช้เข้าพร้อมกันจำนวนมาก ฟังก์ชันอ่านอาจแย่ง concurrency โควตาจนกระทบเส้นทางเขียนหรือระบบทั้งหมด

---

## 2. กลยุทธ์การแคช (Caching Strategy)

### ข้อจำกัดของ AWS Learner Lab
- **API Gateway Cache Cluster (`CacheClusterEnabled: true`)**: มีค่าใช้จ่ายรายชั่วโมง (~$0.020/ชม. หรือขั้นต่ำ ~$14/เดือน) และถูกจำกัดสิทธิ์ในบัญชี AWS Learner Lab ไม่สามารถสร้างคลัสเตอร์ได้
- **แนวทางที่เลือก**: ใช้ **Multi-Tier Caching** ได้แก่:
  1. **HTTP `Cache-Control` Headers** ที่ส่งจาก Lambda ผ่าน Implicit API Gateway
  2. **In-Memory Caching ภายใน Lambda Container** สำหรับ warm instances
  3. **Browser Cache & Frontend In-Memory Deduplication**

### ตารางกำหนดค่า TTL และ Headers

| Endpoint | Lambda Memory Cache TTL | HTTP `Cache-Control` Header | เหตุผลทางสถาปัตยกรรม |
| :--- | :---: | :--- | :--- |
| `GET /api/locations` | 60 วินาที | `public, max-age=60, stale-while-revalidate=30` | ข้อมูลห้องและพิกัดอาคารเปลี่ยนแปลงน้อยมาก |
| `GET /api/schedules` | 60 วินาที | `public, max-age=60, stale-while-revalidate=30` | ตารางเรียนเปลี่ยนแปลงเฉพาะเมื่อ Staff แก้ไข แคชได้ 1 นาที |
| `GET /api/graph` | 15 วินาที | `public, max-age=15` | มีข้อมูลการปิดทางเดิน/ห้อง (Closures) ต้องสะท้อนผลภายใน $\le 30$ วินาที (15s container + 15s HTTP) |
| `GET /api/route` | 15 วินาที (Topology) | `public, max-age=15` | คำนวณเส้นทางเลี่ยงทางปิด ต้องสะท้อนผล closure ภายใน $\le 30$ วินาที (15s container + 15s HTTP) |
| **Error (4xx / 5xx)** | ไม่แคช | `no-store` | ไม่แคชผลลัพธ์ที่ผิดพลาด |
| **Write / Auth Routes** | ไม่แคช | ไม่มี public cache / Authorizer บังคับ | ป้องกันข้อมูลส่วนบุคคลและการแก้ไขรั่วไหล |

---

## 3. การจำกัดอัตราการยิง (Throttling)

กำหนดผ่าน `template.yaml` ในส่วน `Globals: Api: MethodSettings` เพื่อแยกโควตาระหว่างเส้นทางอ่านและเส้นทางเขียน:

```yaml
Globals:
  Api:
    MethodSettings:
      # Read routes: รองรับโหลดอ่านพร้อมกันได้สูง
      - ResourcePath: "/*"
        HttpMethod: "GET"
        ThrottlingRateLimit: 100
        ThrottlingBurstLimit: 200
      # Write routes: จำกัดอัตราเพื่อป้องกันการสแปมและการเขียนทับฐานข้อมูล
      - ResourcePath: "/*"
        HttpMethod: "POST"
        ThrottlingRateLimit: 20
        ThrottlingBurstLimit: 40
      - ResourcePath: "/*"
        HttpMethod: "PUT"
        ThrottlingRateLimit: 20
        ThrottlingBurstLimit: 40
      - ResourcePath: "/*"
        HttpMethod: "DELETE"
        ThrottlingRateLimit: 20
        ThrottlingBurstLimit: 40
```

---

## 4. การจัดการ Concurrency ของ Lambda และการปลด Reserved Concurrency (Hotfix #171)

> **หมายเหตุการแก้ไขฉุกเฉิน (Hotfix #171):**
> เดิมมีการกำหนด `ReservedConcurrentExecutions` ให้กับ Lambda ฟังก์ชันอ่านหลัก 4 ตัว รวม 45 คอนเทนเนอร์ อย่างไรก็ตาม การกำหนด Reserved Concurrency ทำให้ CloudFormation ต้องเรียกใช้ AWS Lambda API `lambda:PutFunctionConcurrency` และ `lambda:DeleteFunctionConcurrency`
> ตามหลัก **IAM Least Privilege** ของ Perimeter บทบาท OIDC (`GitHubActionsOIDCRole`) ที่ใช้ในการทำ Automated CD บน GitHub Actions ไม่ได้รับสิทธิ์ระดับ Account ในการตั้งค่าหรือลบ Concurrency ของ Lambda ส่งผลให้การ Deploy บน CD Pipeline ล้มเหลว (`AccessDenied`) และทำให้ CloudFormation Stack เข้าสู่สถานะ `UPDATE_ROLLBACK_FAILED`
> 
> เมื่อพิจารณาร่วมกับมาตรการป้องกันที่มีอยู่แล้ว:
> 1. **API Gateway MethodSettings Throttling** (Read: 100 rps / 200 burst) สกัดกั้น Spike โหลดเกินขนาดตั้งแต่ขอบระบบก่อนถึง Lambda
> 2. **Multi-Tier Caching** (HTTP `Cache-Control` 15–60s + In-memory 15–60s + Frontend Deduplication) ช่วยให้ request ส่วนใหญ่ได้ cache ทันที ลด cold start และ invocation จริงลงมหาศาล
>
> จึงทำการ**ปลด `ReservedConcurrentExecutions` ออกจาก `template.yaml`** เพื่อให้สอดคล้องกับ Least-Privilege IAM Boundary ของระบบ CI/CD ส่งผลให้ฟังก์ชันอ่านและฟังก์ชันเขียนกลับมาแชร์ Unreserved Concurrency Pool ของบัญชีร่วมกัน แม้ว่าจะไม่มี Concurrency Isolation แยกขาดระหว่าง Read และ Write อีกต่อไป แต่ภาระโหลดจริงถูกควบคุมและสกัดกั้นไว้ด้วย **API Gateway MethodSettings Throttling** (Read 100 rps, Write 20 rps) และ **Multi-Tier Caching** (15–60s) ซึ่งช่วยลดความเสี่ยงจากการแย่ง Concurrency ลงอย่างมีนัยสำคัญ

### การเปรียบเทียบและการกำหนดค่าเดิม

AWS กำหนดให้ต้องเหลือ Unreserved Account Concurrency อย่างน้อย 100 เสมอ สำหรับฟังก์ชันอื่น ๆ ในบัญชี เพื่อความปลอดภัยในโควตาของ AWS Academy Learner Lab จึงตั้งค่า Reserved Concurrency ให้กับ Lambda อ่านความถี่สูงสุดดังนี้ (กำหนดผ่าน CloudFormation Parameters เพื่อให้ปรับลดหรือ override ได้ตามโควตาของบัญชีเป้าหมาย):

| Lambda Resource | Function Name | Parameter Name | Reserved Concurrency | Memory |
| :--- | :--- | :--- | :---: | :---: |
| `GetLocationsFunction` | `functions/get-locations` | `LocationsReservedConcurrency` | **10** | 1024 MB |
| `GetSchedulesFunction` | `functions/get-schedules` | `SchedulesReservedConcurrency` | **10** | 1024 MB |
| `GetGraphFunction` | `functions/get-graph` | `GraphReservedConcurrency` | **10** | 1024 MB |
| `GetRouteFunction` | `functions/get-route` | `RouteReservedConcurrency` | **15** | 1024 MB |
| **รวมที่กันไว้ (Reserved)** | - | - | **45** | - |

ประโยชน์:
- ป้องกันไม่ให้ Lambda อ่านเดียวกินโควตา Lambda ทั้งบัญชีจนหมด
- รับประกันว่าเส้นทางอ่านหลักจะมี concurrency ขั้นต่ำพร้อมตอบสนองเสมอแม้ระบบส่วนอื่นมีโหลดสูง

---

## 5. การปรับปรุงความทนทานฝั่ง Frontend

### 5.1 In-Flight Deduplication & In-Memory Cache
- **`useRooms`**:
  - ผสาน Request ที่กำลังประมวลผล (In-flight promise deduplication) หากมีคอมโพเนนต์เรียกพร้อมกัน
  - แคชข้อมูลในระดับ Module Memory (TTL 60 วินาที) เมื่อสลับหน้าไปมาจะไม่ยิงซ้ำ
  - Event `window.onFocus` จะตรวจสอบอายุของข้อมูลก่อน หากยังไม่เกิน 60 วินาทีจะไม่ยิงเครือข่ายซ้ำ
- **`useSchedules`**:
  - ใช้ Promise deduplication และ Memory caching แบบเดียวกัน (TTL 60 วินาที)
  - รองรับการกดปุ่ม `reload()` เพื่อ force refresh ข้อมูลสด

### 5.2 Resilient Client พร้อม Exponential Backoff & Jitter
- ยูทิลิตี้ `fetchWithRetry` ใน `frontend/src/services/apiClient.ts`:
  - เมื่อได้รับสถานะ HTTP 429 (Too Many Requests) หรือ 5xx (500, 502, 503, 504) จะลองใหม่สูงสุด 3 ครั้ง
  - คำนวณช่วงเวลารอแบบ Exponential Backoff พร้อม Random Jitter:
    $$\text{Delay} = \min(\text{maxDelay}, \text{baseDelay} \times 2^{\text{attempt}}) \times (0.5 + 0.5 \times \text{random})$$
  - หากยังคงโดน 429 หลัง retry ครบ จะส่งข้อความแจ้งเตือน:
    `"ระบบกำลังคนใช้งานมาก ลองใหม่"`
- หน้าจอ `LoadingScreen.tsx` และข้อความเตือนในระบบ:
  - แสดงข้อความเตือนที่เป็นมิตรพร้อมปุ่มกดลองใหม่ ("ลองใหม่") ไม่แครชหรือค้างหน้าจอขาว

---

## 6. การตรวจสอบโครงสร้าง DynamoDB (Audit)

ยืนยันการตั้งค่าตารางและวิธีการเข้าถึงข้อมูลตามข้อกำหนด `AGENTS.md`:

| Table Name | Billing Mode | Partition Key (PK) | Sort Key (SK) | Query Pattern ใน User Path |
| :--- | :---: | :--- | :--- | :--- |
| `SmartFacultyLocations` | `PAY_PER_REQUEST` | `location_id` (S) | - | Scan (131 รายการ) มี Cache หน้าด่าน 60s |
| `SmartFacultySchedules` | `PAY_PER_REQUEST` | `room_code` (S) | `schedule_slot` (S) | Query ตาม `room_code` หรือ Scan ครั้งแรกที่มี Cache 60s |
| `SmartFacultyPins` | `PAY_PER_REQUEST` | `user_id` (S) | `pin_id` (S) | **Query** ตาม `user_id` เท่านั้น ไม่ใช้ Scan |
| `SmartFacultyGraph` | `PAY_PER_REQUEST` | `graph_id` (S) | `element_id` (S) | **Query** ตาม `graph_id = 'LC3'` เท่านั้น ไม่ใช้ Scan |

- ทุกตารางเป็น On-Demand (`BillingMode: PAY_PER_REQUEST`)
- เส้นทาง Navigation วิกฤต (`/api/graph`, `/api/route`, `/api/pins`) ใช้ `QueryCommand` 100% ไม่มีการใช้ `Scan`

### 6.1 การคำนวณอัตราการอ่าน DynamoDB เมื่อปรับลด Topology TTL (15 วินาที)
- **ความถี่ในการโหลดซ้ำ (Reload Frequency)**:
  - การลด TTL ของ Topology และ Graph จาก 30 วินาที เหลือ 15 วินาที ส่งผลให้อินสแตนซ์ Lambda (Warm Container) มีการดึงข้อมูล `SmartFacultyGraph` ซ้ำสูงสุดประมาณ **4 ครั้งต่อนาทีต่อคอนเทนเนอร์** (จากเดิม 2 ครั้งต่อนาที)
- **การประเมิน Read Capacity Units (RCU)**:
  - ข้อมูลกราฟ `LC3` มีขนาดรวม ~92 KB (~590 รายการ) การ query ทั้งหมดใช้ pagination 1 รอบ (DynamoDB paginates ที่เพดาน 1 MB, ข้อมูล 92 KB จึงอ่านเสร็จใน query command เดียว แต่คิดตามขนาดข้อมูลคือ 92 KB / 4 KB = ~23-24 RCU ต่อ 1 full query)
- **การประเมิน RCU เชิงประวัติศาสตร์ (Historical Baseline)**:
    - เดิมคำนวณไว้ที่ $\sim 40\text{ RCU/วินาที}$ บนสมมติฐานเพดาน Reserved Concurrency รวม 25 คอนเทนเนอร์ ($(15 + 10) \times 4 = 100\text{ queries/นาที} \approx 1.67\text{ queries/วินาที} \times 24 \approx 40\text{ RCU/วินาที}$)
  - **การประเมินด้วย Retained Controls (Hotfix #171)**:
    - เมื่อปลด Reserved Concurrency และฟังก์ชันอ่านแชร์ Unreserved Concurrency ร่วมกับบัญชี ขีดจำกัดสูงสุดของคำขออ่านทั้งหมดถูกกำกับโดย API Gateway Throttling ที่เพดาน 100 requests/s (Burst 200)
    - ด้วย In-Memory Container Cache (TTL 15 วินาที) และ HTTP `Cache-Control: public, max-age=15` คำขอส่วนใหญ่จะถูกตอบกลับจาก Browser หรือ Memory Cache ทันทีโดยไม่ต้อง Query ซ้ำไปที่ DynamoDB
    - แม้ในกรณีที่คอนเทนเนอร์ใหม่ถูกเรียกพร้อมกันภายใต้ Throttling เพดาน 100 req/s อัตราการอ่าน DynamoDB เฉลี่ยจะยังคงอยู่ในหลักสิบถึงร้อย RCU/s ซึ่งต่ำกว่าเพดาน 40,000 RCU/s ของตารางแบบ On-Demand (`PAY_PER_REQUEST`) อย่างปลอดภัย
