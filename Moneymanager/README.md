# Moneymanager — Domänen-Dokumentation (Einstieg)

> **DDD-Ebene:** Navigation — Einstiegspunkt · **Status:** lebend · **Stand:** 2026-06-13 · **Bezüge:** alle
> Hier anfangen. Die Verzeichnisse sind nach **kanonischer DDD-Ordnung** nummeriert —
> die Lesereihenfolge steht damit im Dateibaum: **Strategisch → Taktisch → Entscheidungen
> → Referenz → Lieferung → Archiv.**

## Verzeichnisbaum

```
README.md                              ← du bist hier (Einstieg)
10-strategie/                          was & warum
   KONZEPT.md                          Vision & Domänenüberblick
   DOMAENENDESIGN.md                   Subdomänen, Bounded Contexts, Context Map
   UBIQUITOUS-LANGUAGE.md              Sprache (kanonisch): Begriffe, UI-Wording
20-taktik/                             wie, je Bounded Context
   TAKTIK-PLANUNG.md                   Core
   TAKTIK-STAMMDATEN.md                Supporting
   TAKTIK-IMPORT.md                    Generic/Supporting
30-entscheidungen/                     ADR-Serie
   ADR-0001-plattform.md               lokale App, React/TS, Tauri, hexagonal
   ADR-0002-ist-schritt-light.md       Ist via „bezahlt markieren" über Ledger-Port (entblockt P3)
40-referenz/                           Grundlagen & Verträge
   RECHNUNGSWESEN-BEZUG.md             Begründung (HGB/KLR)
   BUCHUNGSPACKAGE-ANFORDERUNGEN.md    Upstream-Contract zum Ledger-Package
   KI-KONZEPT.md                       Querschnittsthema KI (optional, später)
50-lieferung/                          was bauen
   SPEC-MVP.md                         User Stories, Akzeptanzkriterien, Datenmodell
   ROADMAP.md                          Now/Next/Later
   BAUPLAN-MVP.md                      Walking Skeleton → MVP-Ausbau
90-archiv/                             Herleitung
   BEOBACHTUNGEN.md                    Logbuch der Entscheidungen A–D
```

## Empfohlene Lesereihenfolge (Neueinsteiger / Coding-Agent)

`10-strategie/KONZEPT` → `40-referenz/RECHNUNGSWESEN-BEZUG` →
`10-strategie/DOMAENENDESIGN` → `10-strategie/UBIQUITOUS-LANGUAGE` →
`20-taktik/*` → `50-lieferung/SPEC-MVP` → `30-entscheidungen/ADR-0001` →
`50-lieferung/BAUPLAN-MVP` → `50-lieferung/ROADMAP`.
(`90-archiv/BEOBACHTUNGEN` nur bei Interesse an der Herleitung.)

## Status auf einen Blick

- Strategisches Design ✓ · taktisches Design ✓ (Planung/Stammdaten/Import; Vorsorge = Stufe 2)
  · MVP-Spec ✓ · Plattform ✓ (**Tauri**, ADR-0001).
- **Nächster Schritt:** P0 — Walking Skeleton (`50-lieferung/BAUPLAN-MVP.md`).
- **Offen** (in `50-lieferung/ROADMAP` / `10-strategie/KONZEPT §8`): saisonale Glättung,
  Topf mit eigenem Konto, Nebenbuch-Option, UI-Wording final bestätigen.

## Konventionen

- **Verzeichnisse** nach DDD-Ebene nummeriert (`10-` strategisch … `90-` archiv) — die
  kanonische Reihenfolge ist im Baum sichtbar.
- **Kopfzeile** je Doc: `DDD-Ebene · Status · Stand · Bezüge`.
- **Sprache** kanonisch in `10-strategie/UBIQUITOUS-LANGUAGE.md` — dort zuerst pflegen.
- **Entscheidungen** als ADR-Serie (`ADR-NNNN-*.md`) in `30-entscheidungen/`.
- **Querverweise** nennen Dateien textuell (z. B. „siehe TAKTIK-PLANUNG §1"), ohne Pfad —
  sie bleiben über Verzeichnisgrenzen hinweg gültig.
