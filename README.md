# CivicPulse AI

Intelligent Civic Complaint Management and Urban Intelligence System

## Project Goal

CivicPulse AI is an intelligent civic complaint management system that uses Data Structures, Algorithms, AI and web technologies to help authorities prioritize, analyze and resolve civic complaints efficiently.

## Core Technologies

- C++
- Data Structures and Algorithms
- React
- Node.js
- MongoDB
- Python
- AI/ML

## SMS status updates

Citizens can opt in to short SMS updates (registered, needs review, approved, not approved, in progress, resolved, moved back to pending). Opting in is optional, unchecked by default, and can be withdrawn at any time under **My Complaints**. Both choices are timestamped. A mobile number is never required to report a complaint.

An SMS is sent only when **all** of these are true:

1. An SMS provider is configured on the backend (see `backend/.env.example`).
2. That message kind has an approved DLT template (MSG91).
3. The citizen has opted in.
4. The citizen's number has been verified by OTP.

Otherwise the in-app notification is still created and records why no SMS was sent (`not_configured`, `template_missing`, `no_consent`, `unverified`, `no_mobile`). SMS failures never undo a complaint update.

Delivery states are recorded as follows:

- `accepted` means the provider took the message. It does not mean the message was delivered.
- `delivered` and `failed` are recorded only from the provider's delivery-report webhook (`POST /api/sms/delivery-report`).

### Enabling real SMS in India (MSG91)

These steps require account owner action:

1. **Register on a DLT portal** (Jio, Airtel, Vi or BSNL) as a Principal Entity. You need a PAN, GST/TAN and an authorisation letter. Approval usually takes a few working days and involves a registration fee.
2. **Register a 6-character sender header** (for example `CIVPLS`) for the transactional/service category.
3. **Register one content template per message.** The exact texts are listed next to each `MSG91_TEMPLATE_*` variable in `backend/.env.example`, with `{#var#}` standing in for the complaint ID or OTP code.
4. **Set up MSG91.** Create an MSG91 account, link the DLT entity, header and templates, and create matching MSG91 templates. Each template's variable must be named `var1`.
5. **Add the variables in Render:** `SMS_PROVIDER=msg91`, `MSG91_AUTH_KEY`, `MSG91_SENDER_ID` and the `MSG91_TEMPLATE_*` IDs. Add them only in Render, never in Vercel or any `VITE_*` variable.
6. **Turn on delivery reports.** Set `SMS_WEBHOOK_SECRET` in Render. Then add an MSG91 webhook (SMS → "On Report Received", JSON) pointing to `https://<backend>/api/sms/delivery-report?secret=<value>`.

## Suspicious-submission review

New complaints are checked by explainable rules (`backend/services/suspicionDetector.js`):

- a near-duplicate of an open complaint from the same account
- unusually many submissions from one account
- an unusable location
- content checks: abuse, threats, spam or links, and meaningless text

If any rule fires, the complaint is **held for an administrator**. The rule, its evidence and any matching complaint IDs are stored with it. The citizen gets a neutral "needs additional review — no final decision has been made" notice.

Nothing is ever rejected automatically. Only an administrator can reject a complaint, and only with a written reason. Administrators can also approve a held complaint or dismiss the flag as a false positive. Similar reports from different citizens are linked for the administrator but are never treated as suspicious. Flags never change priority scoring.
