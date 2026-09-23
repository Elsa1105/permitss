import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// "/public" covers the no-login QR landing page (app/public/permits/[id]).
// "/api/public" must ALSO be exempt: it's the no-auth PDF endpoint that
// page links to (app/api/public/permits/[id]/pdf) — the whole point of
// scanning the permit's QR code is to see the endorsed PDF without
// logging in. Without this entry, requests to that route were being
// redirected to /login just like any other authenticated page.
const PUBLIC_PATHS = ["/login", "/auth/callback", "/public", "/api/public"];

const CHANGE_PASSWORD_PATH = "/settings/change-password";

type CookieToSet = {
  name: string;
  value: string;
  options?: CookieOptions;
};

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next();

  const path = request.nextUrl.pathname;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet: CookieToSet[]) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const isPublic = PUBLIC_PATHS.some(
    (p) => path === p || path.startsWith(p)
  );

  if (isPublic) return response;

  if (!session) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  // Force anyone on an admin-set password (manual creation, CSV bulk
  // import's shared default, or an admin reset/login-recreate) to choose
  // their own before they can use the rest of the app. Skip this check
  // for API routes so client-side fetches (including the change-password
  // submit itself) aren't redirected instead of getting a JSON response.
  if (path !== CHANGE_PASSWORD_PATH && !path.startsWith("/api/")) {
    const { data: profile } = await supabase
      .from("users")
      .select("must_change_password")
      .eq("id", session.user.id)
      .maybeSingle();

    if (profile?.must_change_password) {
      const url = request.nextUrl.clone();
      url.pathname = CHANGE_PASSWORD_PATH;
      return NextResponse.redirect(url);
    }
  }

  return response;
}