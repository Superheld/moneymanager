// Der Wächter über das, was die App nach draussen sprechen darf.
//
// Zwei Dinge stehen hier zusammen, weil sie nur zusammen wirken:
//
// 1. Die CSP in `tauri.conf.json`. Sie sperrt den Weg nach draussen für alles, was im
//    Webview läuft — auch für eine Abhängigkeit, die eines Tages etwas mitbringt, das
//    niemand bestellt hat. Der Bankabruf ist davon unberührt: er läuft über
//    `tauri-plugin-http` durch Rust (siehe `adapters/fints/transport.ts`), also am
//    Webview vorbei, und ist über die Capabilities auf Bank-Hosts begrenzt.
//
// 2. Dass keine Stilvorlage eine Ressource aus dem Netz nachlädt. Bis 2026-08-25 holte
//    `tokens/fonts.css` die Schrift von einem Schriften-Dienst. Das war nicht nur ein
//    ungefragter Netzzugriff bei jedem Start — es hätte die CSP entwertet: wer einen
//    fremden Host erlauben MUSS, hat einen Kanal, über den sich Daten in einer URL
//    hinaustragen lassen. Eine CSP mit diesem Loch beruhigt, ohne zu wirken.
//
// Deshalb der zweite Test: die CSP allein ist keine Zusage, solange eine CSS-Datei sie
// wieder aufweichen kann.

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const WURZEL = join(import.meta.dirname, "..");
const KONFIG = JSON.parse(readFileSync(join(WURZEL, "src-tauri", "tauri.conf.json"), "utf8"));

const csp: string | null = KONFIG.app?.security?.csp ?? null;
const devCsp: string | null = KONFIG.app?.security?.devCsp ?? null;

/** Die Quelldefinition einer Direktive, z. B. `script-src` → `'self'`. */
function direktive(policy: string, name: string): string {
  const treffer = policy
    .split(";")
    .map((t) => t.trim())
    .find((t) => t === name || t.startsWith(name + " "));
  return treffer ? treffer.slice(name.length).trim() : "";
}

/** Alle CSS-Dateien unter `src/styles`, rekursiv. */
function stilvorlagen(verzeichnis: string): string[] {
  const gefunden: string[] = [];
  for (const eintrag of readdirSync(verzeichnis, { withFileTypes: true })) {
    const pfad = join(verzeichnis, eintrag.name);
    if (eintrag.isDirectory()) gefunden.push(...stilvorlagen(pfad));
    else if (eintrag.name.endsWith(".css")) gefunden.push(pfad);
  }
  return gefunden;
}

describe("Content Security Policy", () => {
  it("ist überhaupt gesetzt", () => {
    // `null` ist der Auslieferungszustand von Tauri und heisst: keine Einschränkung.
    // Zusammen mit `sql:allow-execute` in den Capabilities hiesse das, dass jede Zeile
    // fremden JavaScripts den ganzen Bestand lesen UND fortschaffen kann.
    expect(csp, "app.security.csp fehlt").toBeTruthy();
    expect(devCsp, "app.security.devCsp fehlt").toBeTruthy();
  });

  it("verbietet Skript-Quellen, die kein Mensch geschrieben hat", () => {
    // `unsafe-eval` macht aus jeder Zeichenkette ausführbaren Code; `unsafe-inline`
    // erlaubt Skripte, die erst im Dokument entstehen. Beides hebt den Schutz auf,
    // um den es hier geht. Im DEV-Modus ist `unsafe-inline` unvermeidlich (Vite und
    // React-Refresh spritzen ihre Skripte inline ein) — deshalb gibt es devCsp
    // getrennt, und deshalb prüft dieser Test nur die ausgelieferte Fassung.
    const script = direktive(csp!, "script-src");
    expect(script).toContain("'self'");
    expect(script).not.toContain("unsafe-eval");
    expect(script).not.toContain("unsafe-inline");
    expect(csp).not.toContain("unsafe-eval");
  });

  it("lässt keinen Weg nach draussen offen", () => {
    // Der Kern der Sache: was im Webview läuft, darf lesen, aber nichts fortschaffen.
    // Erlaubt sind nur die eigene Herkunft und der Tauri-IPC — beides bleibt auf der
    // Maschine. Ein `https:` oder ein fremder Host an dieser Stelle wäre die offene Tür.
    const connect = direktive(csp!, "connect-src");
    for (const quelle of connect.split(/\s+/).filter(Boolean)) {
      expect(
        ["'self'", "ipc:", "http://ipc.localhost"].includes(quelle),
        `connect-src erlaubt ${quelle}`,
      ).toBe(true);
    }
  });

  it("holt Schriften ausschliesslich aus der App selbst", () => {
    // Die Regression, die schon einmal da war: eine Schrift aus dem Netz. Sie kostet
    // nicht nur einen Netzzugriff bei jedem Start, sie zwingt auch dazu, den Host in
    // style-src und font-src zu erlauben — und damit ist der Weg nach draussen wieder da.
    expect(direktive(csp!, "font-src")).toBe("'self'");
  });

  it("schliesst Einbettung und Plugins aus", () => {
    expect(direktive(csp!, "object-src")).toBe("'none'");
    expect(direktive(csp!, "frame-ancestors")).toBe("'none'");
    expect(direktive(csp!, "default-src")).toBe("'self'");
  });

  it("lockert im Dev-Modus nur auf den Vite-Server", () => {
    // devCsp darf mehr erlauben, aber nichts, was nicht auf dieser Maschine liegt.
    const connect = direktive(devCsp!, "connect-src");
    for (const quelle of connect.split(/\s+/).filter(Boolean)) {
      const oertlich =
        ["'self'", "ipc:", "http://ipc.localhost"].includes(quelle) ||
        /^(ws|http):\/\/localhost:1420$/.test(quelle);
      expect(oertlich, `devCsp connect-src erlaubt ${quelle}`).toBe(true);
    }
  });
});

describe("Stilvorlagen", () => {
  it("laden nichts aus dem Netz nach", () => {
    // Ein `@import url('https://…')` oder ein `url(https://…)` in einer CSS-Datei ist
    // ein Netzzugriff, den die CSP dann erlauben MÜSSTE — und genau dadurch wäre sie
    // keine Zusage mehr. `data:`-URIs sind ausdrücklich in Ordnung: sie tragen ihren
    // Inhalt selbst und sprechen mit niemandem.
    const treffer: string[] = [];
    for (const datei of stilvorlagen(join(WURZEL, "src", "styles"))) {
      const inhalt = readFileSync(datei, "utf8");
      for (const zeile of inhalt.split("\n")) {
        if (/url\(\s*['"]?https?:\/\//i.test(zeile)) {
          treffer.push(`${datei.replace(WURZEL + "/", "")}: ${zeile.trim().slice(0, 80)}`);
        }
      }
    }
    expect(treffer, treffer.join("\n")).toEqual([]);
  });
});
