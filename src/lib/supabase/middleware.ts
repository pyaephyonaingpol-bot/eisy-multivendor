import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { UserRole } from "@/lib/types/database";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie.name, cookie.value);
  });
  return to;
}

function loginRedirect(request: NextRequest, sessionResponse: NextResponse, nextPath: string) {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", nextPath);
  return copyCookies(sessionResponse, NextResponse.redirect(url));
}

function homeRedirect(request: NextRequest, sessionResponse: NextResponse) {
  const url = request.nextUrl.clone();
  url.pathname = "/";
  url.search = "";
  return copyCookies(sessionResponse, NextResponse.redirect(url));
}

export async function updateSession(request: NextRequest) {
  const env = getSupabasePublicEnv();

  if (!env) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  try {
    const supabase = createServerClient(env.url, env.anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    });

    // Refresh the auth session cookie before any protected-route checks.
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { pathname } = request.nextUrl;
    const isVendorApply = pathname === "/vendor/apply";
    const isVendorRoute = pathname.startsWith("/vendor");
    const isAdminRoute = pathname.startsWith("/admin");
    const isAuthPage = pathname === "/login" || pathname === "/register";

    if (!isVendorRoute && !isAdminRoute && !isAuthPage) {
      return supabaseResponse;
    }

    if (isAuthPage) {
      if (user) {
        return homeRedirect(request, supabaseResponse);
      }
      return supabaseResponse;
    }

    if (!user) {
      return loginRedirect(request, supabaseResponse, pathname);
    }

    // Any signed-in user can submit a vendor application.
    if (isVendorApply) {
      return supabaseResponse;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle<{ role: UserRole }>();

    const role = profile?.role ?? null;

    if (isAdminRoute && role !== "admin") {
      // Visible destination (not silent `/`) so nav clicks always change the URL.
      const url = request.nextUrl.clone();
      url.pathname = "/unauthorized";
      url.search = "from=admin";
      return copyCookies(sessionResponse, NextResponse.redirect(url));
    }

    if (isVendorRoute && role !== "vendor" && role !== "admin") {
      return homeRedirect(request, supabaseResponse);
    }

    return supabaseResponse;
  } catch {
    // Misconfigured/unreachable Auth must not 500 login, register, or other matched routes.
    return NextResponse.next({ request });
  }
}
