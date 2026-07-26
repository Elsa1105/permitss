import { NextResponse } from "next/server";
import {
  createServerSupabase,
  createServiceRoleSupabase,
} from "@/lib/supabase/server";
import type { UserRole } from "@/lib/supabase/types";

// Give this route up to 60s on Vercel (default is much shorter) since a
// large CSV with per-row delays/retries can legitimately take a while.
// 60s is the max allowed even on the Hobby plan.
export const maxDuration = 60;

const TEMPLATE = `email,full_name,department,role,qualified_for,active,company_code,site_code,site_role
foreman@franklin.example,Foreman Applicant,Operations,applicant,hot_work_applicant,true,FOI,MAIN,applicant
contractor.vendor@example.com,Contractor Vendor,Contractor,contractor,hot_work_applicant,true,FOI,MAIN,contractor
guest.vendor@example.com,Guest Applicant,Contractor,guest_applicant,hot_work_applicant,true,CFE,MAIN,guest_applicant
safety.assessor@franklin.example,Safety Assessor,HSE,assessor,hot_work_assessor,true,FOI,MAIN,assessor
srm@franklin.example,Ship Repair Manager,SRM,srm,hot_work_srm,true,FOI,MAIN,srm
admin@franklin.example,System Admin,IT,admin,hot_work_applicant|hot_work_assessor|hot_work_srm,true,FOI,MAIN,admin
`;

interface ParsedRow {
  rowNumber: number;
  email: string;
  full_name: string;
  department?: string;
  role: UserRole;
  qualified_for: string[];
  active: boolean;
  company_code?: string;
  site_code?: string;
  site_role?: UserRole;
}

interface ImportError {
  row: number;
  email?: string;
  error: string;
}

const VALID_ROLES: ReadonlySet<UserRole> = new Set([
  "applicant",
  "guest_applicant",
  "contractor",
  "assessor",
  "srm",
  "admin",
]);

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

export async function POST(request: Request) {
  const authClient = await createServerSupabase();

  const { data: auth } = await authClient.auth.getUser();

  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
  let siteRolesAssigned = 0;

  for (const [rowIndex, row] of rows.entries()) {
    // Space out invite emails so we don't slam the email provider's
    // rate limiter. A small delay before every row is cheap and keeps
    // things predictable even for existing-user rows.
    if (rowIndex > 0) {
      await sleep(INVITE_DELAY_MS);
    }

    if (!VALID_ROLES.has(row.role)) {
      errors.push({
        row: row.rowNumber,
        email: row.email,
        error: `Invalid role: ${row.role}`,
      });
      skipped++;
      continue;
    }

    if (row.site_role && !VALID_ROLES.has(row.site_role)) {
      errors.push({
        row: row.rowNumber,
        email: row.email,
        error: `Invalid site_role: ${row.site_role}`,
      });
      skipped++;
      continue;
    }

    try {
      const { data: existing } = await admin
        .from("users")
        .select("id")
        .eq("email", row.email)
        .maybeSingle();

      let userId = existing?.id ?? null;

      if (userId) {
        const upd = await admin
          .from("users")
          .update({
            full_name: row.full_name,
            department: row.department ?? null,
            role: row.role,
            qualified_for: row.qualified_for,
            active: row.active,
          })
          .eq("id", userId);

        if (upd.error) {
          throw upd.error;
        }

        updated++;
      } else {
        const invite = await inviteWithRetry(admin, row);

        if (invite.error) {
          throw invite.error;
        }

        if (invite.data.user) {
          userId = invite.data.user.id;

          const upsert = await admin.from("users").upsert({
            id: invite.data.user.id,
            email: row.email,
            full_name: row.full_name,
            department: row.department ?? null,
            role: row.role,
            qualified_for: row.qualified_for,
            active: row.active,
          });

          if (upsert.error) {
            throw upsert.error;
          }
        }

        invited++;
      }

      if (
        userId &&
        row.company_code &&
        row.site_code &&
        row.site_role
      ) {
        await assignSiteRole({
          admin,
          row,
          userId,
        });

        siteRolesAssigned++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);

      errors.push({
        row: row.rowNumber,
        email: row.email,
        error: msg,
      });

      skipped++;
    }
  }

  return NextResponse.json({
    invited,
    updated,
    skipped,
    siteRolesAssigned,
    errors,
  });
}

// Base delay between rows (ms). Keeps us well under typical SMTP
// provider rate limits (e.g. Resend free tier ~2 req/sec).
const INVITE_DELAY_MS = 400;

// Max attempts for a single invite before giving up and reporting it
// as an error row (which the admin can retry by re-uploading the CSV -
// existing users are skipped/updated, so re-running is safe).
// Kept low (with a short fixed backoff, not exponential) so a CSV full
// of failures can never push the whole request past the Vercel
// function timeout (maxDuration = 60 above).
const MAX_INVITE_ATTEMPTS = 2;
const RETRY_BACKOFF_MS = 1000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(error: unknown): boolean {
  const msg =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  return /rate limit/i.test(msg) || /too many requests/i.test(msg);
}

async function inviteWithRetry(
  admin: ReturnType<typeof createServiceRoleSupabase>,
  row: ParsedRow,
) {
  let attempt = 0;

  for (;;) {
    attempt++;

    const invite = await admin.auth.admin.inviteUserByEmail(row.email, {
      data: {
        full_name: row.full_name,
        department: row.department ?? null,
        role: row.role,
        qualified_for: row.qualified_for.join(","),
      },
    });

    const hitRateLimit = invite.error && isRateLimitError(invite.error);

    if (!hitRateLimit || attempt >= MAX_INVITE_ATTEMPTS) {
      return invite;
    }

    await sleep(RETRY_BACKOFF_MS);
  }
}

function parseCsv(text: string): {
  rows: ParsedRow[];
  errors: ImportError[];
} {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return { rows: [], errors: [] };
  }

  const header = splitRow(lines[0]).map((h) => h.toLowerCase().trim());

  const requiredColumns = [
    "email",
    "full_name",
    "department",
    "role",
    "qualified_for",
  ];

  const idx = (key: string) => header.indexOf(key);

  for (const column of requiredColumns) {
    if (idx(column) === -1) {
      return {
        rows: [],
        errors: [
          {
            row: 1,
            error: `Missing required column: ${column}`,
          },
        ],
      };
    }
  }

  const rows: ParsedRow[] = [];
  const errors: ImportError[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = splitRow(lines[i]);

    const email = (cells[idx("email")] || "").trim().toLowerCase();
    const fullName = (cells[idx("full_name")] || "").trim();
    const role = ((cells[idx("role")] || "applicant").trim() as UserRole);

    if (!email || !fullName) {
      errors.push({
        row: i + 1,
        email,
        error: "email and full_name are required",
      });

      continue;
    }

    const activeIdx = idx("active");
    const companyIdx = idx("company_code");
    const siteIdx = idx("site_code");
    const siteRoleIdx = idx("site_role");

    rows.push({
      rowNumber: i + 1,
      email,
      full_name: fullName,
      department: cells[idx("department")]?.trim() || undefined,
      role,
      qualified_for: (cells[idx("qualified_for")] || "")
        .split("|")
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
      active:
        activeIdx === -1
          ? true
          : !["false", "0", "no", "inactive"].includes(
              (cells[activeIdx] || "").trim().toLowerCase(),
            ),
      company_code:
        companyIdx === -1
          ? undefined
          : cells[companyIdx]?.trim().toUpperCase() || undefined,
      site_code:
        siteIdx === -1
          ? undefined
          : cells[siteIdx]?.trim().toUpperCase() || undefined,
      site_role:
        siteRoleIdx === -1
          ? undefined
          : ((cells[siteRoleIdx] || "").trim() as UserRole) || undefined,
    });
  }

  return { rows, errors };
}

async function assignSiteRole({
  admin,
  row,
  userId,
}: {
  admin: ReturnType<typeof createServiceRoleSupabase>;
  row: ParsedRow;
  userId: string;
}) {
  const { data: company, error: companyError } = await admin
    .from("companies")
    .select("id")
    .eq("code", row.company_code)
    .eq("active", true)
    .single();

  if (companyError || !company) {
    throw new Error(`Company not found: ${row.company_code}`);
  }

  const { data: site, error: siteError } = await admin
    .from("sites")
    .select("id")
    .eq("company_id", company.id)
    .eq("code", row.site_code)
    .eq("active", true)
    .single();

  if (siteError || !site) {
    throw new Error(
      `Site not found: ${row.company_code}/${row.site_code}`,
    );
  }

  const { error } = await admin.from("user_site_roles").upsert(
    {
      user_id: userId,
      company_id: company.id,
      site_id: site.id,
      role: row.site_role,
      active: true,
    },
    {
      onConflict: "user_id,company_id,site_id,role",
    },
  );

  if (error) {
    throw error;
  }
}

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