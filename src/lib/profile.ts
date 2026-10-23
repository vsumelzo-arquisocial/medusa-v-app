import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const profileQuery = queryOptions({
  queryKey: ["profile"],
  queryFn: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw new Error("no session");
    const [{ data: profile, error }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", u.user.id),
    ]);
    if (error) throw error;
    let portraitUrl: string | null = null;
    if (profile?.portrait_path) {
      const { data } = await supabase.storage.from("portraits").createSignedUrl(profile.portrait_path, 3600);
      portraitUrl = data?.signedUrl ?? null;
    }
    return {
      user: u.user,
      profile,
      portraitUrl,
      isAdmin: !!roles?.some((r) => r.role === "admin"),
    };
  },
});
