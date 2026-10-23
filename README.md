# Welcome to your Lovable project

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS

## Conservar el administrador al migrar

**Exportar código no traslada cuentas:** una copia del código o un remix no garantiza que exista la cuenta administradora original en el destino. Los datos se exportan por separado en Cloud → Advanced settings → Export data. No des por hecho que esa exportación incluya identidades de acceso o contraseñas: confirma el alcance de la transferencia de cuentas con el destino antes de migrar. Configura por separado las claves y los proveedores de acceso y comprueba allí que puedes entrar y otorgar administración antes de compartir la app.

**Instalación nueva:** tras aplicar todas las migraciones, la primera cuenta registrada recibe automáticamente administración y aprobación. Crea tu cuenta antes de compartir el enlace con otros jugadores. Las siguientes necesitan aprobación. La asignación inicial es única: no vuelve a activarse al eliminar administradores o reiniciar el progreso. Una migración con cuentas existentes conserva sus roles, sin promover al siguiente registro.

**Alternativa para destinos bajo tu control:** el proyecto incluye `scripts/admin-bootstrap.ts`. Un operador puede ejecutar `bun run admin:bootstrap` para crear una cuenta nueva y aprobada con rol administrador. El comando no se ejecuta al abrir la app y nunca cambia la contraseña ni promueve una cuenta ya existente.

Proporciona estas variables desde el gestor privado de secretos del destino (nunca en el repositorio):

- `ADMIN_SETUP_URL`: dirección del servicio de cuentas del destino compatible.
- `ADMIN_SETUP_SERVICE_KEY`: credencial privilegiada del destino, disponible únicamente para el operador. Lovable Cloud no permite obtener su clave interna; este comando está destinado a un servidor compatible bajo tu control.
- `ADMIN_SETUP_EMAIL`: correo de la cuenta administradora que se recreará.
- `ADMIN_SETUP_PASSWORD`: contraseña elegida, al menos 10 caracteres, mayúscula, minúscula y número.

Elimina las variables de preparación tras ejecutarlo. No copies contraseñas ni claves en los archivos exportados. Una instalación nueva crea otra identidad y no recupera el historial de la cuenta original: para mantenerlo, utiliza la exportación completa. En un nuevo proyecto Lovable Cloud, utiliza el registro de la primera cuenta, no este comando.

## Contraseñas al migrar

El formulario y el procedimiento de preparación exigen al menos **10 caracteres, una mayúscula, una minúscula y un número**; no exigen símbolos. Las reglas del servicio de acceso son independientes del código y pueden exigir más seguridad.

En el proyecto actual y en el destino, revisa **More → Users → Auth settings → Email → Password rules**: longitud mínima **10** y caracteres obligatorios **mayúsculas, minúsculas y números**, sin símbolos obligatorios. Este ajuste lo realiza el propietario en Lovable; no se modifica desde el código. La comprobación de contraseñas filtradas, si está activa, puede rechazar una contraseña que cumpla esos cuatro requisitos.
