// Single source of truth for Supabase env vars.
// Values are validated lazily so the app still imports during build.

function required(name: string, value: string | undefined): string {
  if (!value || value.length === 0) {
    throw new Error(
      `Missing env var ${name}. Copy .env.local.example to .env.local and fill in your Supabase keys.`,
    );
  }
  return value;
}

export const SUPABASE_URL = () =>
  required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);

export const SUPABASE_ANON_KEY = () =>
  required(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

export const SUPABASE_SERVICE_ROLE_KEY = () =>
  required("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY);

export const STORAGE_BUCKET = () =>
  process.env.SUPABASE_STORAGE_BUCKET || "permit-photos";
