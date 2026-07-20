-- Migration 0020: Restore assessor's ability to upload permit documents
--
-- Problem: migration 0012 ("permit_documents insert editable permits")
-- rewrote the INSERT policy on public.permit_documents and only allowed
-- admin, the applicant, or the SRM to insert a row. The assessor_id
-- check that existed in the original migration 0006 policy was dropped,
-- so an assessor could never attach a document (e.g. their own RA
-- annotation, additional evidence) to a permit during assessment,
-- even while the permit is in 'pending_safety_assessment' state.
--
-- Fix: add the assessor back to the allowed uploaders, matching who is
-- allowed to *view* documents via can_view_permit_site().

drop policy if exists "permit_documents insert editable permits" on public.permit_documents;

create policy "permit_documents insert editable permits"
on public.permit_documents
for insert
to authenticated
with check (
  uploaded_by = auth.uid()
  and exists (
    select 1
    from public.permits p
    where p.id = permit_id
      and (
        public.is_admin()
        or p.applicant_id = auth.uid()
        or p.assessor_id = auth.uid()
        or p.srm_id = auth.uid()
      )
      and p.state in ('draft', 'pending_safety_assessment')
  )
);
