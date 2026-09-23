import { createClient } from "@/lib/supabase/server";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import type {
  SourcingRequest,
  SourcingRequestStatus,
} from "@/lib/types/database";

export async function listSourcingRequestsForBuyer(
  userId: string,
): Promise<SourcingRequest[]> {
  if (!userId || !getSupabasePublicEnv()) return [];

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("sourcing_requests")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) return [];
    return (data as SourcingRequest[] | null) ?? [];
  } catch {
    return [];
  }
}

export async function listSourcingRequestsForAdmin(options?: {
  status?: SourcingRequestStatus;
  limit?: number;
}): Promise<SourcingRequest[]> {
  if (!getSupabasePublicEnv()) return [];

  try {
    const supabase = await createClient();
    let query = supabase
      .from("sourcing_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(options?.limit ?? 100);

    if (options?.status) {
      query = query.eq("status", options.status);
    }

    const { data, error } = await query;
    if (error) return [];
    return (data as SourcingRequest[] | null) ?? [];
  } catch {
    return [];
  }
}

export async function countPendingSourcingRequests(): Promise<number> {
  if (!getSupabasePublicEnv()) return 0;

  try {
    const supabase = await createClient();
    const { count, error } = await supabase
      .from("sourcing_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");

    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}
