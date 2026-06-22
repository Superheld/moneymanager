# Moneymanager — App

Die Tauri-Anwendung (Desktop) von Moneymanager: React + TypeScript im Webview, dünne
Rust-Hülle, SQLite lokal. Der portable, hexagonale TS-Domänenkern liegt unter `src/`.

> Projektüberblick, Architektur und Status: siehe [`../README.md`](../README.md),
> [`../ARCHITEKTUR.md`](../ARCHITEKTUR.md) und [`../CHANGELOG.md`](../CHANGELOG.md).
> Befehle **immer aus diesem `app/`-Verzeichnis** ausführen (hier liegt `node_modules`).

## Befehle

```bash
npm install
npm run tauri dev   # Desktop-Fenster (mit SQLite-Plugin)
npm run dev         # nur Frontend im Browser (ohne SQLite-Plugin)
npm test            # Vitest (Core, Use-Cases, Migrationskette via sql.js)
npm run typecheck   # TypeScript prüfen
npm run coverage    # Tests + Coverage
npm run tauri build # Produktions-Build
```

## Struktur

```
src/
  core/         reine Domäne (Geld, Projektion, Töpfe, Historie …) — kein IO, unit-getestet
  application/  Use-Cases + Ports; import/ = Quellen-Port, Umsatz, Dedup, Remapping
  adapters/
    persistence/  SQLite (tauri-plugin-sql) + versionierte Migrationskette
    import/       Quellen-Adapter (Finanzguru-CSV; weitere andockbar)
    ui/           React-Screens + Design-System (ds/)
  i18n/         Sprachressourcen (de/en)
src-tauri/      Rust-Hülle (Tauri-Konfiguration, Bundle)
```

## Konventionen (Kurzfassung)

- **Geld = Integer (Minor Units)**, nie Float; Formatierung über die `geld`-Helfer (U+2212-Minus).
- **Schichtenregel:** `core` ← `application` ← `adapters`; `core` importiert nichts nach außen.
- **Migrationen** sind versioniert, forward-only, append-only — bestehende Versionen nie ändern.
- Tests als `*.test.ts` neben dem Code.
