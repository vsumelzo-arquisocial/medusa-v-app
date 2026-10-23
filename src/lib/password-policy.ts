export const PASSWORD_REQUIREMENTS = "Mínimo 10 caracteres, una mayúscula, una minúscula y un número.";

export function isSecurePassword(password: string): boolean {
  return password.length >= 10 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /[0-9]/.test(password);
}