# Moneymanager

[![CI](https://github.com/Superheld/moneymanager/actions/workflows/ci.yml/badge.svg)](https://github.com/Superheld/moneymanager/actions/workflows/ci.yml)

Eine **lokale** Finanzverwaltungs-App, die das Denken des betrieblichen Rechnungswesens auf
einen Privathaushalt überträgt — Liquiditätsrechnung, Rücklagen, Abschreibungen, Bilanz —,
aber in einer Sprache, die man nicht nachschlagen muss. Sie ist *heimlich eine private
Bilanz plus Finanzplan*.

Drei Unterscheidungen, die ein Haushaltsbuch üblicherweise nicht macht:

- **Plan vs. Ist** — was vorgesehen war und was tatsächlich gebucht wurde, nebeneinander
  statt vermischt.
- **Ausgabe vs. Vermögensumschichtung** — ein ETF-Sparplan ist keine „Ausgabe". Das Geld
  ist noch da, es liegt nur woanders.
- **Zweckbindung vs. Liquidität** — eine Rücklage *liegt* nicht auf einem Konto, sie ist
  davon **gedeckt**. Dasselbe Guthaben kann für zwei Dinge vorgesehen und trotzdem nur
  einmal vorhanden sein.

Alle Daten bleiben auf dem Gerät: keine Cloud, kein Benutzerkonto, keine Registrierung. Und
sie funktioniert ohne KI — der rechnende Kern ist Arithmetik, die automatische
Kategorisierung ist Komfort obendrauf.

> **Alpha.** Es gibt genau einen Datenbestand, an dem entwickelt wird. Das Schema darf sich
> noch ohne Rücksicht ändern, Migrationen dürfen auch wegnehmen. Dieses Repo ist offen, weil
> der Weg dorthin interessanter ist als das Ziel — es ist keine Empfehlung, deine Finanzen
> darin zu führen.

## Nichts davon ist verifiziert

Es gibt Releases mit fertigen Paketen für macOS, Linux und Windows. Bevor du eines
herunterlädst, gehört das hier auf den Tisch — nicht als Kleingedrucktes, sondern weil es
bei einer **Finanz**-App der Punkt ist, an dem man hinsehen sollte.

**Keines der Pakete ist von einem Dritten geprüft oder beglaubigt.** Konkret heisst das je
nach System etwas anderes:

| | was passiert | warum |
|---|---|---|
| **macOS** | meldet die App als „beschädigt" | kein Apple-Developer-Zertifikat, keine Notarisierung |
| **Windows** | SmartScreen meldet einen unbekannten Herausgeber | kein Authenticode-Zertifikat |
| **Linux** | nichts | dort erwartet niemand eine Signatur |

Die App ist in keinem der Fälle beschädigt — sie ist unbeglaubigt, und das Betriebssystem
kann beides nicht unterscheiden. Wie man sie trotzdem startet, steht im jeweiligen
Release-Text. **Ob man das tun will, ist eine eigene Frage**, und die Antwort hängt nicht am
Zertifikat, sondern daran, ob du dem Quelltext hier traust: er liegt vollständig offen, und
der Build läuft in einem öffentlichen Workflow, dessen Lauf du nachlesen kannst.

**Eine Signatur gibt es doch, und sie leistet etwas anderes, als man denkt.** Jedes Update
ist mit einem minisign-Schlüssel signiert, und die installierte App weist ein Update ab, das
nicht dazu passt. Das verhindert, dass jemand *anderes* dir ein Update unterschiebt — es
sagt nichts darüber, ob dieses Update gut ist. Herkunft, nicht Güte.

**Und eine Sache, die man einem Finanz-Download nicht ansieht:** der Bankabruf spricht unter
einer Produktregistrierung der Deutschen Kreditwirtschaft, die auf dieses Projekt läuft. Wer
ein Release benutzt, redet mit seiner Bank also unter unserem Namen. Ein Fork hat diese
Nummer nicht — sein Build läuft ohne, und der Abruf bleibt dort gesperrt, bis er sich selbst
registriert.

**Was nicht drin ist:** keine Zugangsdaten, keine Kontodaten, kein Datenbestand. Die
Datenbank liegt im Datenverzeichnis der App, nicht im Paket.

## Was sie kann

Der jeweils aktuelle Stand steht im [CHANGELOG](CHANGELOG.md); grob umrissen:

- **Buchungen kommen selbst herein.** FinTS-Abruf direkt bei der Bank (PIN/TAN) oder Import
  aus einer Datei. Wiedererkannte Zeilen erzeugen keine zweite Buchung, sondern ergänzen die
  vorhandene.
- **Und kategorisieren sich weitgehend selbst.** Eine Kette entscheidet von „festgelegt" zu
  „geraten": Umbuchung → Festlegung → Vertrag → Modell → Import-Kategorie. Jede Entscheidung
  ist am Beleg aufklappbar: woran lag es.
- **Verträge und Budgets.** Wiederkehrendes mit eigener Erkennungsregel und Live-Vorschau;
  Budgets in zwei Arten — monatlich (Rest verfällt) oder aufbauend (Rest bleibt liegen) —
  und verschachtelbar.
- **Stimmt der Kontostand?** Die App vergleicht ihren gerechneten Stand gegen das, was die
  Bank meldet oder was jemand gezählt hat. Ohne Toleranz: ein Cent Abweichung ist eine
  fehlende Buchung, kein Rundungsfehler. Aus mehreren solcher Beobachtungen fällt heraus, in
  welchem *Zeitraum* etwas verlorenging.
- **Monatsausblick.** Laufender Monat und die beiden folgenden als Aufrechnung:
  Einnahmen − Verträge − Budgets − Rücklagen = bleibt.
- **Rückblick.** Monatsflüsse, Saldo-Verlauf, Kategorie-Aufschlüsselung bis hinunter zur
  Einzelbuchung, die sich von dort auch gleich korrigieren lässt.
- **Inventar.** Wiederbeschaffungswert ÷ Nutzungsdauer ergibt die monatliche Rücklage —
  Abschreibung, nur eben von vorn gedacht.

**Zurückgestellt:** Die frühere Planungsseite (12-Monats-Liquiditätskurve, Szenarien,
Deckungsgrad) ist entfallen. Sie versprach eine Genauigkeit, die das Modell dahinter nicht
hielt; die Vorausschau kommt wieder, dann anders geschnitten.

## Wie sie gebaut ist

Tauri 2 + React + TypeScript, hexagonaler portabler TS-Domänenkern, SQLite lokal. Die
Schichtenregeln und ihre Begründungen stehen ausführlich in [CLAUDE.md](CLAUDE.md).

```
src/core/         reine Domäne — kein IO, kein React, keine Uhr
src/application/  Use-Cases + Ports; die UI redet nur hiermit
src/adapters/     persistence (SQLite) · import · ui (React)
src-tauri/        dünne Rust-Hülle; die Logik läuft als TS in der Webview
```

Ein paar Entscheidungen, die das Ding prägen:

- **Geld ist Integer Cent, nie Float** — und wird nur an einer Stelle formatiert. Ein
  eigenes `toFixed` irgendwo im Screen ist der Anfang zweier Wahrheiten über denselben
  Betrag.
- **Kontostands-Anker sind Beobachtungen, keine Rechenergebnisse.** Ein Anker sagt: an
  diesem Stichtag lag dieser Betrag auf dem Konto. Er wird nie neu berechnet, auch nicht,
  wenn jemand später eine Buchung davor einfügt — was sich ändert, ist die Differenz, und
  genau die will man sehen.
- **Das Kategorie-Modell ist linear** (multinomiale logistische Regression über
  Bag-of-Words) — nicht, weil mehr nicht ginge, sondern damit die *Begründung das Modell
  ist*: jede Entscheidung zerfällt ohne Näherung in „woran lag es". Rund 89 % Trefferquote
  am eigenen Bestand, gemessen über fünf Aufteilungen an zurückgehaltenen Zahlungen.
- **Der Dublettenfinder ist bewusst kein Modell.** Die Frage ist Identität, nicht
  Ähnlichkeit, und bei einer Fehlentscheidung muss der Grund lesbar sein. Also harte
  Vorbedingungen plus ein Punktesystem, das im Klartext sagt, warum es zwei Zeilen für
  dieselbe hält.
- **Die Schichtgrenze ist ausführbar.** `src/architektur.test.ts` prüft in der CI, dass
  `core` nichts nach außen importiert und die UI weder `core/` noch die Persistenz anfasst.
  Die Ausnahmeliste ist leer — und ein eigener Test schlägt fehl, sobald ein Eintrag darin
  nichts mehr verletzt, damit sie nicht verrottet.
- **Zwei Wächter halten echte Kontodaten aus dem öffentlichen Repo.** Ein Test liest die
  lokale Datenbank zur Laufzeit und prüft den Arbeitsbaum dagegen; ein pre-push-Hook prüft
  dasselbe für Commit-Texte. Beide brechen ab, wenn sie nichts sehen können — ein Wächter,
  der nichts prüft, ist schlimmer als keiner, weil er beruhigt.

## Entwicklung

Voraussetzungen: Node 26 (steht in der `mise.toml` — `mise install` genügt), npm,
Rust-Toolchain für den Tauri-Build.

```bash
npm install
npm run tauri dev     # Desktop-App starten
npm test              # Tests
npm run coverage      # Tests + Coverage-Report
npm run typecheck     # TypeScript prüfen
npm run tauri build   # Produktion bauen
```

## Qualität

Getestet wird von innen nach außen: Domänenkern und Use-Cases als reine Unit-Tests,
Repositories und UI als Integration gegen ein In-Memory-SQLite (sql.js) — dieselbe
SQL-Engine wie in der App, nur ohne Attrappen dazwischen. Ein falsches Spalten-Mapping fällt
damit genauso auf wie eine kaputte Anzeige. Der Domänenkern ist dabei am dichtesten
abgedeckt — dort sitzt die Rechnung, die still danebengehen kann. Die CI erzwingt bei jedem
Push und für Pull Requests Typecheck, Tests und Frontend-Build; `npm run coverage` zeigt den
aktuellen Stand.

Bewusst offen: End-to-End-Tests gegen die gebaute Desktop-App — `tauri-driver` gibt es für
macOS nicht, WKWebView bietet keinen WebDriver. Ersatzweise laufen die jsdom-Tests von der
Oberfläche bis ins Schema, und App-Code-Pfade lassen sich headless gegen eine Lesekopie der
echten Datenbank fahren.

## Sprache

Fachlich streng innen, alltagstauglich außen. Das Datenmodell benutzt die präzisen
Rechnungswesen-Begriffe, die Oberfläche übersetzt sie über ein verbindliches Glossar
(Rücklage → *Spartopf*, Rückstellung → *Puffer*, Liquidität → *Verfügbares Geld*). Die App
spricht Deutsch und Englisch; die Codebasis und die Doku sind durchgehend deutsch.

## Lizenz

[MIT](LICENSE). Issues und Fragen gern — für Pull Requests ist das Projekt zu früh: es hat
einen einzigen Datenbestand, und das Schema bewegt sich noch unter dem laufenden Betrieb.
