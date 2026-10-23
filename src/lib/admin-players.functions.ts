import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPlayerDeletionAllowed, assertAdminGrantAllowed } from "@/lib/admin-player-policy";

export const administratorIds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (error) throw new Error("No se pudieron comprobar tus permisos.");
    assertAdminGrantAllowed(isAdmin === true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles, error: readError } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin");
    if (readError) throw new Error("No se pudieron consultar los administradores.");
    return (roles ?? []).map((role) => role.user_id);
  });

export const grantAdministrator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ playerId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (error) throw new Error("No se pudieron comprobar tus permisos.");
    assertAdminGrantAllowed(isAdmin === true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: player, error: playerError } = await supabaseAdmin.from("profiles").select("id").eq("id", data.playerId).maybeSingle();
    if (playerError || !player) throw new Error("No se encontró el jugador.");
    const { error: grantError } = await supabaseAdmin.from("user_roles").upsert({ user_id: data.playerId, role: "admin" }, { onConflict: "user_id,role", ignoreDuplicates: true });
    if (grantError) throw new Error("No se pudieron otorgar los permisos.");
    return { granted: true };
  });

export const deletePlayer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ playerId: z.string().uuid(), confirmation: z.literal("ELIMINAR") }))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId, _role: "admin",
    });
    if (roleError) throw new Error("No se pudieron comprobar tus permisos.");
    assertPlayerDeletionAllowed(context.userId, data.playerId, isAdmin === true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Auth refuses to delete users who still own storage objects.
    // Portrait uploads always live directly under the user's UUID folder.
    while (true) {
      const { data: files, error: listError } = await supabaseAdmin.storage.from("portraits").list(data.playerId, { limit: 100 });
      if (listError) throw new Error("No se pudieron revisar los retratos del jugador.");
      if (!files?.length) break;
      const { error: removeError } = await supabaseAdmin.storage.from("portraits").remove(files.map((file) => `${data.playerId}/${file.name}`));
      if (removeError) throw new Error("No se pudieron eliminar los retratos del jugador.");
    }
    // Deleting Auth cascades to profiles; its trigger atomically removes progress,
    // frees territories and cancels shared unfinished games, retaining rivals' history.
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.playerId);
    if (error) throw new Error("No se pudo eliminar la cuenta del jugador. Inténtalo de nuevo.");
    return { deleted: true };
  });