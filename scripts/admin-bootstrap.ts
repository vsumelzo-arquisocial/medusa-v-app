import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isSecurePassword, PASSWORD_REQUIREMENTS } from "../src/lib/password-policy";

/** Operator-only setup: never import this module from application code. */
export async function bootstrapAdministrator(client: SupabaseClient, email: string, password: string) {
  if (!email.trim() || !email.includes("@")) throw new Error("Indica un correo válido.");
  if (!isSecurePassword(password)) throw new Error(PASSWORD_REQUIREMENTS);

  const { data, error } = await client.auth.admin.createUser({
    email: email.trim(), password, email_confirm: true,
  });
  // Never reset or promote an existing account based only on its email.
  if (error || !data.user) throw new Error("No se pudo crear una cuenta nueva. Si ya existe, conserva la exportación completa o utiliza otro correo; no se ha cambiado su contraseña ni su rol.");
  const id = data.user.id;
  const profile = await client.from("profiles").update({ approved: true, leader_name: "Administrador" }).eq("id", id).select("id").single();
  if (profile.error || !profile.data) throw new Error("Cuenta creada, pero falta preparar su perfil. Revisa las migraciones del destino antes de continuar.");
  const role = await client.from("user_roles").upsert({ user_id: id, role: "admin" }, { onConflict: "user_id,role" });
  if (role.error) throw new Error("Cuenta creada, pero no se pudo otorgar administración. Revisa los permisos del destino.");
  const verified = await client.from("user_roles").select("user_id").eq("user_id", id).eq("role", "admin").single();
  if (verified.error || !verified.data) throw new Error("No se pudo comprobar el rol administrador.");
  return id;
}

if (import.meta.main) {
  const url = process.env['ADMIN_SETUP_URL'];
  const key = process.env['ADMIN_SETUP_SERVICE_KEY'];
  const email = process.env['ADMIN_SETUP_EMAIL'];
  const password = process.env['ADMIN_SETUP_PASSWORD'];
  if (!url || !key || !email || !password) {
    console.error("Faltan ADMIN_SETUP_URL, ADMIN_SETUP_SERVICE_KEY, ADMIN_SETUP_EMAIL o ADMIN_SETUP_PASSWORD. Configúralas de forma privada en el destino.");
    process.exitCode = 1;
  } else {
    try {
      const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      await bootstrapAdministrator(client, email, password);
      console.log("Administrador creado, aprobado y con rol comprobado. Ya puede delegar administración desde la aplicación.");
    } catch (error) {
      console.error(error instanceof Error ? error.message : "No se pudo preparar el administrador.");
      process.exitCode = 1;
    }
  }
}