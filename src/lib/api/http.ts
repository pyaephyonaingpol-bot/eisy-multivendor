import { NextResponse } from "next/server";

export function jsonOk<T extends Record<string, unknown>>(
  body: T,
  init?: { status?: number },
) {
  return NextResponse.json({ ok: true, ...body }, { status: init?.status ?? 200 });
}

export function jsonError(
  error: string,
  status = 400,
  extra?: Record<string, unknown>,
) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

export function statusFromMessage(message: string): number {
  const lower = message.toLowerCase();
  if (
    lower.includes("unauthorized") ||
    lower.includes("sign in") ||
    lower.includes("not authenticated") ||
    lower.includes("must be signed")
  ) {
    return 401;
  }
  if (
    lower.includes("forbidden") ||
    lower.includes("admin access") ||
    lower.includes("approved vendor required") ||
    lower.includes("complete kyc") ||
    lower.includes("not allowed")
  ) {
    return 403;
  }
  if (lower.includes("not found")) {
    return 404;
  }
  return 400;
}
