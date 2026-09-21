"use server";

import { revalidatePath } from "next/cache";
import { getSessionProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  getSupabaseConfigError,
  getSupabasePublicEnv,
} from "@/lib/supabase/env";
import { normalizeCountryCode } from "@/lib/sourcing/constants";

export type AddressActionState = {
  error?: string;
  success?: string;
} | null;

function readAddressFields(formData: FormData) {
  const fullName = String(formData.get("full_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const line1 = String(formData.get("line1") ?? "").trim();
  const line2 = String(formData.get("line2") ?? "").trim() || null;
  const city = String(formData.get("city") ?? "").trim();
  const region = String(formData.get("region") ?? "").trim() || null;
  const postalCode = String(formData.get("postal_code") ?? "").trim() || null;
  const countryCode = normalizeCountryCode(
    String(formData.get("country_code") ?? formData.get("country") ?? "MM"),
  );
  const label = String(formData.get("label") ?? "").trim() || null;
  const isDefault =
    String(formData.get("is_default") ?? "").toLowerCase() === "on" ||
    String(formData.get("is_default") ?? "") === "1" ||
    String(formData.get("is_default") ?? "").toLowerCase() === "true";

  return {
    fullName,
    phone,
    line1,
    line2,
    city,
    region,
    postalCode,
    countryCode,
    label,
    isDefault,
  };
}

function validateRequired(fields: ReturnType<typeof readAddressFields>) {
  if (!fields.fullName) return "Full name is required.";
  if (!fields.line1) return "Address line 1 is required.";
  if (!fields.city) return "City is required.";
  if (!fields.countryCode) return "Country is required.";
  return null;
}

export async function saveBuyerAddress(
  _prev: AddressActionState,
  formData: FormData,
): Promise<AddressActionState> {
  if (!getSupabasePublicEnv()) {
    return { error: getSupabaseConfigError() };
  }

  const session = await getSessionProfile();
  if (!session) {
    return { error: "Sign in to manage delivery addresses." };
  }

  const fields = readAddressFields(formData);
  const validationError = validateRequired(fields);
  if (validationError) return { error: validationError };

  const addressId = String(formData.get("address_id") ?? "").trim() || null;
  let savedAsDefault = fields.isDefault;

  try {
    const supabase = await createClient();

    // If this is the first address, force it as default.
    const { count } = await supabase
      .from("buyer_addresses")
      .select("id", { count: "exact", head: true })
      .eq("user_id", session.userId);

    const makeDefault = fields.isDefault || (count ?? 0) === 0;
    savedAsDefault = makeDefault;

    const payload = {
      user_id: session.userId,
      label: fields.label,
      full_name: fields.fullName,
      phone: fields.phone,
      line1: fields.line1,
      line2: fields.line2,
      city: fields.city,
      region: fields.region,
      postal_code: fields.postalCode,
      country_code: fields.countryCode,
      is_default: makeDefault,
      updated_at: new Date().toISOString(),
    };

    if (addressId) {
      const { error } = await supabase
        .from("buyer_addresses")
        .update(payload)
        .eq("id", addressId)
        .eq("user_id", session.userId);
      if (error) return { error: error.message };
    } else {
      const { error } = await supabase.from("buyer_addresses").insert(payload);
      if (error) return { error: error.message };
    }
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Could not save delivery address.",
    };
  }

  revalidatePath("/profile");
  revalidatePath("/checkout");
  revalidatePath("/products");
  return { success: makeDefaultMessage(savedAsDefault) };
}

function makeDefaultMessage(requestedDefault: boolean) {
  return requestedDefault
    ? "Address saved and set as your default delivery address."
    : "Address saved.";
}

export async function setDefaultBuyerAddress(
  _prev: AddressActionState,
  formData: FormData,
): Promise<AddressActionState> {
  if (!getSupabasePublicEnv()) {
    return { error: getSupabaseConfigError() };
  }

  const session = await getSessionProfile();
  if (!session) {
    return { error: "Sign in to manage delivery addresses." };
  }

  const addressId = String(formData.get("address_id") ?? "").trim();
  if (!addressId) {
    return { error: "Missing address." };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("buyer_addresses")
      .update({
        is_default: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", addressId)
      .eq("user_id", session.userId);

    if (error) return { error: error.message };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Could not set default address.",
    };
  }

  revalidatePath("/profile");
  revalidatePath("/checkout");
  revalidatePath("/products");
  return { success: "Default delivery address updated." };
}

export async function deleteBuyerAddress(
  _prev: AddressActionState,
  formData: FormData,
): Promise<AddressActionState> {
  if (!getSupabasePublicEnv()) {
    return { error: getSupabaseConfigError() };
  }

  const session = await getSessionProfile();
  if (!session) {
    return { error: "Sign in to manage delivery addresses." };
  }

  const addressId = String(formData.get("address_id") ?? "").trim();
  if (!addressId) {
    return { error: "Missing address." };
  }

  try {
    const supabase = await createClient();

    const { data: existing } = await supabase
      .from("buyer_addresses")
      .select("id, is_default")
      .eq("id", addressId)
      .eq("user_id", session.userId)
      .maybeSingle();

    if (!existing) {
      return { error: "Address not found." };
    }

    const { error } = await supabase
      .from("buyer_addresses")
      .delete()
      .eq("id", addressId)
      .eq("user_id", session.userId);

    if (error) return { error: error.message };

    // If we deleted the default, promote the most recently updated remaining address.
    if (existing.is_default) {
      const { data: next } = await supabase
        .from("buyer_addresses")
        .select("id")
        .eq("user_id", session.userId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (next?.id) {
        await supabase
          .from("buyer_addresses")
          .update({
            is_default: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", next.id)
          .eq("user_id", session.userId);
      }
    }
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Could not delete delivery address.",
    };
  }

  revalidatePath("/profile");
  revalidatePath("/checkout");
  return { success: "Address removed." };
}

/**
 * Upsert from checkout when the buyer checks "Set as default delivery address".
 */
export async function upsertDefaultAddressFromCheckout(args: {
  userId: string;
  fullName: string;
  phone: string | null;
  line1: string;
  line2: string | null;
  city: string;
  region: string | null;
  postalCode: string | null;
  countryCode: string;
}): Promise<void> {
  if (!getSupabasePublicEnv()) return;
  if (!args.fullName || !args.line1 || !args.city) return;

  const supabase = await createClient();
  const countryCode = normalizeCountryCode(args.countryCode);

  // Prefer updating the existing default; otherwise insert a new default.
  const { data: currentDefault } = await supabase
    .from("buyer_addresses")
    .select("id")
    .eq("user_id", args.userId)
    .eq("is_default", true)
    .maybeSingle();

  const payload = {
    user_id: args.userId,
    full_name: args.fullName,
    phone: args.phone,
    line1: args.line1,
    line2: args.line2,
    city: args.city,
    region: args.region,
    postal_code: args.postalCode,
    country_code: countryCode,
    is_default: true,
    label: "Default",
    updated_at: new Date().toISOString(),
  };

  if (currentDefault?.id) {
    await supabase
      .from("buyer_addresses")
      .update(payload)
      .eq("id", currentDefault.id)
      .eq("user_id", args.userId);
  } else {
    await supabase.from("buyer_addresses").insert(payload);
  }

  revalidatePath("/profile");
  revalidatePath("/checkout");
}
