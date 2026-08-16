# Moneymanager

[![CI](https://github.com/Superheld/moneymanager/actions/workflows/ci.yml/badge.svg)](https://github.com/Superheld/moneymanager/actions/workflows/ci.yml)

Eine **lokale** Finanzverwaltungs-App, die das Denken des betrieblichen Rechnungswesens
(Liquiditätsrechnung, Rücklagen, Abschreibungen, Bilanz) auf Privathaushalte überträgt —
in einer Sprache, die normale Menschen verstehen. Die App ist *heimlich eine private Bilanz
plus Finanzplan*. Sie unterscheidet konsequent:

- **Plan vs. Ist** — was der Plan sagt und was tatsächlich gebucht wurde, nebeneinander.
- **Ausgabe vs. Vermögensumschichtung** — ein ETF-Sparplan ist keine „Ausgabe".
- **Zweckbindung vs. Liquidität** — eine Rücklage „liegt" nicht auf einem Konto, sie ist davon *gedeckt*.

**Lokal first:** Alle Daten bleiben auf dem Gerät, keine Cloud-Pflicht. Funktioniert ohne KI —
der Kern (Aufrechnung, Töpfe, Rücklagen) ist reine Arithmetik.

> **Alpha.** Die App ist nicht veröffentlicht und wird an einem einzigen Datenbestand
> entwickelt. Das Schema darf sich noch ohne Rücksicht ändern — Migrationen dürfen auch
> wegnehmen. Wer sie ausprobiert, sollte damit rechnen.

## Status — v0.13.0 (Kategorien von selbst, Verträge greifen durch)

Details im [CHANGELOG](CHANGELOG.md):

- **Buchungen kategorisieren sich selbst.** Eine Kette entscheidet, von „festgelegt" zu
  „geraten": Umbuchung → Festlegung → Vertrag → Modell → Import-Kategorie. Das Modell ist
  eine multinomiale logistische Regression über Bag-of-Words — linear, damit die Begründung
  das Modell IST und jede Entscheidung ohne Näherung in „woran lag es" zerfällt. Am eigenen
  Bestand rund **89 % Trefferquote**, gemessen über fünf Aufteilungen an zurückgehaltenen
  Zahlungen.
- **Nachvollziehbar und steuerbar.** Vier Karten in den Einstellungen entlang des
  Trainingsablaufs: welche Beispiele taugen, welche Merkmalsquellen eingehen (einzeln
  abschaltbar, mit „Wirkung messen"), welche Wörter draußen bleiben, und was das Training
  ergab — inklusive Verwechslungsmatrix. Am einzelnen Beleg zeigt der Buchungsdialog, was
  die Erkennung dort sieht.
- **Festlegungen und rückwirkender Abgleich.** „Immer bei diesem Empfänger" für Aussagen,
  die halten sollen; und ein Lauf über den Bestand, der zuerst zeigt, was er ändern würde
  (nach Übergängen gebündelt), und erst auf Bestätigung schreibt. Handentscheidungen und
  aufgeteilte Buchungen bleiben unangetastet.
- **Verträge zeigen auf echte Buchungen.** Eigene Erkennungsregel je Vertrag (Merkmale mit
  Wildcards, Betragsspanne, Zeitraum, Konto), einsehbar und änderbar mit Live-Vorschau der
  Treffer. Die Zuordnung trägt ihre Herkunft: was die Automatik setzt, darf sie ändern; was
  von Hand kam, nie. Vertrag aus einer Buchung anlegen geht direkt aus dem Dialog.
- **Import (Finanzguru-xlsx).** Modulare Quellen-Naht (weitere Formate andockbar),
  Konto-Zuordnung mit Auto-Anlegen, Dedup (native ID + Roh-Hash). Reversibler
  **Entwurfs-Stapel** → **Review-Inbox** → **Verbuchen** ins Ledger; jede Zeile zeigt, woher
  ihr Kategorie-Vorschlag kommt. Interne Umbuchungen werden zu verknüpften Doppelbuchungen
  gepaart.
- **Monatsausblick.** Drei Karten oben in der Übersicht — laufender Monat und die beiden
  folgenden —, jede als Aufrechnung: Einnahmen − Verträge − Budgets − Rücklagen = bleibt.
- **Übersicht (Rückblick).** Monatsflüsse, realer Saldo-Verlauf, Kategorie-Aufschlüsselung
  wahlweise einzeln oder nach Hauptgruppen, bis hinunter zur Einzelbuchung — die sich von
  dort auch gleich korrigieren lässt.
- **Konten als Auszug.** Statement-Ansicht je Konto, Volltextsuche, Art-/Kategorie-Filter,
  Pagination; Buchungen bearbeiten, aufteilen und zu Umbuchungen paaren.
- **Inventar.** Wiederbeschaffung ÷ Nutzungsdauer ergibt die monatliche Rücklage; nennt man
  das Konto, auf dem das Geld liegt, wird die Rechnung gegen den echten Stand abgeglichen.

| Phase | Inhalt | Status |
|---|---|---|
| P0 | Walking Skeleton (Regel → Projektion → SQLite) | ✓ |
| P1 | Stammdaten (Personen, Konten, Kategorien) | ✓ |
| P2 | Verträge · Budgets · Inventar/Töpfe | ✓ |
| P3 | Ist light — „bezahlt markieren", Ledger-Port, Konto-Register (ADR-0002) | ✓ |
| P3.1 | Topf-Entnahme als Buchungssatz, realer Topf-Stand, Budget Plan/Ist (ADR-0003) | ✓ |
| P3.5 | Bankimport (Finanzguru-xlsx) → Inbox → Verbuchen; Umbuchungs-Paarung | ✓ |
| P3.6 | Historie/Auswertungen, Konto-Auszug, Buchungen bearbeiten, Tabellen-Komfort | ✓ |
| P3.7 | Monatsausblick, Vertrags- und Budgetvorschläge aus den Buchungen | ✓ |
| P3.8 | Vertrag ↔ Buchung verknüpft; automatische Kategorisierung mit Begründung | ✓ |
| P4 | Vorausschau neu gedacht · weitere Quellen (CAMT/FinTS) · Embeddings | offen |

Nutzbar: Kontoauszüge importieren, prüfen und verbuchen — und die Kategorien dabei weitgehend
der App überlassen; sehen, wie es tatsächlich lief; Verträge und Budgets aus den eigenen Daten
aufbauen; und Monat für Monat aufrechnen, was nach allen Verpflichtungen übrig bleibt.

**Zurückgestellt:** Die frühere Planungsseite (12-Monats-Liquiditätskurve, Szenarien,
Deckungsgrad) ist in 0.12.0 entfallen. Sie versprach eine Genauigkeit, die das Modell nicht
hielt; die Vorausschau kommt wieder, dann anders geschnitten.

## Architektur

Tauri 2 + React + TypeScript, **hexagonaler, portabler TS-Domänenkern**, SQLite lokal.

```
src/core/         reine Domäne (Aufrechnung, Töpfe, Kündigung, Historie …), unit-getestet
  klassifikator/    Merkmalsextraktion und lineares Modell der Kategorie-Erkennung
src/application/  Use-Cases + Ports
  import/           Import-Kontext: Quellen-Port, Umsatz-Aggregat, Dedup, Remapping
src/adapters/     Außenwelt hinter den Ports
  persistence/      SQLite (tauri-plugin-sql) + versionierte Migrationskette
  import/           Quellen-Adapter (Finanzguru-xlsx; weitere andockbar)
  ui/               React-UI
src/test/         Test-Harness (In-Memory-SQLite, Render-Helfer)
src-tauri/        dünne Rust-Hülle
```

Der **Import** sitzt hinter einem Quellen-Port (`Quellenadapter`): ein neues Format/eine
neue App ist ein eigenes Adapter-Objekt, das sich registriert — ohne Bestandscode zu ändern.
Importierte Umsätze leben als reversibler Entwurfs-Stapel, bis sie über den Ledger-Port
verbucht werden.

## Entwicklung

Voraussetzungen: Node 26 (steht in der `mise.toml` — `mise install` genügt), npm,
Rust-Toolchain für den Tauri-Build.

```bash
npm install
npm run tauri dev     # Desktop-App starten
npm test              # Unit-Tests
npm run coverage      # Tests + Coverage-Report
npm run typecheck     # TypeScript prüfen
npm run tauri build   # Produktion bauen
```

## Qualität

Getestet wird **von innen nach außen** (hexagonal): Domänenkern und Use-Cases als reine
Unit-Tests, Repositories und UI als Integration gegen ein In-Memory-SQLite (sql.js, ohne
Tauri-Runtime) — dieselbe SQL-Engine wie in der App, nur ohne Attrappen dazwischen. Ein
falsches Spalten-Mapping fällt damit genauso auf wie eine kaputte Anzeige.
**Abdeckung: rund 88 % Statements / 90 % Zeilen** über das gesamte Projekt (Ziel: 90 %).
**CI** (GitHub Actions) erzwingt bei jedem Push auf `main`/`develop` und für Pull Requests
Typecheck, Tests und Frontend-Build.

Noch offen (bewusst): End-to-End-Tests gegen die gebaute Desktop-App — `tauri-driver` gibt
es für macOS nicht. Ersatzweise lassen sich App-Code-Pfade headless gegen eine Lesekopie der
echten Datenbank fahren.

## Sprache

Fachlich streng innen, alltagstauglich außen. Das Datenmodell nutzt präzise
Rechnungswesen-Begriffe, die UI übersetzt sie über ein verbindliches Glossar
(Rücklage → *Spartopf*, Rückstellung → *Puffer*, Liquidität → *Verfügbares Geld* …).
Deutsch, Anrede „du", keine Emoji.

## Lizenz

[MIT](LICENSE) — frei nutzbar, veränderbar und weiterverteilbar. Beiträge willkommen.
