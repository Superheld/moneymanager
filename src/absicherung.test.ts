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
    // Der Webview liest über `db_select` den ganzen Bestand — ohne CSP könnte jede Zeile
    // fremden JavaScripts ihn lesen UND fortschaffen.
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

describe("Capabilities", () => {
  // Die CSP sperrt, was der WEBVIEW selbst ins Netz schickt. Ein Plugin läuft durch Rust
  // und damit an ihr vorbei — jedes Recht in den Capabilities ist deshalb eine eigene Tür,
  // und die CSP sieht keine davon. Bis 2026-11-10 stand `opener:default` hier, von
  // niemandem benutzt: es öffnet beliebige http(s)-Adressen im Systembrowser, und eine
  // Adresse trägt Daten. „Fortschaffen kann er nichts" stimmte so lange nicht.
  //
  // Deshalb eine GESCHLOSSENE Liste: ein neues Recht macht diesen Test rot, und wer es
  // einträgt, hat die Frage „kommt darüber etwas hinaus?" vor sich statt hinter sich.
  const ORDNER = join(WURZEL, "src-tauri", "capabilities");
  const dateien = readdirSync(ORDNER).filter((d) => d.endsWith(".json"));
  const rechte = dateien.flatMap((datei) => {
    const inhalt = JSON.parse(readFileSync(join(ORDNER, datei), "utf8"));
    return (inhalt.permissions as (string | { identifier: string; allow?: { url: string }[] })[]).map(
      (p) => ({ datei, recht: typeof p === "string" ? p : p.identifier, allow: typeof p === "string" ? null : p.allow ?? [] }),
    );
  });

  const ERLAUBT: Record<string, string> = {
    "core:default": "Fenster, Ereignisse, IPC — ohne das startet nichts",
    "updater:default": "prüft und lädt nur gegen die Endpunkte aus tauri.conf.json, signiert",
    "process:allow-restart": "Neustart nach dem Einspielen eines Updates",
    "http:default": "der Bankabruf — nur mit Hostliste, siehe unten",
  };

  it("sieht überhaupt etwas", () => {
    expect(dateien).toContain("default.json");
    expect(rechte.length).toBeGreaterThan(0);
  });

  it("enthalten nur Rechte, deren Weg nach draussen entschieden ist", () => {
    const fremd = rechte.filter((r) => !(r.recht in ERLAUBT)).map((r) => `${r.datei}: ${r.recht}`);
    expect(fremd, "neues Recht — kommt darüber etwas aus der App hinaus?").toEqual([]);
  });

  it("geben das Netz nur mit einer Hostliste frei, nie pauschal", () => {
    for (const r of rechte.filter((x) => x.recht.startsWith("http:"))) {
      expect(r.allow, `${r.datei}: http ohne Hostliste`).not.toBeNull();
      expect(r.allow!.length, `${r.datei}: leere Hostliste`).toBeGreaterThan(0);
      for (const { url } of r.allow!) {
        // https, ein ausgeschriebener Host ohne Platzhalter, dann der Pfad. Ein `*` im
        // Host wäre eine ganze Domänenfamilie, `http:` eine Leitung im Klartext.
        expect(url, `${r.datei}: ${url}`).toMatch(/^https:\/\/[a-z0-9.-]+\/\*$/);
      }
    }
  });

  it("registrieren kein Plugin, dessen Recht hier nicht steht", () => {
    // Die andere Hälfte: ein Plugin in `lib.rs` ohne Recht ist tot, eines mit Recht
    // steht oben. Was hier auffallen soll, ist das WIEDEREINFÜHREN — das Paket kommt
    // zurück, und das Recht folgt beim ersten „geht nicht".
    const cargo = readFileSync(join(WURZEL, "src-tauri", "Cargo.toml"), "utf8");
    const plugins = [...cargo.matchAll(/^tauri-plugin-([a-z-]+)\s*=/gm)].map((m) => m[1]).sort();
    expect(plugins).toEqual(["http", "process", "updater"]);
  });
});
