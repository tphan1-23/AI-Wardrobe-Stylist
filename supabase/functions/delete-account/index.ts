// POST { confirm: true } -> deletes the signed-in user's photos, account and data (D10).
// Uses the service role key (set automatically by Supabase for every edge function) because only an admin can
// delete a sign-in account; the user being deleted is always the verified caller, never one named in the body.
import { createClient } from "npm:@supabase/supabase-js@2";
import { serveAuthed } from "../_deno/serve.ts";
import { handleDeleteAccount, type DeleteAccountDeps, type DeleteAccountRequest } from "../_shared/delete-account.ts";
import { toReply } from "../_shared/http.ts";
import { PHOTO_BUCKET } from "../_shared/supabase-deps.ts";

const PAGE = 1000;

function adminDeps(): DeleteAccountDeps {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set");
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const photos = admin.storage.from(PHOTO_BUCKET);

  return {
    async getHouseholdId(userId) {
      const { data, error } = await admin.from("users").select("household_id").eq("id", userId).maybeSingle();
      if (error) throw new Error(error.message);
      return (data?.household_id as string | null | undefined) ?? null;
    },
    async listPhotoPaths(userId) {
      const paths: string[] = [];
      const { data: garments, error } = await admin.from("garments").select("image_path").eq("owner_id", userId);
      if (error) throw new Error(error.message);
      for (const g of garments ?? []) paths.push(g.image_path as string);
      // Photos live in "<user id>/..." (migration 0002); this also finds uploads that were never saved as a garment.
      for (let offset = 0; ; offset += PAGE) {
        const { data: files, error: listError } = await photos.list(userId, { limit: PAGE, offset });
        if (listError) throw new Error(listError.message);
        for (const f of files ?? []) paths.push(`${userId}/${f.name}`);
        if (!files || files.length < PAGE) break;
      }
      return paths;
    },
    async removePhotos(paths) {
      for (let i = 0; i < paths.length; i += PAGE) {
        const { error } = await photos.remove(paths.slice(i, i + PAGE));
        if (error) throw new Error(error.message);
      }
    },
    async deleteAuthUser(userId) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw new Error(error.message);
    },
    async deleteHouseholdIfEmpty(householdId) {
      const { count, error } = await admin.from("users").select("id", { count: "exact", head: true }).eq("household_id", householdId);
      if (error) throw new Error(error.message);
      if (count === 0) {
        const { error: deleteError } = await admin.from("households").delete().eq("id", householdId);
        if (deleteError) throw new Error(deleteError.message);
      }
    },
  };
}

serveAuthed(async (userId, body) =>
  toReply(await handleDeleteAccount(userId, body as DeleteAccountRequest, adminDeps())),
);
