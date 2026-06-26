import { NextResponse } from "next/server";
import { createServerSupabase, createServiceRoleSupabase } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/supabase/types";

const TEMPLATE = `email,full_name,department,role,qualified_for
alex.applicant@franklin.example,Alex Applicant,Production,applicant,hot_work_applicant
alice.assessor@franklin.example,Alice Assessor,HSE,assessor,hot_work_assessor
sam.srm@franklin.example,Sam SRM,Operations,srm,hot_work_srm
admin@franklin.example,System Admin,IT,admin,hot_work_applicant|hot_work_assessor|hot_work_srm
`;

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("template")) {
    return new NextResponse(TEMPLATE, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": 'attachment; filename="qualified-personnel-template.csv"',
      },
    });
  }
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

interface ParsedRow {
  rowNumber: number;
  email: string;
  full_name: string;
  department?: string;
  role: UserRole;
  qualified_for: string[];
}

interface ImportError {
  row: number;
  email?: string;
  error: string;
}

const VALID_ROLES: ReadonlySet<UserRole> = new Set(["applicant", "assessor", "srm", "admin"]);

export async function POST(request: Request) {
  // Authz: only admin
  const authClient = await createServerSupabase();
  const { data: auth } = await authClient.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: actor } = await authClient
    .from("users")
    .select("role, active")
    .eq("id", auth.user.id)
    .single();
  if (!actor || actor.role !== "admin" || !actor.active) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  const csvText = await file.text();
  const { rows, errors: parseErrors } = parseCsv(csvText);

  const admin = createServiceRoleSupabase();
  const errors: ImportError[] = [...parseErrors];
  let invited = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    if (!VALID_ROLES.has(row.role)) {
      errors.push({
        row: row.rowNumber,
        email: row.email,
        error: `Invalid role: ${row.role}`,
      });
      skipped++;
      continue;
    }
    try {
      // Find existing auth user by email; otherwise invite
      const { data: existing } = await admin
        .from("users")
        .select("id")
        .eq("email", row.email)
        .maybeSingle();

      if (existing?.id) {
        const upd = await admin
          .from("users")
          .update({
            full_name: row.full_name,
            department: row.department ?? null,
            role: row.role,
            qualified_for: row.qualified_for,
            active: true,
          })
          .eq("id", existing.id);
        if (upd.error) throw upd.error;
        updated++;
      } else {
        const invite = await admin.auth.admin.inviteUserByEmail(row.email, {
          data: {
            full_name: row.full_name,
            role: row.role,
            qualified_for: row.qualified_for.join(","),
          },
        });
        if (invite.error) throw invite.error;
        // The on_auth_user_created trigger creates public.users.
        // Backfill department which the trigger doesn't capture.
        if (invite.data.user) {
          await admin
            .from("users")
            .upsert({
              id: invite.data.user.id,
              email: row.email,
              full_name: row.full_name,
              department: row.department ?? null,
              role: row.role,
              qualified_for: row.qualified_for,
              active: true,
            });
        }
        invited++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({ row: row.rowNumber, email: row.email, error: msg });
      skipped++;
    }
  }

  return NextResponse.json({ invited, updated, skipped, errors });
}

function parseCsv(text: string): { rows: ParsedRow[]; errors: ImportError[] } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return { rows: [], errors: [] };
  const header = splitRow(lines[0]).map((h) => h.toLowerCase().trim());
  const expected = ["email", "full_name", "department", "role", "qualified_for"];
  const idx = (k: string) => header.indexOf(k);
  for (const e of expected) {
    if (idx(e) === -1) {
      return {
        rows: [],
        errors: [{ row: 1, error: `Missing required column: ${e}` }],
      };
    }
  }

  const rows: ParsedRow[] = [];
  const errors: ImportError[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitRow(lines[i]);
    const email = (cells[idx("email")] || "").trim().toLowerCase();
    const full_name = (cells[idx("full_name")] || "").trim();
    if (!email || !full_name) {
      errors.push({ row: i + 1, email, error: "email and full_name are required" });
      continue;
    }
    rows.push({
      rowNumber: i + 1,
      email,
      full_name,
      department: cells[idx("department")]?.trim() || undefined,
      role: ((cells[idx("role")] || "applicant").trim() as UserRole),
      qualified_for: (cells[idx("qualified_for")] || "")
        .split("|")
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    });
  }
  return { rows, errors };
}

// Tiny CSV row splitter (handles quoted fields)
function splitRow(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQ = false;
      } else {
        cur += ch;
      }
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else if (ch === '"') {
      inQ = true;
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}
