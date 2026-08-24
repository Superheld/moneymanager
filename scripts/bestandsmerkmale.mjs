// Die Merkmale des echten Bestands — EINE Quelle für beide Wächter.
//
// Es gibt diese Datei, weil es die Liste vorher zweimal gab: einmal in
// `src/privatsphaere.test.ts` (prüft den Arbeitsbaum) und einmal in `.githooks/pre-push`
// (prüft die ausgehenden Commit-Texte). Zwei Listen für dieselbe Sache driften, und sie
// haben es getan: als `budget.betrag_pro_monat` einer Reihe wich, zog der Test mit und
// der Hook nicht. Der lief danach nicht etwa mit einem Merkmal weniger — er brach unter
// `set -e` wortlos ab, und der Push scheiterte ohne eine Zeile Begründung.
//
// Aufgerufen wird sie auf zwei Wegen:
//   • als Modul     — `import { bestandsmerkmale } from ".../bestandsmerkmale.mjs"`
//   • als Kommando  — `node scripts/bestandsmerkmale.mjs` gibt ein Merkmal je Zeile aus
//
// Sie liest NUR. Und sie kennt die Daten nicht: alles kommt zur Laufzeit aus der
// Datenbank, damit das, wovor sie schützt, nirgends im Repo steht.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Die echte Datenbank — read-only gelesen, nie geschrieben.
 *
 * Gelesen wird über das `sqlite3`-Kommando, NICHT über sql.js. Der Grund ist derselbe,
 * vor dem CLAUDE.md bei Kopien warnt: die Datenbank läuft im WAL-Modus, und sql.js liest
 * nur die Hauptdatei. Der erste Anlauf dieses Wächters tat genau das — und übersah
 * deshalb die ganze Anker-Tabelle samt der Kontostände darin, die zur selben Stunde in
 * zwei Testdateien standen.
 *
 * Und **nicht** mit `-readonly`: solange die App läuft, hält sie die Datenbank, und ein
 * read-only-Zugriff scheitert dann mit „unable to open database file" — er darf die
 * `-shm`-Datei nicht anlegen, die der WAL-Modus braucht. `PRAGMA query_only=ON` öffnet
 * normal und verbietet trotzdem jedes Schreiben.
 *
 * Beides zusammen ist die eigentliche Lehre: ein Wächter, der die halbe Datenbank nicht
 * sieht oder sie gar nicht aufbekommt, ist schlimmer als keiner — er beruhigt. Deshalb
 * wird unten hart unterschieden zwischen „keine Datenbank da" (nichts zu prüfen) und
 * „Datenbank da, aber nicht lesbar" (Abbruch).
 */
export const DB_PFAD = join(
  homedir(),
  "Library/Application Support/de.netmechanics.moneymanager/moneymanager.db",
);

/**
 * Untergrenze für die DICHTE Gruppe: die Beträge einzelner Buchungen und Importzeilen.
 *
 * Ein Haushalt hat eine Handvoll Kontostände und Budgetbeträge — die decken den
 * Zahlenraum nirgends ab, jeder Treffer darauf ist eine Aussage. Er hat aber tausende
 * Buchungen, und die liegen so dicht, dass sie Allerweltspreise zwangsläufig treffen:
 * „19,99", „25,99", „12,00" stehen in Fixtures, weil sie jeder tippt, und nicht, weil
 * jemand abgelesen hätte. Nachgemessen über den ganzen Baum: 27 Treffer aus dieser
 * Gruppe, zwei Drittel davon solche Allerweltsbeträge.
 *
 * Nicht weil kleine Beträge egal wären — sie sagen für sich genommen nichts. Was verrät,
 * liegt darüber: Miete, Gehalt, Rate, Versicherung.
 */
const DICHT = 10000; // 100,00

/**
 * Untergrenze für alles andere, und zugleich die alte Regel: unter 10 EUR und bei glatten
 * Zehnern lohnt es nicht — „0,00", „10,00", „100,00" stehen in jeder zweiten Fixture.
 */
const SPARSAM = 1000;

/** Allerweltswörter: sie benennen niemanden und stehen überall. */
const ALLERWELT = new Set([
  "Abbuchung", "Action", "Baecker", "Bargeld", "Friseur", "Geschenk", "Girokonto",
  "Gutschrift", "Retour", "Tanken", "Tankstelle", "Transact", "Urlaub", "Veranstaltung",
  "Verrechnungskonto", "Tagesgeldkonto", "Kreditkarte",
  "Waschmaschine", "Geschirrspüler", "Laptop", "Fahrrad", "Sparkonto",
]);

function sqliteVorhanden() {
  try {
    execFileSync("sqlite3", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Die Zeichenketten aus einem Einstellungswert.
 *
 * Manche Einstellung hält eine LISTE — die weggeklickten Vertragsvorschläge etwa sind ein
 * JSON-Array voller Händlernamen. Der Wert als Ganzes taugt nicht als Suchmuster, die
 * einzelnen Namen darin sehr wohl. Was kein JSON ist, geht unverändert durch.
 */
function jsonStrings(wert) {
  try {
    const geparst = JSON.parse(wert);
    if (Array.isArray(geparst)) return geparst.filter((x) => typeof x === "string");
    if (geparst && typeof geparst === "object") {
      return Object.values(geparst).filter((x) => typeof x === "string");
    }
  } catch {
    // kein JSON — dann ist der Wert selbst der Kandidat
  }
  return [wert];
}

/**
 * Alle Merkmale des echten Bestands.
 *
 * Gibt eine LEERE Liste zurück, wenn es die Datenbank oder `sqlite3` nicht gibt (frischer
 * Klon, CI, anderer Rechner) — dann ist nichts zu schützen. WIRFT dagegen, wenn die
 * Datenbank da ist, sich aber nicht lesen lässt oder kein einziges Merkmal hergibt: ein
 * Wächter, der nichts gesehen hat und trotzdem grün meldet, ist schlimmer als keiner.
 */
export function bestandsmerkmale() {
  if (!existsSync(DB_PFAD) || !sqliteVorhanden()) return [];
  const werte = new Set();

  const banken = JSON.parse(readFileSync(join(WURZEL, "public/bankenliste.json"), "utf8"));
  const bankNamen = new Set(
    Object.values(banken).find(Array.isArray).map((b) => b.name),
  );

  function frage(sql, mussGehen = false) {
    try {
      return execFileSync("sqlite3", ["-cmd", "PRAGMA query_only=ON", DB_PFAD, sql], {
        encoding: "utf8",
        maxBuffer: 256 * 1024 * 1024,
      })
        .split("\n")
        .filter(Boolean);
    } catch (e) {
      // Eine Tabelle, die es (noch) nicht gibt, ist in Ordnung — eine Datenbank, die sich
      // nicht öffnen lässt, nicht.
      if (mussGehen) {
        throw new Error(
          `Die Datenbank ist da, lässt sich aber nicht lesen — es wurde NICHTS geprüft.\n${String(e).slice(0, 200)}`,
        );
      }
      return [];
    }
  }

  // Probeabfrage: geht die Datenbank überhaupt auf?
  frage("SELECT count(*) FROM sqlite_master", true);

  function betraege(zeilen, untergrenze) {
    for (const roh of zeilen) {
      const cent = Number(roh);
      if (!Number.isFinite(cent) || Math.abs(cent) < untergrenze || cent % 1000 === 0) continue;
      const euro = Math.trunc(Math.abs(cent) / 100);
      const rest = String(Math.abs(cent) % 100).padStart(2, "0");
      werte.add(`${euro},${rest}`); //  1234,56
      werte.add(`${euro.toLocaleString("de-DE")},${rest}`); //  1.234,56
      // Und mit PUNKT — die englische Schreibweise, in der Beträge in den Code kommen:
      // die Bank liefert `amount` als Fliesskomma, Fixtures schreiben ihn genauso ab.
      // Diese Form fehlte bis 2026-08-24, und sie hat sofort ein zweites Vorkommen eines
      // schon bereinigten Lecks gefunden — dieselben Werte, nur mit Punkt geschrieben.
      //
      // Aber erst ab 100 EUR, und der Grund ist ein DATUM: „25.10" ist der Tag, an dem die
      // Sommerzeit endet, und stand als solcher in einem Kommentar. Zweistellig vor dem
      // Punkt ist die Form nicht von einer deutschen Tagesangabe zu unterscheiden;
      // dreistellig schon, denn einen 128. Tag gibt es nicht.
      if (Math.abs(cent) >= DICHT) werte.add(`${euro}.${rest}`); //  1234.56
      // Die Rohform in Cent, wie sie in Fixtures steht — aber erst ab 100 EUR. Darunter
      // ist sie vierstellig, und vierstellige Zahlen sind in einer Codebasis fast nie
      // Beträge: `9010` ist ein FinTS-Rückmeldungscode, `3600` eine Token-Laufzeit,
      // `1420` ein Port. Sie kosten mehr Vertrauen, als sie einbringen.
      if (Math.abs(cent) >= DICHT) werte.add(String(cent));
    }
  }

  // Die sparsame Gruppe: wenige, dafür sprechende Werte.
  betraege(
    [
      ...frage("SELECT kontostand FROM zahlungskonto"),
      ...frage("SELECT betrag FROM budget_betrag"),
      ...frage("SELECT betrag FROM kontostand_anker"),
      ...frage("SELECT sum(betrag) FROM ist_buchung GROUP BY konto_id"),
      // Die Rate eines Vertrags sagt so viel wie die Buchung dazu.
      ...frage("SELECT DISTINCT betrag FROM zahlungsregel"),
      ...frage("SELECT betrag_von FROM vertrag_erkennung UNION SELECT betrag_bis FROM vertrag_erkennung"),
      // Was jemand besitzt und was es kostet.
      ...frage("SELECT DISTINCT wiederbeschaffung FROM inventargegenstand"),
      ...frage("SELECT gesamtwert FROM depotwert"),
      ...frage("SELECT wert FROM depotposition"),
      ...frage("SELECT DISTINCT einstand_kurs FROM depotposition"),
    ],
    SPARSAM,
  );

  // Die dichte Gruppe: einzelne Buchungen, ihre Aufteilungen und die Importzeilen daneben
  // (die tragen dieselben Beträge und zusätzlich die verworfenen, die nie eine Buchung
  // wurden).
  betraege(
    [
      ...frage("SELECT DISTINCT betrag FROM ist_buchung"),
      ...frage("SELECT DISTINCT betrag FROM ist_buchung_aufteilung"),
      ...frage("SELECT DISTINCT betrag FROM umsatz_roh"),
    ],
    DICHT,
  );

  // Die Importzeilen liegen seit dem Umbau in `umsatz_roh`. Der Name wird ERMITTELT und
  // nicht angenommen: eine ältere Datenbank wandert erst beim nächsten App-Start mit.
  const umsatzTabelle =
    frage("SELECT name FROM sqlite_master WHERE type='table' AND name='umsatz_roh'").length > 0
      ? "umsatz_roh"
      : "umsatz";

  // Empfänger, Anbieter, Kennungen — und alles, was jemand SELBST benannt hat.
  for (const roh of [
    ...frage(`SELECT DISTINCT gegenpartei FROM ${umsatzTabelle} WHERE length(gegenpartei) >= 6`),
    ...frage("SELECT DISTINCT anbieter FROM vertrag WHERE length(anbieter) >= 6"),
    ...frage(`SELECT DISTINCT glaeubiger_id FROM ${umsatzTabelle} WHERE glaeubiger_id IS NOT NULL`),
    ...frage(`SELECT DISTINCT mandatsreferenz FROM ${umsatzTabelle} WHERE length(mandatsreferenz) >= 8`),
    ...frage(`SELECT DISTINCT endempfaenger FROM ${umsatzTabelle} WHERE length(endempfaenger) >= 6`),
    ...frage("SELECT DISTINCT bezeichnung FROM zahlungskonto"),
    ...frage("SELECT DISTINCT bezeichnung FROM zahlungsregel"),
    ...frage("SELECT DISTINCT bezeichnung FROM inventargegenstand"),
    ...frage("SELECT DISTINCT bezeichnung FROM depot"),
    ...frage("SELECT DISTINCT name FROM depotposition"),
    // Und die Einstellungen, weil eine davon eine LISTE VON HÄNDLERNAMEN hält: welche
    // Vertragsvorschläge weggeklickt wurden. Sie steht als JSON in einer Textspalte und
    // war deshalb keiner Abfrage aufgefallen — ein blinder Fleck, den kein Muster findet.
    ...frage("SELECT wert FROM einstellung").flatMap(jsonStrings),
    // Was die Erkennung sich gemerkt hat: der Schlüssel einer Vertragsregel ist ein
    // Ausschnitt aus einem echten Empfänger oder Verwendungszweck.
    ...frage("SELECT DISTINCT schluessel FROM vertrag_erkennung WHERE length(schluessel) >= 6"),
    // Eine Vertragsnummer ist eine Kundennummer.
    ...frage("SELECT DISTINCT vertragsnummer FROM vertrag WHERE length(vertragsnummer) >= 5"),
    // Der Dateiname eines Imports trägt oft einen Namen („auszug_musterfrau.csv").
    ...frage("SELECT DISTINCT dateiname FROM import_lauf WHERE length(dateiname) >= 6"),
    // Was im Depot liegt — die Kennung benennt zwar ein Papier und keine Person, aber
    // WELCHE Papiere jemand hält, ist genauso wenig öffentlich wie sein Kontostand.
    ...frage("SELECT DISTINCT kennung FROM depotposition WHERE length(kennung) >= 6"),
    // Kennungen aus der Importzeile. Sie sehen nach Technik aus und sind trotzdem
    // eindeutig: an genau dieser Kette ist einmal etwas durchgerutscht — ein Beispiel aus
    // einem echten Mitschnitt, das jahrelang in einem Kommentar stand.
    ...frage("SELECT DISTINCT e2e_referenz FROM umsatz_roh WHERE length(e2e_referenz) >= 8"),
    ...frage("SELECT DISTINCT bank_referenz FROM umsatz_roh WHERE length(bank_referenz) >= 8"),
  ]) {
    const wert = String(roh ?? "").trim();
    if (wert.length < 6 || ALLERWELT.has(wert)) continue;
    // Namen echter Banken stehen ohnehin in der öffentlichen DK-Liste im Repo — auch als
    // Bestandteil („Sparkasse" steckt in „Sparkasse Essen").
    if ([...bankNamen].some((n) => n.includes(wert))) continue;
    werte.add(wert);
  }

  // Der Verwendungszweck — der ausführlichste Text, den die Bank liefert, und deshalb der
  // gefährlichste. Erst ab 15 Zeichen NACH dem Beschneiden: die Bank füllt die Felder mit
  // Leerzeichen auf, und ein Wort wie „Kartenzahlung" bliebe sonst als Suchbegriff übrig
  // und träfe jeden Import-Test. Ein ganzer Zweck dagegen steht nirgends zufällig.
  for (const roh of frage(
    "SELECT DISTINCT verwendungszweck FROM umsatz_roh WHERE length(verwendungszweck) >= 15",
  )) {
    const wert = String(roh ?? "").trim();
    if (wert.length >= 15 && !ALLERWELT.has(wert)) werte.add(wert);
  }

  // Zeichenketten: alles, was eine Person oder ein Konto benennt.
  for (const roh of [
    ...frage("SELECT iban FROM zahlungskonto WHERE iban IS NOT NULL AND iban <> ''"),
    // Die IBAN der GEGENPARTEI stand bis 2026-08-24 in keiner Abfrage — geprüft war nur
    // die eigene. Dabei benennt sie ein Konto genauso, nur eben ein fremdes.
    ...frage("SELECT DISTINCT gegenpartei_iban FROM umsatz_roh WHERE length(gegenpartei_iban) >= 15"),
    ...frage("SELECT name FROM person"),
    ...frage("SELECT bezeichnung FROM bankzugang"),
    ...frage("SELECT blz FROM bankzugang"),
    ...frage("SELECT benutzer FROM bankzugang"),
  ]) {
    const wert = String(roh ?? "").trim();
    // Zu kurze Werte („EUR", ein Vorname mit drei Buchstaben) träfen überall.
    if (wert.length >= 5) werte.add(wert);
  }

  if (werte.size === 0) {
    throw new Error(
      "Aus der Datenbank kam kein einziges Merkmal — entweder ist sie leer, oder die " +
        "Abfragen passen nicht mehr zum Schema. Es wurde nichts geprüft.",
    );
  }
  return [...werte];
}

// Als Kommando: ein Merkmal je Zeile. Der `pre-push`-Hook liest das ein.
if (process.argv[1] && process.argv[1].endsWith("bestandsmerkmale.mjs")) {
  const raus = bestandsmerkmale();
  if (raus.length > 0) process.stdout.write(raus.join("\n") + "\n");
}
