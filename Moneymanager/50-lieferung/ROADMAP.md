# Moneymanager — Roadmap

> **DDD-Ebene:** Lieferung — Roadmap (Now/Next/Later) · **Status:** lebend · **Stand:** 2026-08-15 · **Bezüge:** DOMAENE, ADR-0001, ADR-0004

> Format: Now / Next / Later · Team: Bruce + Claude
> Grundlage: `10-strategie/DOMAENE.md` (Redesign 2026-07-19). Die Vorgänger-Roadmap
> (Stand 2026-06-20, Modell v1) liegt unter `90-archiv/2026-06-modell-v1/ROADMAP.md`
> und ist überholt — sie baute auf Ledger-Port und Buchungspackage auf, beides gestrichen.

## Leitplanken

- **Reihenfolge schlägt Datum.** Solo-Projekt, keine Quartalsversprechen — nur eine
  verlässliche Sequenz.
- **Jede Scheibe ist lauffähig.** Kein Slice, der die App in einem halben Zustand lässt.
- **Der Kern wächst von der Autonomie her.** Was die KI entscheidet, wird dokumentiert,
  nicht freigegeben (DOMAENE §2, „Dokumentation statt Verifikation").
- **Modellwechsel wird nicht als Big Bang nachgezogen.** Der Code trägt noch Namen aus
  Modell v1 (`IstBuchung`); Umbenennung passiert als Nebenprodukt dort, wo Dateien
  ohnehin angefasst werden — kein eigener Refactor-Slice.

---

## Gebaut — Stand v0.11.0 (2026-06-22)

| Bereich | Inhalt |
|---|---|
| Stammdaten | Personen, Konten (Giro/Tagesgeld/Bargeld/Kreditkarte), Kategorien |
| Planung | Verträge, Budgets, Zahlungsregeln, Liquiditätsplaner, Szenario/Projektion |
| Vorsorge | Inventar, Töpfe (Puffer/Spartopf), Topf-Entnahme, Deckung |
| Ist | Buchung erfassen, bezahlt-markieren, Umbuchen, Konto-Auszug, Historie |
| Import | Finanzguru CSV/Excel, Konto-Match, Dedup via rohHash, Review-Inbox, Umbuchungs-Paarung |
| Quer | i18n (Sprache + Mehrwährung, locale-gekoppelt, ADR-0004) |

**Wichtige Lücke im Bestand:** `application/import/vorschlag.ts` klassifiziert nicht selbst —
es übernimmt Finanzguru's Kategorie-Hinweis und mappt ihn um. Eigenes Urteil über eine
Buchung fällt die App bisher nirgends.

---

## NOW — Buchungen zu Fachobjekten machen

Beides setzt an derselben UI-Naht an: der Konto-Auszug hat pro Zeile bereits eine
Aktion (`EditBuchungModal` in `KontenScreen.tsx`). Dort kommen die neuen Wege dazu.

### S-1 — Umbuchung aus einer bestehenden Buchung

*Als Nutzer möchte ich aus einer Buchung (z. B. Bargeldabhebung im Giro) eine Umbuchung
auf ein anderes eigenes Konto machen können.*

Zwei Fälle, die auseinandergehalten gehören:

- **S-1a — Gegenbein fehlt.** Auf dem Zielkonto (typisch: Bargeld, wird nicht importiert)
  existiert keine Buchung. Die bestehende Buchung wird zum Abgangs-Bein, das Zugangs-Bein
  wird erzeugt, beide teilen eine `transferId`, Charakter `Umschichtung`.
- **S-1b — beide Beine existieren.** Zwei importierte Buchungen werden nachträglich von
  Hand als Umbuchung gepaart. Automatisch passiert das beim Import bereits (v0.11.0);
  manuell gibt es den Weg noch nicht.

Bestand: `application/umbuchungErfassen.ts` erzeugt heute **zwei neue** Buchungen. S-1
braucht den Fall „eine existiert bereits" — also einen eigenen Use-Case, nicht nur einen
neuen Knopf. Die Netto-Null-Invariante über alle Konten gilt unverändert.

### S-2 — Vertrag aus einer bestehenden Buchung

*Als Nutzer möchte ich aus einer Buchung einen Vertrag erstellen, sodass künftig gleiche
Buchungen als Vertragsbuchung erkannt werden.*

Bestand: `application/vertragAnlegen.ts` schreibt Vertrag (Stammdaten) + abgeleitete
Zahlungsregel (Planung). Neu sind zwei Dinge:

1. **Einstieg aus der Buchung** — Anbieter, Betrag, Rhythmus aus der Buchung vorbelegen.
   Der Rhythmus lässt sich aus der Historie desselben Empfängers vorschlagen.
2. **Rückwirkung** — künftige Buchungen, die zum Vertrag passen, werden ihm zugeordnet.

Punkt 2 ist der eigentliche Gehalt: Das ist eine **Regel-/Lookup-Schicht** über
Gläubiger-ID bzw. Empfänger + Betrag + Periodizität. Genau die Schicht hat sich im
Classifier-Spike als der zuverlässigste Teil erwiesen (~100 %, deterministisch, weit über
dem, was ein Netz auf diesen Fällen schafft). S-2 baut damit die erste Etage von S-4 —
deshalb steht es davor.

---

## NEXT — Die App urteilt selbst

### S-3 — Entscheidungsjournal

*Jede Entscheidung, die die App selbst trifft, wird mit Begründung und Zeitpunkt
festgehalten; jede Nutzerkorrektur wird als Override daran gehängt.*

Append-only, eigene Tabelle, neue Migration — kein bestehendes Aggregat wird angefasst.
Erste Schreiber sind die Entscheidungen, die es heute schon gibt (Umbuchungs-Paarung beim
Import, Remapping-Vorschlag, Standardkategorien-Backfill), danach der Classifier.

Das Journal ist Voraussetzung für S-4, nicht Beiwerk: ohne es ist eine Nutzerkorrektur
nur eine überschriebene Kategorie und kein Trainingssignal (DOMAENE §2).

### S-4 — Kategorien-Classifier

*Die App ordnet Buchungen selbst einer Kategorie zu, statt fremdes Urteil zu übernehmen.*

Entschieden (2026-08-15, auf Basis des Spikes in `transaction-classifier/`):

- **Modellklasse: linear.** Empirisch belegt — MLP und tiefere Netze bringen nichts,
  der Deckel ist daten- und mehrdeutigkeitslimitiert, nicht modelllimitiert.
- **Merkmale: Hashing-BoW zuerst** (~85 %, zero-dep, portabel direkt in `core`, kein
  Modell-Download). Embeddings (~88 %, besser bei unbekannten Händlern) bleiben als
  späterer Austausch hinter derselben Schnittstelle offen.
- **Autonomie: Die KI legt sich immer fest.** Keine Konfidenzschwelle, die Arbeit an den
  Nutzer zurückgibt — Konfidenz und Begründung gehen ins Journal, der Nutzer korrigiert
  nach. Das ist die scharfe Lesart des Autonomie-Beschlusses (DOMAENE §8).

Schichtung aus dem Spike, in dieser Reihenfolge abgefragt:
Regel/Lookup (aus S-2) → Netz (Inhalt) → Kontextabhängiges bleibt Nutzerarbeit.

### S-5 — Korrekturschleife

Nutzerkorrekturen aus dem Journal fließen ins Training zurück. Offen: wann trainiert wird
(bei Import, nach N Korrekturen, on demand) und wo das Modell liegt. Wird mit S-4
konkretisiert, nicht davor.

---

## LATER

### S-6 — FinTS-Abruf Girokonto

*Als Nutzer möchte ich mein Girokonto direkt abrufen (FinTS-Zugang liegt vor).*

**Abhängigkeit, die die Story teuer macht, wenn man sie übersieht:** FinTS liefert keinen
Kategorie-Hinweis. Heute lebt die gesamte Kategorisierung von genau diesem Feld aus dem
Finanzguru-Export. Ohne S-4 landet nach dem Umstieg jeder abgerufene Umsatz unkategorisiert
in der Review-Inbox — die App würde durch den Direktabruf fachlich *schlechter*. Deshalb
steht S-6 hinter dem Classifier, obwohl der Zugang schon da ist.

Technisch ein weiterer Quellen-Adapter (`application/import/quellenAdapter.ts`); Dedup über
`rohHash` und der Konto-Match gelten unverändert. Zu klären: FinTS-Bibliothek und wo der
Abruf läuft — berührt die Deployment-Frage aus DOMAENE §8 und damit ADR-0001.

### Weiter offen (aus DOMAENE §8/§9, ohne Slice)

- Bounded Contexts schneiden + Context Map. **Nicht bei null:** Modell v1 hatte
  Ledger · Planung · Stammdaten · Import · Vorsorge geschnitten. Ledger fällt weg,
  „Autonome Haushaltsführung" kommt als Core dazu — der Rest dürfte weitgehend tragen.
- Deployment präzisieren („lokal" = Desktop? Heimserver? Mobilzugriff) — löst auch die
  Frage, wie Handy-Belegfotos zur Desktop-App kommen. Prüft ADR-0001 (Tauri).
- Kontextstrategie fürs Sprachmodell bei endlichen Kontextfenstern.
- Chat als zweiter Bediener (DOMAENE §2, Rolle 1) — ruft dieselben Use-Cases wie die UI.

---

## Reihenfolge auf einen Blick

```
S-1 Umbuchung aus Buchung ─┐
                           ├─→ S-3 Journal ─→ S-4 Classifier ─→ S-5 Korrekturschleife ─→ S-6 FinTS
S-2 Vertrag aus Buchung ───┘        (liefert Regel-Schicht für S-4)
```

S-1 und S-2 sind unabhängig voneinander und könnten in beliebiger Reihenfolge laufen.
S-6 hängt fachlich an S-4, nicht technisch — der Zugang funktioniert vorher, das Ergebnis
wäre nur unbrauchbar.
