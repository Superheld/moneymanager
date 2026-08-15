# Moneymanager — Domänen-Dokumentation (Einstieg)

> **DDD-Ebene:** Navigation — Einstiegspunkt · **Status:** lebend · **Stand:** 2026-07-19 · **Bezüge:** alle
> Hier anfangen. **Redesign 2026-07-19:** Das Modell wurde strategisch neu aufgesetzt —
> Core ist jetzt die **autonome Haushaltsführung** (die KI führt die Bücher, der Nutzer
> führt Aufsicht). Das Modell v1 (Rechnungswesen/Doppik-Unterbau) liegt vollständig im Archiv.

## Verzeichnisbaum

```
README.md                              ← du bist hier (Einstieg)
10-strategie/                          was & warum
   DOMAENE.md                          Domänenmodell (Redesign 2026-07-19) — das lebende Strategiedokument
20-taktik/                             (leer — wird nach dem Kontextschnitt neu befüllt)
30-entscheidungen/                     ADR-Serie (Historie bleibt stehen)
   ADR-0001-plattform.md               Tauri/React/TS — durch Deployment-Frage in DOMAENE §8 zu prüfen
   ADR-0002-ist-schritt-light.md       SUPERSEDED (Doppik/Ledger-Port)
   ADR-0003-buchungssatz-zuordnung.md  SUPERSEDED (Doppik)
   ADR-0004-internationalisierung-waehrung.md  gültig
40-referenz/                           Grundlagen & Verträge
   BANKDATEN-PARSER-VORSCHLAG.md       Import-Referenz (Generic-Subdomäne, weiter relevant)
50-lieferung/                          was & wann
   ROADMAP.md                          Now/Next/Later — Stories S-1…S-6 (lebend)
90-archiv/                             Herleitung & überholte Stände
   BEOBACHTUNGEN.md                    Logbuch der Entscheidungen A–D (Modell v1)
   2026-06-modell-v1/                  komplettes Modell v1: KONZEPT, DOMAENENDESIGN,
                                       UBIQUITOUS-LANGUAGE, TAKTIK-*, SPEC-MVP, ROADMAP,
                                       BAUPLAN-MVP, RECHNUNGSWESEN-BEZUG,
                                       BUCHUNGSPACKAGE-ANFORDERUNGEN, KI-KONZEPT
```

## Empfohlene Lesereihenfolge (Neueinsteiger / Coding-Agent)

`10-strategie/DOMAENE.md` — das ist derzeit das einzige lebende Strategiedokument und
ohne Vorwissen lesbar. Danach bei Bedarf `30-entscheidungen/ADR-0001` (Plattform, unter
Vorbehalt) und `40-referenz/BANKDATEN-PARSER-VORSCHLAG` (Import).
Das Archiv (`90-archiv/`) nur bei Interesse an der Herleitung des Modells v1.

## Status auf einen Blick

- **Redesign 2026-07-19:** Zweck, Fachsprache (Entwurf), Invarianten, KI-Rollen,
  Autonomie-Beschluss (USP) und Core-Subdomäne stehen in `DOMAENE.md`.
- **Entschieden:** Core = Autonome Haushaltsführung · Doppik/summae bewusst draußen
  (kein Ledger-Unterbau; ADR-0002/0003 superseded) · FinTS + CSV/Excel-Import.
- **Nächster Schritt:** Lieferung läuft über `50-lieferung/ROADMAP.md` (S-1 … S-6).
  Strategisch offen: Sortierung bestätigen → **Bounded Contexts schneiden** →
  Context Map (`DOMAENE.md §9`).
- **Offen:** siehe `DOMAENE.md §8` — u. a. Grenze der KI-Autonomie (reversibel vs.
  irreversibel), Kontextstrategie fürs Sprachmodell, Deployment („lokal" präzisieren,
  betrifft ADR-0001).

## Konventionen

- **Verzeichnisse** nach DDD-Ebene nummeriert (`10-` strategisch … `90-` archiv).
- **Kopfzeile** je Doc: `DDD-Ebene · Status · Stand · Bezüge`.
- **Fachsprache** kanonisch derzeit in `DOMAENE.md §2` — bei Kontextschnitt wird sie
  je Bounded Context aufgeteilt.
- **Entscheidungen** als ADR-Serie (`ADR-NNNN-*.md`) in `30-entscheidungen/`; überholte
  ADRs werden markiert, nicht gelöscht.
- **Querverweise** nennen Dateien textuell (z. B. „siehe DOMAENE §5"), ohne Pfad.
- **Archiv:** überholte Modellstände wandern komplett nach `90-archiv/<stand>/` —
  es gibt immer nur *ein* lebendes Modell.
