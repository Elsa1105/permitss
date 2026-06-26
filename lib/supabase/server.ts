import "server-only";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import {
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL,
} from "./env";

interface CookieToSet {
  name: string;
  value: string;
  options?: CookieOptions;
}

/**
 * Auth-aware server client for Server Components, Server Actions, and Route
 * Handlers. Reads/writes the session cookie automatically.
 */
export async function createServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL(), SUPABASE_ANON_KEY(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }: CookieToSet) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // setAll is a no-op when called from a Server Component during
          // render --- safe to ignore; middleware refreshes the session.
        }
      },
    },
  });
}

/**
 * Privileged service-role client. ONLY use server-side, and only for
 * operations that need to bypass RLS (admin user provisioning, audit
 * exports, scheduled auto-expire).
 */
export function createServiceRoleSupabase() {
  return createClient(SUPABASE_URL(), SUPABASE_SERVICE_ROLE_KEY(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
