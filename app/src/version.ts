// Einzige Quelle der App-Version für das Frontend: package.json. Auch tauri.conf.json
// liest die Version von dort (eine Quelle, an einer Stelle bumpen).
import pkg from "../package.json";

export const APP_VERSION: string = pkg.version;
