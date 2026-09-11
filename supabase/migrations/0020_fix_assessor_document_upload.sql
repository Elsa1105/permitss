-- Migration 0020: Restore assessor's ability to upload permit documents
--
-- Problem:
-- Policy sebelumnya menghapus akses assessor untuk upload document.
--
-- Fix:
-- Tambahkan kembali assessor sebagai allowed uploader
-- saat permit masih editable.

-- =====================================================
-- 1. Drop old insert policy
-- =====================================================

drop policy if exists "permit_documents insert editable permits"
on public.permit_documents;

-- =====================================================
-- 2. Recreate insert policy (FIXED)
-- =====================================================

create policy "permit_documents insert editable permits"
on public.permit_documents
for insert
to authenticated
with check (
  uploaded_by = auth.uid()
  and exists (
    select 1
    from public.permits p
    where p.id = permit_documents.permit_id
      and (
        public.is_admin()
        or p.applicant_id = auth.uid()
        or p.assessor_id = auth.uid()   -- ✅ FIX: assessor allowed again
        or p.srm_id = auth.uid()
      )
      and p.state in (
        'draft',
        'pending_safety_assessment'
      )
  )
);