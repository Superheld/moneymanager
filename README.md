# Moneymanager

Eine **lokale** Finanzverwaltungs-App, die das Denken des betrieblichen Rechnungswesens
(Liquiditätsrechnung, Rücklagen, Abschreibungen, Bilanz) auf Privathaushalte überträgt —
in einer Sprache, die normale Menschen verstehen. Die App ist *heimlich eine private Bilanz
plus Finanzplan*. Sie unterscheidet konsequent:

- **Plan vs. Ist** — wie verhält sich mein Jahr voraussichtlich, nicht nur die Rückschau.
- **Ausgabe vs. Vermögensumschichtung** — ein ETF-Sparplan ist keine „Ausgabe".
- **Zweckbindung vs. Liquidität** — eine Rücklage „liegt" nicht auf einem Konto, sie ist davon *gedeckt*.

**Lokal first:** Alle Daten bleiben auf dem Gerät, keine Cloud-Pflicht. Funktioniert ohne KI —
der Kern (Projektion, Töpfe, Liquidität) ist reine Arithmetik.

## Status — v0.3.0 (Plan-only)

Die komplette **Planungsseite** ist gebaut und unit-getestet:

| Phase | Inhalt | Status |
|---|---|---|
| P0 | Walking Skeleton (Regel → Projektion → SQLite) | ✓ |
| P1 | Stammdaten (Personen, Konten, Kategorien) | ✓ |
| P2 | Verträge · Budgets · Inventar/Töpfe · Liquiditätsplaner · Szenario | ✓ |
| P3 | Ist-Schritt (Import, Verbuchung, Plan/Ist) — braucht das Buchungspackage | offen |
| P4 | Analysen + KI-Vorbereitung | offen |

Nutzbar: Verträge/Budgets/Töpfe fließen in eine 12-Monats-Projektion mit zwei Kurven
(Kontosaldo + freie Liquidität); Überplanung wird sichtbar; What-if per Szenario.

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
npm test              # Unit-Tests (Core)
npm run typecheck     # TypeScript prüfen
npm run tauri build   # Produktion bauen
```

## Sprache

Fachlich streng innen, alltagstauglich außen. Das Datenmodell nutzt präzise
Rechnungswesen-Begriffe, die UI übersetzt sie über ein verbindliches Glossar
(Rücklage → *Spartopf*, Rückstellung → *Puffer*, Liquidität → *Verfügbares Geld* …).
Deutsch, Anrede „du", keine Emoji.

## Lizenz

[MIT](LICENSE) — frei nutzbar, veränderbar und weiterverteilbar. Beiträge willkommen.
