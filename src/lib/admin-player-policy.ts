export function assertPlayerDeletionAllowed(actorId: string, targetId: string, isAdmin: boolean) {
  if (!isAdmin) throw new Error("Solo un administrador puede eliminar jugadores.");
  if (actorId === targetId) throw new Error("No puedes eliminar tu propia cuenta.");
}

export function assertAdminGrantAllowed(isAdmin: boolean) {
  if (!isAdmin) throw new Error("Solo un administrador puede otorgar permisos de administrador.");
}