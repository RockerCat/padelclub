// Configuración mínima para que Metro pueda resolver shared/ (fuera de la
// raíz de mobile/) sin convertir el repo en un monorepo con workspaces —
// exactamente lo que la app web ya no necesita gracias a que Next.js
// resuelve imports relativos por su cuenta. Metro, por defecto, solo
// observa/resuelve archivos dentro de projectRoot (mobile/); watchFolders
// es la única pieza que falta para que un import relativo como
// "../../../shared/reservations/pricing" (desde mobile/src/lib/) funcione
// en el bundle real, no solo en tsc.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..");

const config = getDefaultConfig(projectRoot);

// Deja que Metro vea (y por lo tanto pueda resolver) shared/ en la raíz
// del repo, un nivel arriba de mobile/.
config.watchFolders = [path.resolve(workspaceRoot, "shared")];

// shared/ no trae su propio node_modules (es TS puro, sin dependencias
// nuevas) — apuntar la resolución de node_modules solo a la de mobile/
// evita que Metro intente usar cualquier node_modules de la raíz del repo
// (que tampoco existe hoy), manteniendo esto mínimo y explícito.
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, "node_modules")];

module.exports = config;
