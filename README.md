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

## Status — v0.9.0 (Topf-Entnahme als Buchungssatz + Plan/Ist)

Die komplette **Planungsseite** ist gebaut und unit-getestet; dazu der **Ist-Schritt „light"**
(ADR-0002): geplante Posten als bezahlt abhaken, realer Kontostand, Plan/Ist je Posten, ein
**Konto-Register** (gebuchte + voraussichtliche Buchungen je Konto, manuelle Buchungen) und
**Umbuchen** zwischen Konten (verknüpfte Doppelbuchung, Charakter Umschichtung). Neu (ADR-0003):
**Töpfe und Inventar** zeigen den **realen Stand** und erlauben echte **Entnahmen** (Charakter
aus dem Topf-Typ abgeleitet, Ersatz-Zyklus startet bei „ersetzt" neu); **Budgets** zeigen
Plan/Ist (verbraucht/Rest) — Zuordnung über das benannte Gegenkonto, nicht über die Kategorie.

| Phase | Inhalt | Status |
|---|---|---|
| P0 | Walking Skeleton (Regel → Projektion → SQLite) | ✓ |
| P1 | Stammdaten (Personen, Konten, Kategorien) | ✓ |
| P2 | Verträge · Budgets · Inventar/Töpfe · Liquiditätsplaner · Szenario | ✓ |
| P3 | Ist light — „bezahlt markieren", Ledger-Port, Reconciliation light, Konto-Register (ADR-0002) | ✓ |
| P3.1 | Topf-Entnahme als Buchungssatz, realer Topf-Stand, Budget Plan/Ist (ADR-0003) | ✓ |
| P3.5 | Bankimport (zweite Quelle hinter dem Ledger-Port) + Auto-Matching | offen |
| P4 | Weitere Analysen + KI-Vorbereitung | offen |

Nutzbar: Verträge/Budgets/Töpfe fließen in eine 12-Monats-Projektion mit zwei Kurven
(Kontosaldo + freie Liquidität); Überplanung wird sichtbar; What-if per Szenario. Geplante
Zahlungen lassen sich als bezahlt abhaken — sie fallen aus der Vorschau und bewegen den
realen Kontostand (Anfangsbestand + Σ Ist).

## Architektur

Tauri 2 + React + TypeScript, **hexagonaler, portabler TS-Domänenkern**, SQLite lokal.
Details: [`ARCHITEKTUR.md`](ARCHITEKTUR.md).

```
Moneymanager/    DDD-Dokumentation (Strategie → Lieferung) — Fachwahrheit
design-system/   Design-System (Tokens, Komponenten, Glossar)
app/             die Anwendung (Tauri + React + TS)
  src/core/         reine Domäne (Projektion, Töpfe, Kündigung …), unit-getestet
  src/application/  Use-Cases + Ports
  src/adapters/     SQLite-Persistenz + React-UI (Design-System)
  src-tauri/        dünne Rust-Hülle
```

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
