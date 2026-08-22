#!/usr/bin/env node
// Sucht nach MUSTERN, die wie private Daten aussehen — die zweite Hälfte des Schutzes.
//
// Die erste Hälfte steht in `src/privatsphaere.test.ts`: sie liest die echte Datenbank und
// prüft den Arbeitsbaum gegen deren Werte. Das findet exakt DEINE Daten, auch anders
// formatiert — und nichts sonst. Genau daran ist einmal etwas vorbeigelaufen: eine
// Kontonummer aus einem FinTS-Mitschnitt, die in keiner Tabelle steht (siehe CLAUDE.md,
// „Mitgelieferte Skills"). Der DB-Abgleich konnte sie nicht finden; ein Muster schon.
//
// Die beiden ersetzen einander deshalb nicht. Der eine kennt die Werte, der andere die
// Formen.
//
//   node scripts/privacy-guard.mjs --staged            vor dem Commit
//   node scripts/privacy-guard.mjs --message <datei>   die Commit-Nachricht
//   node scripts/privacy-guard.mjs --range a..b        Commits vor dem Push
//   node scripts/privacy-guard.mjs --tracked           alles Versionierte (Bestandsprobe)
//   node scripts/privacy-guard.mjs --files <pfade…>    einzelne Dateien
//
// Exit 0 = sauber, 1 = Fund, 2 = der Guard selbst ist kaputt (NICHT durchwinken).
//
// Einzelfall freigeben: `privacy-ok` in dieselbe Zeile. Sparsam — jede Ausnahme ist eine
// Stelle, an der der Guard beim nächsten Mal schweigt.

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { basename } from "node:path";

const FREIGABE = "privacy-ok";

/**
 * Dateien, die naturgemäß nach Fund aussehen.
 *
 * Der Guard selbst enthält die Muster, und seine Tests die Werte, an denen sie anschlagen
 * müssen. Die Bankenliste enthält echte Bankleitzahlen und ist genau deshalb hier — sie
 * ist die REFERENZ, nicht der Verstoß. Die Begriffsliste hält die echten Namen und ist
 * git-ignoriert.
 *
 * Jede Zeile hier ist ein blinder Fleck. Sie sind es wert, aber sie sind es.
 */
const EIGENE = [
  "scripts/privacy-guard.mjs",
  "scripts/privacy-guard.test.ts",
  "public/bankenliste.json",
  "src-tauri/capabilities/fints-banken.json",
  ".privacy-terms",
];

const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

// ── Bankleitzahlen: die Referenz liegt im Repo ────────────────────────────────────────
//
// `src/CLAUDE.md` verlangt für Test-IBANs eine „Bankleitzahl, die es nicht gibt (Bereich
// 999999xx)". Der Präfix war immer nur eine Faustregel für die eigentliche Anforderung:
// die IBAN darf zu keinem echten Konto gehören können. Die lässt sich hier direkt prüfen —
// die DK-Bankenliste liegt als `public/bankenliste.json` im Repo.
//
// Das ist strenger UND nachsichtiger zugleich: eine erfundene BLZ ausserhalb des
// 9999er-Bereichs geht durch (sie kann zu keiner Bank gehören), eine echte BLZ mit
// 9999er-Präfix nicht (die gäbe es dann ja).
function echteBankleitzahlen() {
  const pfad = "public/bankenliste.json";
  if (!existsSync(pfad)) return null;
  try {
    const roh = JSON.parse(readFileSync(pfad, "utf8"));
    const liste = Array.isArray(roh)
      ? roh
      : Object.values(roh).find((v) => Array.isArray(v)) ?? [];
    const blz = new Set(liste.map((b) => String(b.blz ?? "")).filter(Boolean));
    return blz.size > 0 ? blz : null;
  } catch {
    return null;
  }
}

const BLZ_LISTE = echteBankleitzahlen();

/**
 * Gehört die BLZ dieser IBAN zu einer echten Bank?
 *
 * Geprüft werden nur DEUTSCHE IBANs — für die liegt die Referenz im Repo. Eine
 * ausländische liesse sich hier nur raten, und der DB-Abgleich deckt sie ohnehin ab: er
 * liest die echten Kontonummern, gleich welchen Landes. Eine Regel, die raten muss,
 * produziert Fehlalarme, und ein Guard mit Fehlalarmen wird umgangen.
 */
function ibanTrifftEchteBank(treffer) {
  const iban = treffer.replace(/\s/g, "").toUpperCase();
  if (!iban.startsWith("DE")) return false;
  if (!BLZ_LISTE) return true; // ohne Referenz lieber melden als schweigen
  return BLZ_LISTE.has(iban.slice(4, 12));
}

/** IBAN-Prüfsumme nach ISO 7064 — was formal falsch ist, ist offensichtlich erfunden. */
function ibanFormalGueltig(treffer) {
  const iban = treffer.replace(/\s/g, "").toUpperCase();
  const um = iban.slice(4) + iban.slice(0, 4);
  const ziffern = [...um]
    .map((c) => (/[A-Z]/.test(c) ? String(c.charCodeAt(0) - 55) : c))
    .join("");
  let rest = 0;
  for (const z of ziffern) rest = (rest * 10 + Number(z)) % 97;
  return rest === 1;
}

/**
 * Sieht diese Gläubiger-ID nach einem echten Wert aus?
 *
 * Zwei Siebe hintereinander, weil eines allein nicht reicht:
 *
 *  1. **Die Prüfziffer** (ISO 7064 Mod 97-10 über die nationale Kennung). Wer sich eine
 *     ID ausdenkt, trifft sie so gut wie nie — das räumt die Masse der Testwerte ab.
 *  2. **Die Ziffernverteilung.** Manche erfundene Kennung besteht die Prüfziffer zufällig
 *     doch — `…09999999902` ist so ein Fall, und die blosse Zahl verschiedener Ziffern
 *     fängt ihn nicht (es sind drei). Was ihn verrät, ist der ANTEIL: acht von elf
 *     Stellen sind dieselbe Ziffer. Ein Wert, den jemand abgelesen hat, sieht so nicht
 *     aus; ein Wert, den jemand getippt hat, fast immer.
 */
function glaeubigerIdEchtAussehend(treffer) {
  const id = treffer.toUpperCase();
  const national = id.slice(7);
  const haeufigste = Math.max(...[...new Set(national)].map((z) => national.split(z).length - 1));
  if (haeufigste * 2 >= national.length) return false;

  const roh = national + id.slice(0, 2) + "00";
  const ziffern = [...roh]
    .map((c) => (/[A-Z]/.test(c) ? String(c.charCodeAt(0) - 55) : c))
    .join("");
  let rest = 0;
  for (const z of ziffern) rest = (rest * 10 + Number(z)) % 97;
  return String(98 - rest).padStart(2, "0") === id.slice(2, 4);
}

// ── Die Muster ────────────────────────────────────────────────────────────────────────
//
// Jede Regel trägt eine `pruefe`, wo das blosse Muster zu grob wäre. Ein Guard mit
// Fehlalarmen wird umgangen statt gelesen — das ist schlimmer als keiner, weil er
// beruhigt.

const REGELN = [
  {
    id: "iban",
    was: "IBAN, deren Bankleitzahl es wirklich gibt",
    re: /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}\s?[A-Z0-9]{0,4}\b/g,
    // Nur melden, was formal gültig ist UND zu einer echten Bank gehört. Eine erfundene
    // Test-IBAN scheitert an einem von beidem.
    pruefe: (t) => ibanFormalGueltig(t) && ibanTrifftEchteBank(t),
  },
  {
    id: "glaeubiger-id",
    was: "SEPA-Gläubiger-ID",
    // DE + 2 Prüfziffern + ZZZ + 11 Stellen. Die Kennung eines Zahlungsempfängers — aus
    // ihr lässt sich der Vertrag ableiten, auch ohne dass ein Name dabeisteht.
    re: /\b[A-Z]{2}\d{2}[A-Z0-9]{3}\d{11}\b/g,
    pruefe: (t) => glaeubigerIdEchtAussehend(t),
  },
  {
    id: "betrag",
    was: "Geldbetrag mit Währung in Prosa",
    /**
     * NUR in Fliesstext — Changelog, Doku, Commit-Nachrichten. Nicht im Code.
     *
     * Ein Muster kann einen abgelesenen Betrag nicht von einem erfundenen Testwert
     * unterscheiden, und in einer Finanz-App stehen in jedem zweiten Test Beträge. Diese
     * Regel über den Code laufen zu lassen hiesse, bei der eigenen Testsuite anzuschlagen
     * — und ein Guard, den man wegdrückt, schützt nichts mehr. Für die Werte im Code ist
     * der DB-Abgleich zuständig: der KENNT die echten Beträge.
     *
     * In Prosa dreht sich das um. Dort steht ein Betrag fast nie als Beispiel, sondern
     * als Beleg — „am echten Bestand gemessen" ist die überzeugendste Begründung, und
     * genau deshalb rutscht die Zahl dazu mit. Das ist keine Theorie: im Changelog dieses
     * Projekts stand so ein Wert, und der DB-Abgleich konnte ihn nicht finden, weil er
     * gerechnet und nicht gespeichert war.
     */
    nur: /(?:\.mdx?$|^Commit)/i,
    // Die Wortgrenze gehört hinter EUR, NICHT hinter das €: `€\b` verlangt ein Wortzeichen
    // nach dem Zeichen, und nach einem Euro-Symbol steht fast immer ein Leerzeichen oder
    // ein Satzende. Der Guard fand damit keinen einzigen Betrag in dieser Schreibweise —
    // aufgefallen ist es erst, als ein Test ihn absichtlich scheitern sehen wollte.
    re: /(?:(?:\d{1,3}(?:[.\s]\d{3})+|\d{2,})[.,]\d{2}\s*(?:€|EUR\b)|(?:€|EUR)\s*(?:\d{1,3}(?:[.\s]\d{3})+|\d{2,})[.,]\d{2})/g,
    // Runde und kleine Beträge sind Beispiele, keine Messwerte. Erst ab drei Stellen vor
    // dem Komma UND mit Nachkommastellen ungleich 00 wird es ein Wert, den jemand
    // abgelesen hat.
    pruefe: (t) => {
      // Erst die Währung weg, DANN auf glatte Nachkommastellen prüfen: am Treffer selbst
      // steht hinten das €, und ein `/[.,]00$/` darauf trifft nie. Ein glatter Betrag ist
      // ein Beispiel, ein krummer ist abgelesen — das ist der ganze Unterschied hier.
      const ohneWaehrung = t.replace(/[€\s]|EUR/gi, "");
      const n = Number.parseFloat(ohneWaehrung.replace(/\./g, "").replace(",", "."));
      return Number.isFinite(n) && Math.abs(n) >= 100 && !/[.,]00$/.test(ohneWaehrung);
    },
  },
  {
    id: "email",
    was: "E-Mail-Adresse",
    re: /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[A-Za-z]{2,}\b/g,
    // Drei Dinge sehen aus wie eine Adresse und sind keine, und alle drei stehen in
    // diesem Repo: der Dateiname „icons/128x128@2x.png", die SSH-Herkunft eines Pakets
    // („git@github.com") und die üblichen Beispieldomänen.
    pruefe: (t) =>
      !/@(example|test|invalid|localhost|beispiel)\./i.test(t) &&
      !/^(?:git|npm|node)@/i.test(t) &&
      !/\.(png|jpe?g|gif|svg|ico|icns|webp|json|ts|tsx|js|mjs|css|md|html?)$/i.test(t),
  },
  {
    id: "jwt",
    was: "JSON Web Token",
    re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
  },
  {
    id: "produkt-id",
    was: "DK-Produktregistrierungsnummer",
    // Die Nummer steht in der .env und gehört in keine versionierte Datei. Ein eigener
    // Test prüft dasselbe (`fints/produktId.test.ts`) — hier greift es früher.
    re: /\b\d{5}-\d{5}-\d{5}-\d{5}-\d{5}\b/g,
  },
  {
    id: "zugangsdaten",
    was: "Zugangsdaten mit Wert",
    // Ohne `benutzer` und `kundenId`: die tragen bei Banken eine ZIFFERNFOLGE, und die
    // sieht in jedem Test gleich aus wie im Ernstfall. Sie hier zu melden hiesse, bei
    // jedem Bankzugangs-Test anzuschlagen — und ein Guard, den man wegdrückt, schützt
    // nichts mehr. Was wirklich weh tut, ist das Geheimnis daneben, und das steht in der
    // .env (git-ignoriert) und wird zusätzlich als DATEITYP abgefangen.
    re: /\b(?:pin|passwort|password|secret|apiKey|token|clientBasic)\s*[:=]\s*["'`][^"'`\s]{4,}["'`]/gi,
    pruefe: (t) => !/["'`](?:test|demo|xxx+|\.{3}|geheim|dein|your|dummy|beispiel)[^"'`]*["'`]/i.test(t),
  },
];

/**
 * Zusätzliche Begriffe aus `.privacy-terms` — Namen, Arbeitgeber, Vereine.
 *
 * Git-ignoriert und deshalb je Klon eigen. Fehlt die Datei, prüft der Guard keine Namen;
 * das ist kein Fehler, aber es steht in der Meldung, damit niemand mehr Schutz annimmt,
 * als da ist.
 */
function begriffsRegel() {
  if (!existsSync(".privacy-terms")) return null;
  const begriffe = readFileSync(".privacy-terms", "utf8")
    .split("\n")
    .map((z) => z.replace(/#.*/, "").trim())
    .filter((z) => z.length >= 4)
    .map((b) => b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!begriffe.length) return null;
  return {
    id: "begriff",
    was: "Begriff aus .privacy-terms",
    re: new RegExp(`(?:${begriffe.join("|")})`, "gi"),
  };
}

/** Dateitypen, die nie ins Repo gehören — auch nicht erzwungen. */
const VERBOTENE_DATEI = /\.(har|env|pem|key|p12|db|sqlite3?|csv|xlsx)$/i;

/**
 * Fundstelle anzeigen, ohne sie zu wiederholen.
 *
 * Der Guard läuft im Terminal und in CI-Protokollen; einen echten Wert auszugeben hiesse,
 * ihn an eine zweite Stelle zu schreiben, um vor der ersten zu warnen.
 */
const maskiere = (s) =>
  s.length <= 6 ? "*".repeat(s.length) : `${s.slice(0, 2)}${"*".repeat(Math.min(s.length - 4, 20))}${s.slice(-2)}`;

function pruefeText(text, herkunft, funde, regeln, abZeile = 1) {
  text.split("\n").forEach((zeile, i) => {
    if (zeile.includes(FREIGABE)) return;
    for (const regel of regeln) {
      // Manche Regel trägt nur in PROSA. Siehe `betrag`.
      if (regel.nur && !regel.nur.test(herkunft)) continue;
      regel.re.lastIndex = 0;
      for (const m of zeile.matchAll(regel.re)) {
        if (regel.pruefe && !regel.pruefe(m[0])) continue;
        funde.push({ herkunft, zeile: abZeile + i, regel: regel.id, was: regel.was, treffer: m[0] });
      }
    }
  });
}

function main() {
  const argv = process.argv.slice(2);
  const modus = argv[0] ?? "--staged";
  const regeln = [...REGELN];
  const begriffe = begriffsRegel();
  if (begriffe) regeln.push(begriffe);

  const funde = [];
  let geprueft = "";

  if (modus === "--staged" || modus === "--range") {
    const diffArgs =
      modus === "--range"
        ? ["diff", "--unified=0", "--no-color", argv[1]]
        : ["diff", "--cached", "--unified=0", "--no-color"];
    geprueft = modus === "--range" ? `Commits ${argv[1]}` : "vorgemerkte Änderungen";

    // Nur HINZUGEFÜGTE Zeilen: was gelöscht wird, ist nicht das Problem — und eine
    // Umformatierung der ganzen Datei würde sonst jede Altlast neu melden.
    // Die Zeilennummer aus dem @@-Kopf mitzählen. Ohne das trägt JEDER Fund die Zeile 1
    // — geprüft wird ja Zeile für Zeile —, und eine falsche Nummer ist schlimmer als
    // keine: man sucht an der falschen Stelle und glaubt dann, der Guard spinne.
    let datei = "?";
    let nummer = 0;
    for (const zeile of git(...diffArgs).split("\n")) {
      if (zeile.startsWith("+++ b/")) { datei = zeile.slice(6); continue; }
      const kopf = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(zeile);
      if (kopf) { nummer = Number(kopf[1]); continue; }
      if (!zeile.startsWith("+") || zeile.startsWith("+++")) continue;
      if (!EIGENE.includes(datei)) pruefeText(zeile.slice(1), datei, funde, regeln, nummer);
      nummer++;
    }

    const namen =
      modus === "--range"
        ? git("diff", "--name-only", argv[1]).split("\n")
        : git("diff", "--cached", "--name-only").split("\n");
    for (const n of namen.filter(Boolean)) {
      if (VERBOTENE_DATEI.test(n) || /^\.env/.test(basename(n))) {
        funde.push({ herkunft: n, zeile: 0, regel: "datei",
                     was: "Dateityp gehört nicht ins Repo", treffer: basename(n) });
      }
    }

    if (modus === "--range") {
      pruefeText(git("log", "--format=%B%n--%n", argv[1]), "Commit-Nachrichten", funde, regeln);
    }
  } else if (modus === "--message") {
    geprueft = "Commit-Nachricht";
    // Als Herkunft der BEGRIFF, nicht der Dateipfad (`.git/COMMIT_EDITMSG`): Regeln, die
    // nur in Prosa gelten, erkennen die Nachricht sonst nicht als solche und schweigen —
    // ausgerechnet an der Stelle, an der ein abgelesener Betrag am häufigsten landet.
    pruefeText(readFileSync(argv[1], "utf8"), "Commit-Nachricht", funde, regeln);
  } else if (modus === "--tracked" || modus === "--files") {
    const dateien =
      modus === "--files" ? argv.slice(1) : git("ls-files").split("\n").filter(Boolean);
    geprueft = `${dateien.length} Datei(en)`;
    for (const d of dateien) {
      if (EIGENE.includes(d) || !existsSync(d)) continue;
      const roh = readFileSync(d);
      if (roh.includes(0)) continue; // binär
      pruefeText(roh.toString("utf8"), d, funde, regeln);
    }
  } else {
    console.error(`unbekannter Modus: ${modus}`);
    return 2;
  }

  if (!funde.length) {
    const nachsatz = begriffe ? "" : "  (ohne .privacy-terms: Namen werden nicht geprüft)";
    console.error(`✓ Muster-Guard: ${geprueft} — nichts gefunden${nachsatz}`);
    return 0;
  }

  console.error(`\n✋ Muster-Guard: ${funde.length} Fund(e) in ${geprueft}\n`);
  const nachRegel = new Map();
  for (const f of funde) {
    if (!nachRegel.has(f.regel)) nachRegel.set(f.regel, []);
    nachRegel.get(f.regel).push(f);
  }
  for (const [, liste] of nachRegel) {
    console.error(`  ${liste[0].was}`);
    for (const f of liste.slice(0, 8)) {
      const ort = f.zeile ? `${f.herkunft}:${f.zeile}` : f.herkunft;
      console.error(`    ${ort}  →  ${maskiere(f.treffer)}`);
    }
    if (liste.length > 8) console.error(`    … und ${liste.length - 8} weitere`);
    console.error("");
  }
  console.error("  Treffer sind maskiert — nachsehen im Original, nicht hier.");
  console.error(`  Fehlalarm? \`${FREIGABE}\` in dieselbe Zeile. Sparsam.\n`);
  return 1;
}

try {
  process.exit(main());
} catch (fehler) {
  // Nicht durchwinken, wenn der Guard selbst nicht laufen kann: ein Wächter, der nichts
  // sieht, ist schlimmer als keiner — er beruhigt.
  console.error(`Muster-Guard konnte nicht laufen: ${fehler.message}`);
  process.exit(2);
}
