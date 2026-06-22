# Moneymanager

[![CI](https://github.com/Superheld/moneymanager/actions/workflows/ci.yml/badge.svg)](https://github.com/Superheld/moneymanager/actions/workflows/ci.yml)

Eine **lokale** Finanzverwaltungs-App, die das Denken des betrieblichen Rechnungswesens
(Liquiditätsrechnung, Rücklagen, Abschreibungen, Bilanz) auf Privathaushalte überträgt —
in einer Sprache, die normale Menschen verstehen. Die App ist *heimlich eine private Bilanz
plus Finanzplan*. Sie unterscheidet konsequent:

- **Plan vs. Ist** — wie verhält sich mein Jahr voraussichtlich, nicht nur die Rückschau.
- **Ausgabe vs. Vermögensumschichtung** — ein ETF-Sparplan ist keine „Ausgabe".
- **Zweckbindung vs. Liquidität** — eine Rücklage „liegt" nicht auf einem Konto, sie ist davon *gedeckt*.

**Lokal first:** Alle Daten bleiben auf dem Gerät, keine Cloud-Pflicht. Funktioniert ohne KI —
der Kern (Projektion, Töpfe, Liquidität) ist reine Arithmetik.

## Status — v0.10.0 (Import, Historie & Auswertungen)

Auf der kompletten **Planungsseite** und dem **Ist-Schritt „light"** (ADR-0002/0003)
aufbauend, kamen drei große Bausteine dazu — Details im [CHANGELOG](CHANGELOG.md):

- **Import (Finanzguru-CSV).** Modulare Quellen-Naht (weitere Formate/Apps andockbar),
  Konto-Zuordnung mit Auto-Anlegen, Dedup (native ID + Roh-Hash), Kategorie-Vorschläge per
  Remapping, Umbuchungs-Erkennung. Reversibler **Entwurfs-Stapel** → **Review-Inbox**
  (prüfen, kategorisieren, Volltextsuche) → **Verbuchen** ins Ledger.
- **Historie (Rückblick).** Echte Monatsflüsse + realer Saldo-Verlauf über die Zeit; Klick
  auf einen Monat → Kategorie-Aufschlüsselung; Klick auf eine Kategorie → Einzelbuchungen.
- **Konten.** Ist-Buchungen **bearbeiten & entfernen** (auch importierte; Löschen setzt den
  Umsatz zurück in die Inbox).
- **Listen & Tabellen.** Spalten-Sortierung, Pagination und **Übersichtszahlen (KPIs)** auf
  Inventar, Verträgen, Budgets und Töpfen.

| Phase | Inhalt | Status |
|---|---|---|
| P0 | Walking Skeleton (Regel → Projektion → SQLite) | ✓ |
| P1 | Stammdaten (Personen, Konten, Kategorien) | ✓ |
| P2 | Verträge · Budgets · Inventar/Töpfe · Liquiditätsplaner · Szenario | ✓ |
| P3 | Ist light — „bezahlt markieren", Ledger-Port, Reconciliation light, Konto-Register (ADR-0002) | ✓ |
| P3.1 | Topf-Entnahme als Buchungssatz, realer Topf-Stand, Budget Plan/Ist (ADR-0003) | ✓ |
| P3.5 | Bankimport (Finanzguru-CSV, modulare Quellen-Naht) → Inbox → Verbuchen | ✓ |
| P3.6 | Historie/Auswertungen, Buchungen bearbeiten, Tabellen-Komfort | ✓ |
| P4 | Plan/Ist-Auto-Matching · weitere Quellen (CAMT/FinTS) · KI-Vorbereitung | offen |

Nutzbar: Verträge/Budgets/Töpfe fließen in eine 12-Monats-Projektion mit zwei Kurven
(Kontosaldo + freie Liquidität); Überplanung wird sichtbar; What-if per Szenario. Geplante
Zahlungen lassen sich als bezahlt abhaken; Kontoauszüge importieren, prüfen und verbuchen;
die Historie zeigt, wie es tatsächlich lief.

## Architektur

Tauri 2 + React + TypeScript, **hexagonaler, portabler TS-Domänenkern**, SQLite lokal.
Details: [`ARCHITEKTUR.md`](ARCHITEKTUR.md).

```
Moneymanager/    DDD-Dokumentation (Strategie → Lieferung) — Fachwahrheit
design-system/   Design-System (Tokens, Komponenten, Glossar)
app/             die Anwendung (Tauri + React + TS)
  src/core/         reine Domäne (Projektion, Töpfe, Kündigung, Historie …), unit-getestet
  src/application/  Use-Cases + Ports
    import/           Import-Kontext: Quellen-Port, Umsatz-Aggregat, Dedup, Remapping
  src/adapters/     Außenwelt hinter den Ports
    persistence/      SQLite (tauri-plugin-sql) + versionierte Migrationskette
    import/           Quellen-Adapter (Finanzguru-CSV; weitere andockbar)
    ui/               React-UI (Design-System)
  src-tauri/        dünne Rust-Hülle
```

Der **Import** sitzt hinter einem Quellen-Port (`Quellenadapter`): ein neues Format/eine
neue App ist ein eigenes Adapter-Objekt, das sich registriert — ohne Bestandscode zu ändern.
Importierte Umsätze leben als reversibler Entwurfs-Stapel, bis sie über den Ledger-Port
verbucht werden.

## Entwicklung

Voraussetzungen: Node, Rust-Toolchain (Tauri-Build), npm.

```bash
cd app
npm install
npm run tauri dev     # Desktop-App starten
npm test              # Unit-Tests
npm run coverage      # Tests + Coverage-Report
npm run typecheck     # TypeScript prüfen
npm run tauri build   # Produktion bauen
```

## Qualität

Getestet wird **von innen nach außen** (hexagonal): der Domänenkern und die Use-Cases
sind unit-getestet, die SQLite-**Migrationskette** läuft gegen ein In-Memory-SQLite
(sql.js, ohne Tauri-Runtime) — inklusive der Dedup-Garantie des Ist-Journals. **CI**
(GitHub Actions) erzwingt bei jedem Push/PR Typecheck, Tests und Frontend-Build.

Noch offen (bewusst): Komponenten-Tests (React/Testing-Library) und E2E. Die SQLite-
*Adapter* (CRUD-SQL) sind über die getestete Migrationskette abgesichert, aber nicht
einzeln verprobt.

## Sprache

Fachlich streng innen, alltagstauglich außen. Das Datenmodell nutzt präzise
Rechnungswesen-Begriffe, die UI übersetzt sie über ein verbindliches Glossar
(Rücklage → *Spartopf*, Rückstellung → *Puffer*, Liquidität → *Verfügbares Geld* …).
Deutsch, Anrede „du", keine Emoji.

## Lizenz

[MIT](LICENSE) — frei nutzbar, veränderbar und weiterverteilbar. Beiträge willkommen.
