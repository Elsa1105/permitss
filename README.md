# Franklin Offshore ePermit — MVP

Hot Work Permit (Onshore) digital workflow built from form **FOI-SG-057 Rev. 0**. Companion to the Codingo proposal (30 April 2026) and the [PRD](Codingo_Franklin_ePermit_PRD.docx).

Stack: **Next.js 15 (App Router) + TypeScript + Tailwind + Supabase (Auth + Postgres + Storage) + pdf-lib**.

---

## Features (PRD §3 – §8)

| Area | Status |
|---|---|
| Auth (Supabase) — email/password, 8 hr session | ✅ |
| Roles: Applicant, Safety Assessor, SRM, Admin | ✅ |
| 4 stages: I (raise), II (endorse fit), III (approve), IV (close-out) | ✅ |
| Day 2–14 SRM endorsements | ✅ |
| Permit numbering `FOI-HWP-YYYY-NNN`, atomic | ✅ |
| Photos & sketches with arrow / circle / freehand / text annotation | ✅ |
| Tablet-first UI (8.9–11") | ✅ |
| Printable PDF mirroring FOI-SG-057 + photo appendix | ✅ |
| Append-only audit log + admin exports (CSV) | ✅ |
| Admin: CSV bulk import of qualified personnel | ✅ |
| Server-side state machine (RLS + SECURITY DEFINER functions) | ✅ |
| Separation of duties (SRM cannot approve own permit) | ✅ |

---

## Getting started

### 1. Install
```bash
npm install
```

### 2. Configure Supabase
1. Create a Supabase project at https://app.supabase.com.
2. Copy `.env.local.example` → `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (Settings → API)

### 3. Apply migrations

Either with the Supabase CLI (recommended):
```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

Or paste each file in `supabase/migrations/` into Supabase Studio's SQL Editor in order:
1. `0001_init.sql` — tables + enums
2. `0002_functions.sql` — state-transition RPCs
3. `0003_rls.sql` — row-level security + signup trigger
4. `0004_storage.sql` — `permit-photos` bucket + policies

### 4. Create the first admin user
1. In Supabase Dashboard → Authentication → Users → **Add user**, create an admin (e.g. your email). Use `Send invite` so they set their own password.
2. Promote them to admin by running:
   ```sql
   update public.users
      set role = 'admin',
          qualified_for = '{hot_work_applicant,hot_work_assessor,hot_work_srm}',
          full_name = 'Your Name',
          department = 'IT'
    where email = 'you@franklin.example';
   ```

### 5. Run the app
```bash
npm run dev
# → http://localhost:3000
```

Sign in with the admin account you just created. From **Admin → Users** you can bulk-import qualified supervisors / assessors / SRMs via CSV.

---

## Project structure

```
app/
  (app)/                     # auth-gated routes
    dashboard/               # role-aware queues
    permits/
      new/                   # raise a permit
      [id]/                  # detail + stage I-IV forms
    admin/
      users/                 # user management + CSV import
      audit/                 # audit-log viewer
  api/
    permits/                 # POST → create permit
    permits/[id]/stage1..4/  # stage transition RPC wrappers
    permits/[id]/endorsements/
    permits/[id]/pdf/        # PDF generator
    admin/users/csv/         # bulk-import qualified personnel
    admin/audit/export/      # CSV audit export
    admin/permits/export/
  login/                     # sign-in page
  auth/callback/             # OAuth/invite callback

components/
  app-shell.tsx              # tablet-first sidebar layout
  permit/
    new-permit-form.tsx
    stage-{1..4}-form.tsx
    endorsement-form.tsx
    photo-uploader.tsx       # camera / gallery, annotate, delete
    photo-annotator.tsx      # canvas: arrow, circle, freehand, text label
    permit-detail.tsx        # stage cards + Day 2-14 grid + signature panels
    status-badge.tsx
  dashboard/permit-table.tsx
  ui/                        # Button, Input, Card, Dialog, Badge, Checkbox, …

lib/
  auth/session.ts            # requireUser / requireRole / requireAdmin
  permits/
    state-machine.ts         # mirror of server state machine for UI
    schemas.ts               # zod input schemas
    queries.ts               # server-side data loaders
    day.ts                   # Day-N helpers
    hazards.ts
  pdf/generate-permit-pdf.ts # FOI-SG-057-style A4 layout
  supabase/{client,server,middleware,env,types}.ts
  utils.ts

supabase/
  migrations/0001_init.sql           # tables + enums + indexes
  migrations/0002_functions.sql      # transition RPCs (security definer)
  migrations/0003_rls.sql            # RLS + auth.users → public.users trigger
  migrations/0004_storage.sql        # photos bucket + path-based policies
  config.toml                        # local CLI config

middleware.ts                # session refresh + route protection
```

---

## Security model

The state machine is enforced **in the database**, not in the UI:
- Direct `update permits set state = …` is denied by RLS.
- All transitions go through `security definer` RPC functions
  (`permit_submit_stage1` / `…stage2` / `…stage3` / `…stage4` / `permit_endorse_day`).
- Each function checks: caller's role, qualification array, current state,
  and (for Stage III) separation of duties.
- Every successful transition writes an `audit_log` row via `write_audit()` —
  also `security definer`. RLS denies direct inserts/updates/deletes to the
  audit log from any role, including admin.

User identity:
- Authenticated session is the only allowable signatory. Stage forms
  pull name/department/timestamp from `auth.uid()` server-side; the client
  cannot set them.
- Admins can deactivate users (`active = false`) — the `current_user_row()`
  helper rejects them at the RPC boundary.

Photos:
- Stored in the `permit-photos` Supabase Storage bucket using path convention
  `{permit_id}/{photo_id}.{ext}`. The first segment is checked against the
  permits row to authorize read/write. Signed URLs (1 hr) are minted server-side.

---

## Permit numbering

`next_permit_serial('hot_work_onshore')` atomically increments a per-(type, year)
counter and returns `FOI-HWP-{YYYY}-{NNN}` (Singapore time). Counter resets
each calendar year. Sequence is gap-free under contention — `INSERT … ON
CONFLICT DO UPDATE … RETURNING` guarantees atomicity.

Format is configurable in `0002_functions.sql` if Franklin's preferred format
turns out to be different (PRD OQ-1 is open).

---

## Acceptance criteria walkthrough (PRD §8)

Each row maps to an automated/manual demo path:

| Criterion | How to verify |
|---|---|
| Admin uploads CSV → users appear | Admin → Users → CSV upload → Users table refreshes |
| Applicant raises permit, fills Stage I + photo | New Permit → submit → Stage I form → checklist + photo |
| Serial auto-generates | Visible in URL/header after creation |
| Assessor marks fit + remarks → moves to SRM | Assessor login → dashboard queue → fit |
| SRM approves on mobile | Open detail on tablet/mobile → Stage III → Approve |
| PDF visually resembles FOI-SG-057 | "Print PDF" button on detail page |
| Day 2 endorse, Day 4 revoke | Multi-day permit → endorsement form (auto-shows current day) |
| Stage IV close-out | Applicant detail page → Stage IV → confirm |
| User cannot sign as another | Try editing form data — name comes from session, not form |
| Unqualified user cannot endorse | RPC throws "User is not qualified to endorse Hot Work Stage II" |
| Audit log shows every transition | Admin → Audit Log |
| CSV/PDF exports | Admin → Audit Log → Export CSV; Detail → Print PDF |
| Tablet 11" portrait works | App is tested at 768/1024 breakpoints |

---

## Open items (PRD §9, blocking)

| # | Question | Where it surfaces in code |
|---|---|---|
| OQ-1 | Permit number format | `next_permit_serial` in `0002_functions.sql` |
| OQ-2 | Validity / auto-expiry grace | `permit_auto_expire()` (currently 2 days, called manually) |
| OQ-3 | Daily endorsement frequency | `EndorsementForm` UI + permit_endorsements unique constraint |
| OQ-5 | Final terminology | `STATE_LABEL` in `lib/permits/state-machine.ts` |
| OQ-8 | PDF exact-match vs modernised | `lib/pdf/generate-permit-pdf.ts` |
| OQ-11 | Multi-company support | `permits.permit_type` is reserved; multi-tenant column not yet added |
| OQ-12 | Word version of FOI-SG-057 | n/a (PDF used as visual reference for now) |
| OQ-13 | CSV qualified-personnel files | Template at `/api/admin/users/csv?template=1` |

---

## Scripts
- `npm run dev` — Next dev server
- `npm run build` — production build
- `npm run start` — production server
- `npm run typecheck` — TypeScript check
- `npm run db:push` — apply migrations via Supabase CLI

---

## License
Proprietary — Franklin Offshore International Pte Ltd / Codingo Assignments Pte. Ltd.
#   p e r m i t  
 