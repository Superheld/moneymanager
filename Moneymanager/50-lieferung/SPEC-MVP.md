# Moneymanager — MVP-Spezifikation

> **DDD-Ebene:** Lieferung — Spezifikation · **Status:** aktiv · **Stand:** 2026-06-13 · **Bezüge:** KONZEPT, UBIQUITOUS-LANGUAGE, TAKTIK-*, ROADMAP

> Stand: 2026-06-13 · ROADMAP NEXT #2 · Team: Bruce + Claude
> Baut auf KONZEPT §7 (Feature-Schnitt) und dem taktischen Design (TAKTIK-PLANUNG/
> -STAMMDATEN/-IMPORT) auf. Zweck: entwicklerfreundliche Spec als Brücke von „im Konzept
> baubar" zu „im Code baubar". Sprache: Fachbegriffe intern, **UI-Wörter** laut Glossar
> (UBIQUITOUS-LANGUAGE.md): Budget · Spartopf (+Sparziel) · Puffer · Ersatz · Vorsorge.

## 1. Umfang

**Im MVP (ein Rechner, ein Zugang):**
Stammdaten (Haushalt, Personen, Konten, Kategorien) · Vertragsverwaltung inkl. Einnahmen und
Kündigungsfrist-Erinnerung · Töpfe (Ersatz, Puffer, Spartopf) · Budgets · Liquiditätsplaner
(Jahresprojektion, **Plan-only**) · CSV/CAMT-Import mit regelbasierter Kategorisierung ·
Plan/Ist-Abgleich + Basis-Analysen · KI-Vorbereitungen *ohne* KI.

**Nicht im MVP** (Richtung in ROADMAP LATER): Anlagen + Vorsorge-Cockpit (Stufe 2), FinTS/HBCI
(Stufe 3), KI-Runtime, Mehrnutzer/Sync, Kredite, Trading/Orderausführung, PSD2-Drittanbieter.

**Harte Reihenfolge** (DOMAENENDESIGN §5, ROADMAP): Planung → Stammdaten → Import. Das
Buchungspackage wird **erst zum Ist-Schritt** (Import → Ist-Journal) zur echten Abhängigkeit;
die Plan-Basis läuft app-seitig ohne es. Früh fix nötig: nur **A5 (Buchungsformat-Schema)**.

## 2. Akteure

- **Nutzer** — die haushaltsführende Person, alleiniger Zugang im MVP.
- **Person** — Haushaltsmitglied, ab Tag 1 als Entität/Dimension (auch bei einem Zugang);
  Inhaberschaft von Konten/Verträgen, später Vorsorge-Bezug.

Es gibt keine Rollen-/Rechteverwaltung im MVP (ein Zugang).

## 3. Epics, User Stories & Akzeptanzkriterien

Format: **US-x** „Als Nutzer möchte ich …, um …" + testbare Kriterien. Kriterien sind an die
Invarianten des taktischen Designs gebunden.

### A — Stammdaten

**US-A1 — Personen pflegen.** Als Nutzer möchte ich Personen anlegen, um Konten/Verträge
zuordnen zu können.
- Mindestens eine Person existiert, bevor Konten/Verträge angelegt werden.
- Felder: Name (Pflicht), Geburtsdatum (optional; für Vorsorge in Stufe 2), Rolle im Haushalt.
- Eine Person ist als Inhaber referenzierbar.

**US-A2 — Zahlungskonten pflegen.** Als Nutzer möchte ich Konten (Giro/Tagesgeld/Bargeld)
führen, um Geldbestände und -flüsse zu verorten.
- Felder: Bezeichnung, Typ, optional IBAN (validiert), Inhaber(e).
- Jedes Konto hat **genau ein** internes Sachkonto-Mapping; nach der ersten Buchung
  unveränderlich. (Mapping ist UI-unsichtbar.)
- Kontostand ist „nur eine Zahl" — Töpfe sind **nicht** kontogebunden (siehe C4).

**US-A3 — Kategorien pflegen.** Als Nutzer möchte ich Kategorien als Baum führen, um Ströme
auszuwerten.
- Felder: Name, optionale Elternkategorie, Default-Charakter (Aufwand|Ertrag|Umschichtung).
- **Keine Zyklen** in der Hierarchie. Kostenstellen-Mapping (intern) eindeutig.

### B — Verträge

**US-B1 — Vertrag erfassen.** Als Nutzer möchte ich wiederkehrende Verträge dokumentieren,
um Konditionen und Fristen im Blick zu haben.
- Felder: Anbieter, Vertragsnummer, Inhaber, Beginn, Mindestlaufzeit, Verlängerungsregel,
  Kündigungsfrist, Status, Anhänge (Dokumentreferenzen), Notizen.
- Statusmaschine `aktiv → gekündigt → beendet`, **keine Rücksprünge**.

**US-B2 — Vertrag erzeugt Zahlungsregel.** Als Nutzer möchte ich, dass aus einem Vertrag der
zugehörige Zahlungsstrom entsteht, ohne ihn doppelt zu pflegen.
- Eine Maske schreibt in **zwei** Kontexte: Vertrag (Stammdaten) + Zahlungsregel-Entwurf
  (Planung), orchestriert von der Anwendungsschicht über `VertragAngelegt` (eventual
  consistent, kein gemeinsames Aggregat).
- Zahlungsregel trägt: Intervall (Rhythmus), Betrag, Quell-/Zielkonto, Kategorie, Charakter,
  Gültigkeitszeitraum. Betragsänderungen sind **datiert** (Historie, nie Überschreiben).

**US-B3 — Einnahmen als Verträge.** Als Nutzer möchte ich Gehalt/Kindergeld erfassen, damit
die Projektion Zuflüsse kennt.
- Einnahme ist ein Vertrag mit Charakter **Ertrag**; erscheint als Zufluss in der Projektion.

**US-B4 — Kündigungs-Erinnerung.** Als Nutzer möchte ich rechtzeitig an Kündigungstermine
erinnert werden, um nicht ungewollt zu verlängern.
- `nächsterKündigungstermin(heute)` aus Beginn, Mindestlaufzeit, Verlängerungsregel, Frist.
- `KündigungsterminNaht` löst einen Hinweis aus (zeitgesteuert).
- Kündigung nur zu einem **zulässigen** Termin möglich.

### C — Töpfe

**US-C1 — Ersatz (Inventar).** Als Nutzer möchte ich für Dinge, die ich besitze und ersetzen
muss, automatisch ansparen (kalkulatorische Abschreibung).
- Aus Inventargegenstand (Wiederbeschaffungswert, Nutzungsdauer, Start) wird eine **Ansparrate**
  abgeleitet; `sollstand(am)` wächst mit der Zeit.
- Invariante: Ansparrate konsistent mit Zielwert + Restlaufzeit; Abweichung nur explizit als
  „manuell übersteuert" markiert.
- `InventargegenstandErfasst` → Ersatz-Topf wird **vorgeschlagen** (Vorschlags-Status, H1).

**US-C2 — Puffer (Rückstellung).** Als Nutzer möchte ich für Ungewisses (Reparatur,
Nachzahlung) einen Puffer bilden.
- Felder: Anlass, Schätzbetrag, Zeitfenster, optional Eintrittswahrscheinlichkeit.
- Invariante: Schätzbetrag > 0; Zeitfenster in Zukunft oder offen. `sollstand(am)` aus
  Schätzbetrag + Zeitfenster.

**US-C3 — Spartopf (Freitopf).** Als Nutzer möchte ich für unregelmäßige Ausgaben unbekannter
Höhe (Klamotten) ansammeln, ohne dass es gekappt wird.
- Felder: Zweck/Kategorie, Zuführungsregel, **optionales Sparziel** (frei, ohne Frist).
- Läuft mit, **kein Reset**, freier Verbrauch (klein oder groß). Trägt auch bewusstes
  Ansparen für einen großen Einmal-Kauf.
- `sollstand(am)` **nur** definiert, wenn ein Sparziel gesetzt ist; sonst nur laufender Stand.

**US-C4 — Deckung sichtbar machen.** Als Nutzer möchte ich sehen, ob meine Töpfe finanziert
sind, obwohl ein Konto nur eine Zahl ist.
- **Entscheidung C: „Plan = Ist" + globale Deckung.** Die geplante Zuführung gilt als erfolgt;
  ein kontoloser Topf führt keinen eigenen Ist-Stand.
- Anzeige: **freie Liquidität = liquide Mittel − Σ Topf-Sollstände.** Reicht das Geld nicht
  für alle Töpfe, geht die freie Liquidität **ins Minus** — das ist das Signal „zu viel
  verplant". **Keine** Allokation, **keine** Priorität: jeder Topf behält seinen vollen
  Sollstand, die Überplanung erscheint als eine globale (negative) Zahl.
- Nur Töpfe **mit** Zielwert haben einen Sollstand (Spartopf ohne Sparziel: nur Stand).
- Echte Pro-Topf-Über-/Unterzahlung **nur**, wenn ein Topf ein eigenes (Unter-)Konto hat
  (dann reale Umschichtungen + Matching, siehe G1). *Im MVP optional/aus.*

### D — Budgets

**US-D1 — Budget je Kategorie/Periode.** Als Nutzer möchte ich variable Ausgaben mit einem
monatlichen Rahmen steuern.
- Felder: Kategorie, Periode (z. B. Monat), Rahmenbetrag (> 0), Glättungsregel (MVP: linear).
- **Reset zum Periodenende** — kein Übertrag. (Ansparendes gehört in einen Topf, nicht ins
  Budget.)
- Eindeutigkeit „ein Budget je Kategorie + Periode": die Anwendungsschicht prüft per Repository
  (bewusst nicht synchron erzwungen).

**US-D2 — Budget erzeugt Plan-Abflüsse.** Als Nutzer möchte ich Budgets in der Projektion
sehen.
- Die Glättungsregel verteilt den Rahmen über die Periode → geglättete Plan-Abflüsse
  (Periodenabgrenzung). Siehe durchgespielte Mechanik (§4).

### E — Liquiditätsplaner (Plan-only)

**US-E1 — Jahresprojektion.** Als Nutzer möchte ich meinen Liquiditätsverlauf für die nächsten
12 Monate sehen, um Engpässe früh zu erkennen.
- Projektion aggregiert **alle** Plan-Quellen (Verträge/Zahlungsregeln, Budgets,
  Topf-Zuführungen) je Konto und gesamt.
- Der Verlauf zeigt Kontosaldo und freie Liquidität direkt; negative Werte (Überziehung bzw.
  Überplanung) sind sichtbar. **Keine** aktive Warnung/Schwelle im MVP — man sieht es im Plan.
- **Plan-only:** alles ist berechnet (pure function über `(QuellenId, Fälligkeit)`), nichts wird
  als Planbuchung gespeichert.

**US-E2 — Szenario (What-if).** Als Nutzer möchte ich Varianten durchspielen, ohne den Plan zu
verändern.
- Benannte, verwerfbare Delta-Schicht (Regel-Override, Zusatzposten, Topf-Override).
- Projektion `mit` Szenario; das Szenario berührt die Plan-Schicht **nie**; jederzeit
  verwerfbar.

### F — Import *(ab hier ist das Buchungspackage nötig)*

**US-F1 — Umsätze importieren.** Als Nutzer möchte ich Kontoauszüge (CSV/CAMT) einlesen.
- Quellen-Port liest Rohumsätze; Adapter pro Format (Bibliothek). Felder je Umsatz:
  Konto, Buchungstag, Valuta, Betrag, Verwendungszweck, Gegenpartei, Herkunft (LaufId).
- **Duplikaterkennung** per Roh-Hash; Duplikate werden markiert (Endzustand `duplikat`) und
  **nicht** verbucht; toleriert Valuta-Verschiebung/Zweck-Umbrüche.

**US-F2 — Kategorisieren.** Als Nutzer möchte ich Umsätze (halb)automatisch kategorisiert
bekommen.
- Regeln nach Priorität → `Kategorisierungsvorschlag` (Kategorie, Charakter, Quelle). Kein
  Treffer → Umsatz bleibt unkategorisiert und landet in der **Review-Inbox** (H2).
- Status je Umsatz: `neu → kategorisiert(vorgeschlagen) → bestätigt → verbucht`.

**US-F3 — Bestätigen & verbuchen.** Als Nutzer möchte ich Vorschläge prüfen und ins Ist-Journal
übernehmen.
- Bestätigung (ggf. korrigiert) → Übersetzung in einen Buchungssatz der Published Language des
  Ledgers (Sachkonto via Konto-Mapping, Kostenstelle via Kategorie-Mapping) → `IstbuchungId`.
- `verbucht ⇒ IstbuchungId vorhanden`; verbuchte Umsätze sind **unveränderlich**.
- Nutzerkorrekturen können zu einer **Kategorisierungsregel** werden (`RegelAusKorrekturGelernt`).

### G — Plan/Ist-Abgleich & Analysen

**US-G1 — Auto-Matching.** Als Nutzer möchte ich, dass eingegangene Ist-Buchungen den
Planposten zugeordnet werden.
- `UmsatzVerbucht` → Matching-Vorschlag Plan ↔ Ist über `(QuellenId, Fälligkeit)`.
- **Invariante:** Σ Teilzuordnungen ≤ Betrag der Istbuchung (keine Überzuordnung).
- n:m wird unterstützt: eine Istbuchung → mehrere Planposten (Sammellastschrift); ein
  Planposten ← mehrere Istbuchungen (Teilzahlungen).
- Verwaiste Zuordnung (Planreferenz nach Regeländerung weg) wird als Prüffall gemeldet.

**US-G2 — Plan/Ist-Sicht.** Als Nutzer möchte ich Abweichungen je Kategorie/Vertrag/Topf sehen.
- Gegenüberstellung Plan vs. Ist je Achse; Budget: Periode = Σ Ist der Kategorie vs. Rahmen.
- Jede Auswertung benennt ihre **Schicht** (Ist / Plan / Szenario) explizit — kein
  Vermischen per Default.

**US-G3 — Liquiditätsverlauf mit Ist.** Als Nutzer möchte ich den realen Verlauf inklusive
gebuchter Ist-Salden sehen.
- Ist-Salden kommen aus dem Ledger-Rechenwerk (pure functions); Plan-Deltas addiert die App.

### H — KI-Vorbereitungen *ohne* KI (KI-KONZEPT §4)

**US-H1 — Vorschlags-Status.** Überall, wo etwas automatisch erzeugt wird (Zahlungsregel aus
Vertrag, Ersatz-Topf aus Inventar, Kategorisierung), gilt `vorgeschlagen | bestätigt`.

**US-H2 — Review-Inbox.** Unkategorisierte/wartende Umsätze und offene Vorschläge sammeln sich
in einer Inbox zur Bestätigung.

**US-H3 — Engine als Funktionskatalog + Dokumentenablage.** Projektion/Deckung/Matching sind
deterministische, einzeln aufrufbare Funktionen (KI-andockbar später). Anhänge liegen in einer
generischen Dokumentenablage (Dokumentreferenzen).

## 4. Durchgespielte Kernmechanik (Budget-Glättung → Periode → Plan/Ist; Töpfe)

Dies ist der vom Audit benannte, bisher nicht durchexerzierte Pfad. Beispielhaushalt:

- Konto **Giro**, Startsaldo 2.000 €.
- Vertrag **Hausrat** 120 €/Jahr, fällig 1. März → Zahlungsregel: jährlich, −120 €, Aufwand.
- Budget **Lebensmittel** 400 €/Monat, Glättung linear.
- Ersatz-Topf **Waschmaschine**: Wiederbeschaffung 600 €, Nutzungsdauer 5 J → Ansparrate 10 €/Monat.
- Spartopf **Klamotten**: Zuführung 50 €/Monat, **kein** Sparziel.

**Schritt 1 — Projektion (pure function).** Erzeugt Planbuchungen je `(QuellenId, Fälligkeit)`:

- *Vertrag:* eine Planbuchung −120 € am 1. März (echter Liquiditätsabfluss in diesem Monat).
- *Budget:* die Glättungsregel verteilt den Rahmen über die Periode → −400 €/Monat als
  **erwarteter** Periodenabfluss (Periodenabgrenzung — der Rahmen *ist* der geplante Verbrauch
  der Periode, nicht eine Zahlung an einem Tag).
- *Topf-Zuführungen:* +10 € (Ersatz) und +50 € (Klamotten) pro Monat **als kalkulatorischer
  Fluss** — siehe Schritt 2.

**Schritt 2 — Zwei Liquiditäts-Kurven (wichtige Klärung).** Eine Topf-Zuführung in einen
**kontolosen** Topf bewegt **kein** Geld (das Geld bleibt auf dem Giro, wird nur
zweckgebunden). Der Liquiditätsplan zeigt deshalb zwei Kurven:

- **Kontosaldo** — bewegt durch *echte* Flüsse (Verträge, Budget-Verbrauch). Topf-Zuführungen
  verändern ihn **nicht**.
- **Freie Liquidität** = Kontosaldo − Σ Topf-Sollstände. *Hier* schlägt die Zuführung durch
  (die Zweckbindung wächst).

(Hat ein Topf ein **eigenes** Konto, ist die Zuführung eine echte Umschichtung und bewegt die
Salden der beiden Konten — dann fällt sie unter „echte Flüsse".)

**Schritt 3 — Ist kommt rein.** Import verbucht „REWE 38,20 €" → Kategorie *Lebensmittel*,
Aufwand → `IstbuchungId`. Auto-Matching (G1) ordnet der Planreferenz *(Budget Lebensmittel,
Periode = lfd. Monat)* zu (Teilbetrag 38,20 €).

- **Budget-Periode:** Plan/Ist = Σ Ist *Lebensmittel* (z. B. 380 €) vs. Rahmen 400 € → 20 €
  unter Budget. **Am Periodenende Reset:** der Rest verfällt, kein Übertrag.

**Schritt 4 — Töpfe unter „Plan = Ist".** Der Topf-**Stand** ist:

> Stand(am) = Σ *angenommene* Zuführungen (Plan = Ist)  −  Σ *reale, der Topf-Kategorie
> zugeordnete* Verbräuche.

- Die Zuführungsseite gilt als erfolgt (kein eigener Ist-Datensatz nötig). Nach Monat 1:
  Ersatz 10 €, Klamotten 50 €.
- Kauft der Nutzer „H&M 90 €" (Kategorie *Klamotten*, Aufwand), ist das ein **echter**
  Liquiditätsabfluss (Giro −90 €) **und** ein Verbrauch aus dem Klamotten-Topf → Stand
  50 − 90 = **−40 €**. Ein negativer Stand ist das sichtbare Signal „mehr ausgegeben als
  angespart". → Pro-Topf **Überziehung** ist damit sichtbar (getrieben von realen Ausgaben),
  auch ohne eigenes Konto; nur die *Funding*-Disziplin („habe ich diesen Monat zugeführt?")
  bleibt unter „Plan = Ist" unsichtbar.
- **Globale Deckung = freie Liquidität** (liquide Mittel − Σ Sollstände). Reicht es nicht, geht
  sie ins Minus = „zu viel verplant"; keine Allokation, keine Priorität. Das ist die Antwort
  auf „ein Konto ist nur eine Zahl".

**Was hier feststeht (Spec-Ergebnis):** Budgets sind periodengebunden mit Reset und matchen
direkt gegen Ist; Töpfe laufen mit, ihre Zuführung ist (kontolos) kalkulatorisch und erscheint
nur in der „freien Liquidität", ihr Verbrauch ist real und macht Überziehung pro Topf sichtbar;
Deckung ist eine globale Leseschicht (freie Liquidität; sie darf ins Minus = Überplanung).

> **Nachtrag (ADR-0003, 2026-06-18) — zwei Punkte abgelöst, gebaut 2026-06-20:**
> 1. **Zuordnung über das Gegenkonto, nicht die Kategorie.** Ein Topf-Verbrauch wird nicht
>    mehr „über die Topf-Kategorie" erschlossen (Schritt 4 oben), sondern die Ist-Buchung
>    benennt den Topf **explizit** als Verwendung (`verwendung = {art:"topf"}`). Die Kategorie
>    bleibt reine KLR-Analyseachse; das Budget-Matching (Schritt 3) läuft weiter automatisch
>    über Kategorie × Periode.
> 2. **Charakter folgt aus dem Topf-Typ.** Gedeckte Entnahme aus **Ersatz/Puffer** ist
>    **Umschichtung** (Rücklage/Rückstellung auflösen), nicht Aufwand — sie ist für die freie
>    Liquidität neutral, der Aufwand wurde über die Nutzungsdauer schon getragen. Nur die
>    **Spartopf**-Entnahme ist Aufwand (Konsum) — das H&M-Beispiel (Schritt 4) bleibt also
>    korrekt, weil „Klamotten" ein Spartopf ist. Über-/Unterdeckung am Zyklus-Ende ist der
>    einzige echte GuV-Effekt. Bei **Ersatz** startet „ersetzt" den Abschreibungszyklus neu.

## 5. Datenmodell-Skizze (konsolidiert)

Leitsatz: **Planbuchungen werden berechnet, nicht gespeichert** (TAKTIK-PLANUNG §0).

| Kontext | Aggregate (persistiert) | Schlüssel-Felder |
|---|---|---|
| **Planung** | Zahlungsregel | Rhythmus, Betrag, Quell-/Zielkonto, Kategorie, Charakter, Gültigkeit (datierte Konditionen) |
| | Budget | Kategorie, Periode, Rahmenbetrag, Glättungsregel |
| | Rücklage *(Topf)* | InventargegenstandId, Zielwertfunktion (Wiederbeschaffung, Nutzungsdauer), Ansparrate |
| | Rückstellung *(Topf)* | Anlass, Schätzbetrag, Zeitfenster, optional Wahrscheinlichkeit |
| | Freitopf *(Topf)* | Zweck/Kategorie, Zuführungsregel, optional Sparziel |
| | Szenario | Name, Menge von Deltas |
| | Zuordnung | IstbuchungId, Teilzuordnungen `(QuellenId+Fälligkeit, Teilbetrag)` |
| **Stammdaten** | Vertrag · Inventargegenstand · Zahlungskonto · Person · Kategorie | siehe TAKTIK-STAMMDATEN §1 |
| **Import** | Umsatz · ImportLauf · Kategorisierungsregel | siehe TAKTIK-IMPORT §1 |
| **Ledger** *(Package)* | Buchung / Ist-Journal, Salden | **nicht** app-seitig — Published Language |

- **Berechnet, nie persistiert:** `Planbuchung` (QuellenId, Fälligkeit, Geldbetrag, Konten,
  Kategorie, Charakter, Schicht).
- **Gemeinsame Value Objects:** Geldbetrag · Rhythmus · Zeitraum/Fälligkeit/Periode · Charakter
  · Zielwert(strategie) · Glättungsregel · Schicht (plan | szenario).
- **`Topf`** ist gemeinsame Abstraktion (Abstract Core) über Rücklage/Rückstellung/Freitopf,
  Zielwert optional (TAKTIK-PLANUNG §1).

## 6. Abgrenzung (nicht im MVP)

Anlagen + Vorsorge-Cockpit (Stufe 2) · FinTS/HBCI (Stufe 3) · KI-Runtime · Mehrnutzer/Sync ·
Kredite · Trading. Außerdem bewusst eingeschränkt: Pro-Topf-**Funding**-Disziplin (nur via
eigenem Konto), nicht-lineare/saisonale Glättung, automatische Vertragserkennung aus Umsätzen.

## 7. Offene Punkte, die diese Spec noch schließen muss

| Punkt | Status |
|---|---|
| ~~Priorität-Regel für Topf-Deckung~~ | **entschieden 2026-06-13: entfällt.** Keine Allokation; freie Liquidität darf ins Minus und zeigt Überplanung (C4). |
| ~~Engpass-Schwelle / aktive Warnung~~ | **entschieden 2026-06-13: entfällt im MVP.** Passiv im Plan sichtbar, keine aktive Warnung. |
| Glättungsregel jenseits linear (saisonaler Verbrauch ohne Übertrag) | vertagt (KONZEPT §8) |
| UI-Wording final bestätigen | Vorschlag steht (UBIQUITOUS-LANGUAGE.md) |
| **A5 Buchungsformat-Schema** früh fixieren | Voraussetzung für Import (ROADMAP) |
| Plattform-Entscheidung | **nach** dieser Spec (ROADMAP NEXT #3) |
