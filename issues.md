# Franklin ePermit Missing Features and Open Work

This backlog is based on the implemented app, `Codingo_Franklin_ePermit_PRD.docx`, the meeting audio note `Block 437 Woodlands St 41.m4a`, and the client follow-up emails `RE__HSE_-_ePermit.eml` / `RE__HSE_-_ePermit (1).eml`.

## Missing Features

### 1. Guest / Contractor Account Flow

Current roles are only:

- `applicant`
- `assessor`
- `srm`
- `admin`

The meeting discussed a new guest/contractor-style role for external parties such as crane, diving, cleaning, and confined-space contractors. These users would still log in with email/password, but should not necessarily be treated as Franklin foremen or safety assessors.

The follow-up emails clarify that this should be a `guest applicant` style account. Contractors submit permit forms only. They should not act as assessors, approvers, or SRMs.

Work needed:

- Add/confirm a `guest_applicant` or contractor role.
- Define what this role can create, view, edit, submit, and resubmit.
- Block guest users from assessor, SRM, admin, and approval actions.
- Add contractor self-declaration and worker-briefing acknowledgement fields.
- Update RLS, RPC guards, admin user management, dashboard queues, and permit forms.

### 2. External Applicant Details

The permit currently has only a free-text `contractor` field. The meeting discussed capturing additional details for external contractor submissions, and the follow-up emails list core contractor fields.

Work needed:

- Add fields such as contractor applicant name, company, supervisor type, supervisor registration number, email, and contact number if Franklin requires them.
- Support examples such as crane supervisor registration number and dive supervisor/manager registration number.
- Decide whether these values are self-declared or validated against a maintained list.
- Add contractor self-declaration wording approved by Franklin.
- Include these details in permit detail pages, exports, PDFs, and audit/history where relevant.

### 3. Supporting Document Uploads

Current upload functionality is photo-only. The meeting and follow-up emails explicitly raised PDF and other supporting document uploads, especially mandatory Risk Assessment documents.

Work needed:

- Add a general attachments table, separate from `permit_photos`.
- Support PDFs and other allowed document types.
- Make Risk Assessment upload mandatory for Guest Applicant submissions if Franklin confirms this rule.
- Add a structured "top controls" summary field linked to the uploaded RA.
- Add Supabase Storage policies for attachments.
- Add upload/download/delete UI.
- Include attachment references in the permit detail page and export/PDF flow.
- Audit attachment add/remove actions.

### 4. QR Code Live Permit View

The meeting discussed a static QR code whose URL does not change, while the scanned page always shows the latest permit/version/status.

Work needed:

- Generate a QR code for each permit.
- Add a stable QR/public URL.
- Build a QR-scanned permit view that shows the latest permit state.
- Ensure the static QR always resolves to the current/latest permit representation, not an outdated PDF copy.
- Decide what information can be publicly displayed, since the QR may be pasted at the worksite.
- Consider tokenized URLs or access controls if the scanned content is sensitive.
- Review anti-fraud/security concerns raised in email, including QR phishing, malware replacement, and spoofed permit pages.
- Include QR code in printable PDF.

### 5. Email Notifications / Recipient Lists / Escalations

The PRD puts notifications out of MVP scope, but the meeting discussed email lists and sending to one or more parties.

Work needed:

- Collect recipient email lists from Franklin.
- Support pre-configured HOD/approval/notification lists where Franklin provides them.
- Define notification events, such as permit created, Stage I submitted, Stage II completed, SRM approval needed, daily endorsement due, revoked, closed, and expired.
- Define escalation events, such as overdue approval, permit nearing expiry, permit expired, scope change, rejected permit, incident, or near miss.
- Implement email sending.
- Add admin controls for recipient groups or per-role notifications.
- Audit notification sends or failures if required.

### 6. SRM Endorsement Workflow

The code has Day 2-14 endorsement UI, but the meeting clarified that the SRM is a coordinator, not an inspector, and SRM approval can be remote.

The emails reinforce that SRM approval should be framed as SIMOPS/coordination approval. It should not imply that the SRM has physically inspected the worksite.

Open decisions:

- Daily mandatory endorsement vs selected-day continuation endorsement.
- Whether weekends/public holidays change the endorsement process.
- Whether SRM can endorse remotely without physical presence.
- Whether future-day endorsement is blocked.
- Whether backdating is blocked.
- How the system should prevent or flag "anyhow endorse" behavior.
- Exact wording for SRM responsibility, since it is coordination rather than physical inspection.

Work needed:

- Finalize the SRM workflow with Joseph/Alex.
- Update UI copy, PRD, database validation, and PDF wording.
- Require Assessor condition verification before permit activation if Franklin confirms this control.
- Add server-side date checks once rules are confirmed.

### 7. SRM Override / Separation of Duties

Migration `0005_srm_authority.sql` currently allows SRMs to override Stage I, Stage II, and Stage IV. The meeting sounded like the team still wants to preserve some control around SRMs not signing both sides or creating conflicts of responsibility.

Work needed:

- Confirm whether SRM override is final product behavior.
- Define which stages an SRM can override.
- Define whether SRM can raise a permit and later approve it.
- Keep or revise the existing Stage III separation-of-duties guard.
- Update the PRD/README to match the confirmed behavior.

### 8. Additional Permit Types

The PRD scopes MVP to Hot Work only, but the meeting referenced other possible forms, including hazardous works and possibly a set of 4-6 permit types.

Work needed:

- Get the final list of permit types.
- Get templates/forms for each type.
- Decide whether they share the same workflow or need type-specific stages.
- Generalize schema/UI/PDF generation beyond Hot Work.

### 9. Company / Site Context and Premises Restrictions

The current implementation appears to be a single-company/site workflow. The follow-up emails discuss users selecting a company context during login, with roles assigned per company/site, and SRMs restricted to specific premises.

Work needed:

- Add company and site/premises entities if Franklin needs multi-company or multi-premises access.
- Let users select an active company/site context where they have more than one assignment.
- Scope permits, dashboard queues, admin views, and approvals to the selected context.
- Restrict SRMs to assigned premises/sites.
- Update RLS and RPC guards so users cannot access or approve outside their assigned context.
- Decide how contractor guest accounts are linked to company/site context.

### 10. Assessor Condition-Verification Checklist

Current Stage II assessment exists, but the follow-up email calls for a stronger assessor checklist before activation.

Work needed:

- Add checklist items for controls such as isolation, barricade, gas test, fire watch, PPE, and required evidence capture.
- Define which checklist items are mandatory for Hot Work and which are permit-type specific.
- Support assessor comments and evidence attachments/photos per checklist item if required.
- Prevent Stage II completion until mandatory controls are confirmed.
- Include assessor verification details in the PDF/live permit view and audit trail.

## Implementation Gaps To Fix

### 1. Audit Log Can Be Forged

`write_audit` is exposed as a `security definer` RPC without an internal-only guard. An authenticated user may be able to call it directly and forge audit entries.

Location:

- `supabase/migrations/0002_functions.sql`

Work needed:

- Restrict direct client access to `write_audit`.
- Move audit writes into transition functions/triggers only.
- Ensure `created` audit entries are guaranteed, not best-effort.
- Add audit rows for auto-expiry and attachment/photo changes.

### 2. Auto-Expiry Is Not Fully Audited

`permit_auto_expire()` updates permit state to `expired`, but does not write audit rows for each expired permit.

Location:

- `supabase/migrations/0002_functions.sql`

Work needed:

- Record an `expired` audit event for each affected permit.
- Decide how/when the function is scheduled.
- Confirm expiry grace period with Franklin.

### 3. Photo Annotation Is Incomplete

The UI saves annotations with an `update` to `permit_photos`, but RLS has insert/delete policies and no update policy. The PDF generator also embeds original photo bytes, not rendered annotation overlays.

Locations:

- `components/permit/photo-uploader.tsx`
- `components/permit/photo-annotator.tsx`
- `supabase/migrations/0003_rls.sql`
- `lib/pdf/generate-permit-pdf.ts`

Work needed:

- Add a safe update policy for `permit_photos.annotation_data`.
- Ensure only authorized users can update annotations.
- Render annotations onto photos in the PDF appendix.
- Consider storing a flattened annotated image if needed.

### 4. Photo Delete/Edit Permissions Are Inconsistent

The UI allows photo editing in `draft` and `pending_safety_assessment`, but delete RLS only allows deleting photos while the permit is in `draft`.

Locations:

- `components/permit/permit-detail.tsx`
- `components/permit/photo-uploader.tsx`
- `supabase/migrations/0003_rls.sql`
- `supabase/migrations/0004_storage.sql`

Work needed:

- Align UI behavior with RLS.
- Decide whether photos can be deleted in `pending_safety_assessment`.
- Add matching storage-object delete rules if deletion is allowed.

### 5. Day Endorsement Validation Is Too Loose

The server accepts any Day 2-14 value if the permit is in an endorsable state. It does not enforce current day, date completion, no backdating, no future dating, or SRM qualification in the same way Stage III does.

Location:

- `supabase/migrations/0002_functions.sql`

Work needed:

- Check `hot_work_srm` qualification for endorsements.
- Validate selected day against commencement/completion dates.
- Enforce no future endorsement if required.
- Enforce no backdating if required.
- Return clear errors for invalid day selection.

### 6. Date Integrity / No-Backdating Rules Are Not Fully Enforced

The emails explicitly state that backdating should not be allowed because it can create fraudulent permit records. The current gaps already include loose endorsement validation, but the rule should apply consistently across permit dates and workflow actions.

Work needed:

- Define whether requested commencement/completion dates can be in the past.
- Prevent backdated submissions, approvals, endorsements, and close-outs unless Franklin explicitly defines an admin exception workflow.
- Store system timestamps separately from user-entered dates and make both visible in audit history where useful.
- Add clear validation errors when users attempt backdated or future-dated actions that are not allowed.
- Include date-integrity expectations in QA test cases.

### 7. Stage IV Can Close Too Early

Close-out is allowed from `approved_active`, `pending_daily_endorsement`, and `pending_closure`, even if the completion date has not been reached.

Locations:

- `supabase/migrations/0002_functions.sql`
- `supabase/migrations/0005_srm_authority.sql`

Work needed:

- Confirm whether early close-out is allowed.
- If not, only allow Stage IV after date of completion or `pending_closure`.
- Add server-side date validation.

### 8. Admin User Management Is Thin

CSV import exists, but the admin UI mainly supports active/inactive toggling.

Work needed:

- Add UI for editing roles.
- Add UI for editing qualifications.
- Add support for guest/contractor users.
- Add company/site assignment management if the multi-company/site model is adopted.
- Add email/notification group management if email notifications are implemented.

### 9. Permit Numbering Still Needs Confirmation

PRD marks exact numbering as an open question. Current implementation uses:

```text
FOI-HWP-YYYY-NNN
```

Work needed:

- Confirm final Franklin numbering format.
- Update `next_permit_serial()` if needed.
- Confirm whether numbering resets yearly, monthly, or follows paper-register conventions.

### 10. QR/Public Access Security Model Is Missing

The QR feature has not been implemented yet, but it will need a security decision before coding.

Work needed:

- Decide whether QR view is public, login-protected, or token-protected.
- Decide which fields are safe for public display.
- Avoid exposing internal names, signatures, documents, or client-sensitive information unless approved.
- Add safeguards against QR replacement/spoofing, such as clear Franklin branding, permit status, permit number, issue timestamp, and optional verification instructions.

### 11. Build Tooling Needs Cleanup

Verification results:

- `npm run typecheck` passes.
- `npm run build` passes.
- `npm run lint` fails because `next lint` is obsolete in this setup.
- Build warns that Next inferred the workspace root from `/Users/joshualim/package-lock.json`.
- Build warns that `middleware.ts` is deprecated in favor of `proxy.ts` in Next 16.

Work needed:

- Replace the lint script with an ESLint command.
- Add/update ESLint config if needed.
- Set `turbopack.root` in `next.config.ts` or remove the higher-level lockfile issue.
- Migrate `middleware.ts` to `proxy.ts` when appropriate.

## Suggested Work Order

1. Confirm product decisions: guest role, company/site model, SRM endorsement rules, assessor checklist rules, QR public fields, SRM override rules, escalation events, and additional permit types.
2. Fix audit/security issues, date integrity, and endorsement validation.
3. Add company/site context if Franklin confirms multi-company or multi-premises access.
4. Add guest contractor fields, contractor self-declaration, mandatory RA upload, and supporting document upload support.
5. Add assessor condition-verification checklist and update SRM wording to SIMOPS/coordination approval.
6. Finish annotation persistence and PDF rendering.
7. Build QR live permit page and include QR code in PDF.
8. Add email notifications, escalation handling, and recipient management.
9. Expand admin user management for roles, qualifications, guest users, company/site assignments, and notification groups.
10. Clean up Next 16 warnings and lint script.
