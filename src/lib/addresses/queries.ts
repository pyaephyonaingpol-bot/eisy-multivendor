import { createClient } from "@/lib/supabase/server";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import type { BuyerAddress } from "@/lib/types/database";

export async function listBuyerAddresses(
  userId: string,
): Promise<BuyerAddress[]> {
  if (!getSupabasePublicEnv() || !userId) return [];

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("buyer_addresses")
      .select("*")
      .eq("user_id", userId)
      .order("is_default", { ascending: false })
      .order("updated_at", { ascending: false });

    if (error) {
      // Table may not exist yet on older DBs.
      if (/buyer_addresses|relation|does not exist/i.test(error.message)) {
        return [];
      }
      console.warn("listBuyerAddresses:", error.message);
      return [];
    }

    return (data as BuyerAddress[] | null) ?? [];
  } catch {
    return [];
  }
}

export async function getDefaultBuyerAddress(
  userId: string,
): Promise<BuyerAddress | null> {
  const addresses = await listBuyerAddresses(userId);
  return addresses.find((address) => address.is_default) ?? addresses[0] ?? null;
}
