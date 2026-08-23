// Prüft den Muster-Guard in BEIDE Richtungen.
//
// Ein Wächter, den man nicht hat scheitern sehen, ist ungeprüft — und einer, der bei den
// eigenen Testdaten anschlägt, wird umgangen statt gelesen. Deshalb steht hier zu jeder
// Regel ein Paar: ein Wert, der gefunden werden MUSS, und einer, der durchgehen muss.
//
// Die „echt aussehenden" Werte stehen NICHT im Quelltext. Eine IBAN mit echter
// Bankleitzahl wäre genau das, wovor der Guard schützt; sie wird deshalb zur Laufzeit aus
// der Bankenliste im Repo gebaut. Im Repo steht die Vorschrift, nicht der Wert.

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Läuft der Guard über diesen Text an?
 *
 * Die ENDUNG ist Teil des Testfalls, nicht Beiwerk: manche Regel gilt nur in Prosa
 * (siehe `betrag` im Guard). Ein Betrag in einer `.ts` muss durchgehen und derselbe in
 * einer `.md` anschlagen — wer hier immer dieselbe Endung nimmt, prüft die Hälfte.
 */
function pruefe(inhalt: string, endung = "ts"): { fund: boolean; ausgabe: string } {
  const ordner = mkdtempSync(join(tmpdir(), "guard-"));
  const datei = join(ordner, `probe.${endung}`);
  writeFileSync(datei, inhalt, "utf8");
  try {
    execFileSync("node", ["scripts/privacy-guard.mjs", "--files", datei], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { fund: false, ausgabe: "" };
  } catch (e) {
    const fehler = e as { status?: number; stderr?: string };
    // Exit 2 heisst: der Guard selbst ist kaputt. Das ist kein Fund, sondern ein Defekt,
    // und es darf nicht als „hat angeschlagen" durchgehen.
    expect(fehler.status, `Guard-Ausgabe: ${fehler.stderr}`).toBe(1);
    return { fund: true, ausgabe: fehler.stderr ?? "" };
  }
}

/** IBAN-Prüfziffer nach ISO 7064 ergänzen. */
function mitPruefziffer(land: string, konto: string): string {
  const roh = konto + land + "00";
  const ziffern = [...roh].map((c) => (/[A-Z]/.test(c) ? String(c.charCodeAt(0) - 55) : c)).join("");
  let rest = 0;
  for (const z of ziffern) rest = (rest * 10 + Number(z)) % 97;
  return `${land}${String(98 - rest).padStart(2, "0")}${konto}`;
}

let echteBlz = "";
let erfundeneBlz = "";

beforeAll(() => {
  const roh = JSON.parse(readFileSync("public/bankenliste.json", "utf8"));
  const liste: { blz: string }[] = Array.isArray(roh)
    ? roh
    : (Object.values(roh).find((v) => Array.isArray(v)) as { blz: string }[]);
  echteBlz = liste[0].blz;
  const bekannt = new Set(liste.map((b) => String(b.blz)));
  // Die erste 9999er-BLZ, die es wirklich nicht gibt — dieselbe Regel wie in src/CLAUDE.md.
  for (let i = 0; i < 100 && !erfundeneBlz; i++) {
    const kandidat = `9999${String(i).padStart(4, "0")}`;
    if (!bekannt.has(kandidat)) erfundeneBlz = kandidat;
  }
  expect(echteBlz).toMatch(/^\d{8}$/);
  expect(erfundeneBlz).toMatch(/^\d{8}$/);
});

describe("Muster-Guard — was er finden MUSS", () => {
  it("eine IBAN, deren Bankleitzahl es wirklich gibt", () => {
    const iban = mitPruefziffer("DE", `${echteBlz}0123456789`);
    expect(pruefe(`const konto = "${iban}";`).fund).toBe(true);
  });

  it("einen abgelesenen Geldbetrag in Prosa", () => {
    expect(pruefe("Der Stand lag bei 1.651,52 € auf dem Girokonto.", "md").fund).toBe(true);
  });

  it("eine E-Mail-Adresse", () => {
    expect(pruefe("Kontakt: vorname.nachname@irgendeinehausbank.de").fund).toBe(true);
  });

  it("ein JSON Web Token", () => {
    expect(pruefe("token: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0").fund).toBe(true);
  });

  it("eine DK-Produktregistrierungsnummer", () => {
    expect(pruefe("PRODUKT_ID=12345-67890-12345-67890-12345").fund).toBe(true);
  });

  it("ein Passwort mit Wert", () => {
    expect(pruefe(`const pin = "8471";`).fund).toBe(true);
  });

  /**
   * Die Ausnahme fuer den Co-Authored-By-Trailer ist eng geschnitten, und diese drei
   * Faelle halten sie eng: eine echte Adresse in demselben Trailer, eine noreply-Adresse
   * irgendwo sonst, und beides ohne einander.
   */
  it("eine ECHTE Adresse, auch im Co-Authored-By-Trailer", () => {
    expect(pruefe("Co-Authored-By: Jemand <vorname.nachname@irgendeinehausbank.de>").fund).toBe(true);
  });

  it("eine noreply-Adresse ausserhalb des Trailers", () => {
    expect(pruefe("Schreib an noreply@irgendeinehausbank.de, das kommt nie an.").fund).toBe(true);
  });
});

describe("Muster-Guard — was durchgehen MUSS", () => {
  /**
   * Git-Konvention und oeffentlich dokumentiert, keine Kontaktadresse eines Menschen.
   * Ohne die Ausnahme schluege der Guard bei JEDEM solchen Commit an, und man muesste
   * jedes Mal an `privacy-ok` denken — wer aber jedes Mal daran denken muss, vergisst es.
   */
  it("die noreply-Adresse im Co-Authored-By-Trailer", () => {
    expect(pruefe("Co-Authored-By: Claude <noreply@anthropic.com>").fund).toBe(false);
  });

  it("eine Test-IBAN mit erfundener Bankleitzahl", () => {
    const iban = mitPruefziffer("DE", `${erfundeneBlz}0000000001`);
    expect(pruefe(`const konto = "${iban}";`).fund).toBe(false);
  });

  it("die Gläubiger-IDs aus den eigenen Testdaten", () => {
    // Genau die Formen, die im Bestand stehen: viele gleiche Ziffern, oft mit zufällig
    // passender Prüfziffer. Schlüge der Guard hier an, würde er weggedrückt.
    const inhalt = ["DE98ZZZ09999999901", "DE98ZZZ09999999902", "DE98ZZZ09999999999"]
      .map((id) => `glaeubigerId: "${id}",`)
      .join("\n");
    expect(pruefe(inhalt).fund).toBe(false);
  });

  it("runde Beispielbeträge in Prosa", () => {
    expect(pruefe("Ein Budget von 250,00 € und eine Rate von 12,50 €.", "md").fund).toBe(false);
  });

  /**
   * Beträge im CODE prüft dieser Guard bewusst nicht — in einer Finanz-App steht in jedem
   * zweiten Test einer, und ein Muster kann den abgelesenen nicht vom erfundenen trennen.
   * Dafür ist der Datenbank-Abgleich zuständig, der die echten Werte kennt.
   */
  it("einen krummen Betrag im Code", () => {
    expect(pruefe('expect(zeile).toBe("−1.651,52 €");').fund).toBe(false);
  });

  it("Beispieldomänen und Dateinamen mit @", () => {
    expect(pruefe('mail: "wer@example.com", icon: "icons/128x128@2x.png"').fund).toBe(false);
  });

  it("die SSH-Herkunft eines Pakets", () => {
    expect(pruefe('"resolved": "git+ssh://git@github.com/Superheld/lib-fints.git"').fund).toBe(false);
  });

  it("eine Bankzugangs-Kennung, die in jedem Test gleich aussieht", () => {
    expect(pruefe('benutzer: "10203040", kundenId: "12345"').fund).toBe(false);
  });

  it("eine Zeile mit Freigabe-Marker", () => {
    const iban = mitPruefziffer("DE", `${echteBlz}0123456789`);
    expect(pruefe(`const konto = "${iban}"; // privacy-ok`).fund).toBe(false);
  });
});

describe("Muster-Guard — der Bestand", () => {
  /**
   * Der schärfste Test: Der Guard läuft über alles Versionierte und darf NICHTS finden.
   * Schlägt er hier an, ist entweder ein echter Wert hineingeraten oder eine Regel zu
   * grob — beides gehört sofort geklärt und nicht mit einer Ausnahme zugedeckt.
   */
  it("findet im gesamten Repo nichts", () => {
    const ausgabe = execFileSync("node", ["scripts/privacy-guard.mjs", "--tracked"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    expect(ausgabe).toBe("");
  });
});
