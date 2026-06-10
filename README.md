# 🚀 Production-Grade Cyber Café Management System
### Designed & Architected for Self-Service Cyber Cafés in Kenya

A secure, scalable, and automated self-service Cyber Café Management platform built with **Node.js, React (Vite + TypeScript), TailwindCSS, and PostgreSQL**. 

This system allows public customers to upload documents via a QR code, receive instant automated page counts & cost calculations, check out and trigger a secure **Safaricom M-Pesa Daraja STK Push**, and then routes the paid jobs automatically to local print queues (**Linux CUPS / Windows Spooler ready**) with zero manual attendant downloads.

---

## 🧠 CORE SYSTEM FLOW

```
[CUSTOMER MOBILE/PC]
  │  (No Account / Login Required)
  ├──► Upload Document (PDF/DOCX/PNG/JPG)
  │    ├──► Backend: Malware Signatures & Magic-Bytes Verification
  │    ├──► Backend: Parse page counts & B/W vs Color heuristic
  │    └──► Frontend: Live Pricing Engine & Breakdown
  │
  ├──► Checkout: Input Safaricom Phone Number
  │    └──► Trigger Lipa Na M-Pesa (Daraja STK Push / Mock Sandbox Webhook)
  │
  └──► Poll / Webhook Callback Confirmation
       │
       ▼ (Real-time Payment Accepted)
[AUTOMATED HARDWARE PRINT QUEUE]
  │
  ├──► Secure Document Streaming (Master File resides outside Public Directory)
  └──► Linux CUPS / Windows Agent prints directly via temporary signed tokens
```

---

## ⚙️ TECHNICAL STACK & SECURITY FEATURES

### 🔒 1. Ultimate File & API Security (Zero Public Exposure)
* **Isolated File System**: Uploaded files are saved to `backend/uploads/` which is entirely isolated and **not served** as a static public directory. No raw file path exposure is possible.
* **Cryptographic Short-Lived Tokens**: File downloading or streaming to hardware printers utilizes JWT-signed access tokens that expire in **5 minutes** (`purpose: print_agent_fetch`).
* **Multi-stage Malware & Spoofing Guard**:
  * **Magic Bytes Analyzer**: Inspects hex headers (e.g., `%PDF` or `\x89PNG`) to block executable files disguised with a `.pdf` extension.
  * **Double Extension Filter**: Drops files ending in malicious double structures (e.g., `invoice.pdf.exe`).
  * **JavaScript Macro Scan**: Sanitizes text nodes in PDF structures for `/JS` or `/Launch` instructions.

### 💰 2. Smart Pricing & Lipa Na M-Pesa Engine
* **Pre-calculated Integrity**: Cost calculation is performed dynamically on the backend using database parameters to prevent client-side total price spoofing.
* **Daraja STK Push**: Initiates standard Lipa Na M-Pesa requests over Safaricom sandbox URLs.
* **Offline Sandbox Simulator**: Integrated simulated callback triggers (`/api/payment/simulate-success` or `/api/payment/simulate-failure`) that update database records, trigger WebSocket pushes, and queue printing jobs instantly.

### 🖨️ 3. Physical Printer Integration (Linux CUPS & Windows Spooler Ready)
* **CUPS / Spooler Agent ready**: The backend exposes dynamic JSON streams or WebSocket events representing the active print queues.
* **Virtual Terminal Log Monitor**: An integrated terminal log is built right into the Attendant view to trace mechanical commands (rollers, warming fusers, paper feeding) showing how local printers execute operations.

---

## 🗄️ DATABASE ARCHITECTURE (POSTGRESQL)

The system utilizes an optimized PostgreSQL schema with indexes on foreign keys and unique constraints to ensure sub-millisecond query execution.

* `cybers` (UUID): General branch profiles.
* `users` (UUID): Authorized staff only (Roles: `owner` or `attendant`).
* `services` (UUID): CRUD pricing list (e.g., B/W Printing, Color Printing, Lamination).
* `orders` (UUID): Main checkout records tracked by `order_number` and `phone`.
* `order_items` (UUID): Detailed services quantity breakdown.
* `documents` (UUID): Secured file attributes (File path, detected page tallies).
* `payments` (UUID): Lipa Na M-Pesa Checkout IDs and receipt codes.

---

## 📂 DIRECTORY STRUCTURE

```
/home/user/cybercafe/
├── start.sh                 # Consolidated one-click launcher shell script
├── README.md                # System engineering handbook
├── backend/                 # Node.js + Express TypeScript Server
│   ├── src/
│   │   ├── config/          # DB config and seeding script
│   │   ├── controllers/     # Auth, Order, Payment, Service, Upload and Stats
│   │   ├── middleware/      # Auth security upload and errors
│   │   ├── routes/          # Clean routing controllers
│   │   ├── services/        # M-Pesa Daraja, Analyzer, Print queue, Audit Logger
│   │   ├── types/           # pdf-parse TypeScript declaration files
│   │   └── index.ts         # Server entrypoint with Socket.io binding
│   ├── .env                 # Environment variables configuration
│   └── package.json
└── frontend/                # React (Vite + TypeScript) Dashboard
    ├── src/
    │   ├── components/      # Public Self-Service Cafe & Staff Panel
    │   ├── App.tsx          # Main workspace portal switcher
    │   ├── index.css        # Tailwind directives and custom scrollbars
    │   └── main.tsx         # React bootstrapper
    ├── tailwind.config.js
    └── package.json
```

---

## 🚀 GETTING STARTED

### 🔑 Default Credentials (Staff Portal)
Use these seeded accounts to authenticate into the Attendant Portal:

| Role | Email | Password |
|---|---|---|
| **Owner** | `owner@cyber.com` | `password123` |
| **Attendant** | `attendant@cyber.com` | `password123` |

---

### 🕹️ How to Start & Test the Complete Flow

1. **Launch the Servers**
   Run the initial unified shell script inside `/home/user/cybercafe`:
   ```bash
   ./start.sh
   ```
   This command starts PostgreSQL, executes database schema seeding, boots the Express backend on Port `5000`, and serves the Vite React production bundle on Port `3000`.

2. **Step-by-Step Testing Guide (Interactive Demo)**:
   * **Upload**: Go to `http://localhost:3000` (Customer Portal). Select a document (PDF, PNG, JPG) to upload. Watch the system parse page counts, B/W vs Color, and run macro/magic-bytes scanners!
   * **Configure & Estimate**: Select extras like *Spiral Binding* or *Lamination*. Notice how the Pricing Engine instantly updates invoice breakdowns in KES.
   * **Checkout**: Enter any phone number (e.g., `0712345678`) and click **"Pay via M-Pesa"**.
   * **Simulate Payment Webhook**: A modal will display an STK push in progress. Click **"Simulate Success"** on the Developer Sandbox Toolbar. This simulates Safaricom sending a successful payment callback webhook to `/api/payment/callback`.
   * **Automated Printing**: Go to the **Attendant Portal** (by clicking the switcher at the top right) and login as `attendant@cyber.com` (password: `password123`). Navigate to the **Auto Print Queue** tab. You'll see the paid document queued!
   * **Execute Hardware Spooling**: Click **"Execute Print Direct"** on the paid job. The physical CUPS terminal emulator on the right side will print real-time logs simulating physical paper feeding, fuser warming, and sheet completion!
   * **Stats and Management**: Toggle the **Revenue Dashboard** or **Services Control** tab. Change a service price, return to the customer side, and observe the live estimate adjust to the new pricing!
