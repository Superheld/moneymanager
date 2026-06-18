# ADR-0003 — Ist-Buchung als Buchungssatz: Zuordnung über das Gegenkonto, Topf-Entnahme

> **DDD-Ebene:** Entscheidung — ADR-Serie · **Status:** Akzeptiert · **Stand:** 2026-06-18 · **Bezüge:** RECHNUNGSWESEN-BEZUG, SPEC-MVP §4, TAKTIK-PLANUNG (Zuordnung), KONZEPT §3, BUCHUNGSPACKAGE-ANFORDERUNGEN, ADR-0001, ADR-0002

> Status: **Akzeptiert** · 2026-06-18 · Entscheider: Bruce + Claude
> Format: Kontext → Entscheidung → Begründung → Konsequenzen → Abgrenzung → Folgeentscheidungen.

## Kontext

- **Dieselbe Kategorie für alles.** Budgets, Töpfe, Verträge/Zahlungsregeln und Ist-Buchungen
  teilen sich den Kategorienbaum. Eine Beschaffung in einer Kategorie ist über die Kategorie
  **allein nicht** als Budget-Verbrauch, Topf-Entnahme oder Vertragszahlung identifizierbar:
  „Auto" kann gleichzeitig einen Vertrag (Versicherung), ein Budget (Sprit) und einen Topf
  (Reparatur-Rücklage) tragen.
- **Entnahmen aus Töpfen/Rücklagen** waren ungelöst (Beispiel: „ich ersetze den Laptop").
  ADR-0002 §5 („Topf-Verbrauch real") war dafür vertagt.
- Der **Rechnungswesen-Blick** (RECHNUNGSWESEN-BEZUG: „Mechanik vom HGB/Doppik, Haltung von
  der KLR") liefert die Antwort frei Haus: in der doppelten Buchführung **existiert das
  Identifikationsproblem nicht**, weil jeder Buchungssatz das **Gegenkonto benennt**.
- **Ein echtes, kleines Buchungs-/Doppik-Modul ist absehbar** (Buchungspackage, GoBD, A5).
  Wenn die Ist-Buchung **jetzt schon buchungssatz-förmig** ist, ist der spätere Wechsel hinter
  dem `LedgerPort` (ADR-0002) ein **mechanisches Mapping statt eines Umbaus** (Bruce, 2026-06-18).

## Entscheidung

1. **Die Ist-Buchung ist konzeptuell ein Buchungssatz.** Sie benennt das `Zahlungskonto`
   (Aktivseite) **und ein Gegenkonto**. Die „Verwendung/Zuordnung" einer Buchung *ist* dieses
   Gegenkonto — sie wird **explizit gesetzt, nie aus der Kategorie erschlossen**.

2. **Kategorie = reine KLR-Analyseachse** (Kostenart/Kostenstelle, RECHNUNGSWESEN-BEZUG §2),
   **kein** Zuordnungsschlüssel. Sie beantwortet „wofür/wo angefallen", nicht „welcher Topf/welches
   Budget".

3. **Drei Gegenkonto-Typen — auf drei verschiedenen Rechenwerks-Achsen, daher trennbar:**

   | Ziel | Wohnt als | Wie es zählt |
   |---|---|---|
   | **Budget** | *Soll (Plankosten)* auf einer Kostenart × Periode (Controlling) | **automatisch** über Kategorie × Periode — kein eigenes Buchungsziel |
   | **Topf** | **Passivkonto** (Rücklage/Rückstellung, Bilanz) | **explizit benannt** (aus der Kostenart nicht ableitbar) |
   | **Vertrag** | Aufwand auf einer Kostenart + Beleg | Aufwand auf der Kategorie **+ `planRef`** (welche Fälligkeit) |

   Das erklärt, warum „Auto" fürs Sprit-Budget über die Kategorie funktioniert, für die
   Reparatur-Rücklage aber nicht: Budget ist ein *Soll auf der Kostenart*, Topf ein *eigenes Konto*.

4. **Der Charakter folgt aus dem Gegenkonto-Typ**, er wird nicht frei gewählt:
   - Gegenkonto = Kostenart → **Aufwand/Ertrag** (echter Verbrauch) → zählt gegen das Budget.
   - Gegenkonto = Topf (Passiva) → **Umschichtung** (Aktivtausch) → reduziert den Topf, **kein neuer Aufwand**.

5. **Aufwand-Erkennung pro Topf-Typ** (Buchhaltungs-Definition von Rückstellung/Abschreibung vs.
   Konsumsparen):

   | Topf-Typ | Aufbau (Zuführung) | Entnahme |
   |---|---|---|
   | **Ersatz** (kalk. Abschreibung) | **Aufwand** (Verschleiß, ohne Geldfluss) | **Umschichtung** (Rücklage auflösen) |
   | **Puffer** (Rückstellung §249) | **Aufwand** (Vorsorge) | **Umschichtung** (Rückstellung verbrauchen) |
   | **Spartopf** (Konsumsparen) | **Umschichtung** (Geld zweckbinden) | **Aufwand** (Konsum) |

   Folge: Eine gedeckte Entnahme aus Ersatz/Puffer ist **liquiditätsneutral für die freie
   Liquidität** (Kontosaldo − x, Topf-Soll − x) — der Schmerz wurde über die Nutzungsdauer schon
   getragen. **Über-/Unterdeckung am Ende ist der einzige echte GuV-Effekt** (zu wenig gespart →
   Rest-Aufwand; zu viel → Auflösungs-Ertrag).

6. **Topf-Entnahme.** Bucht eine Ist-Buchung mit Gegenkonto = Topf (Charakter nach Tabelle 5),
   von einem `Zahlungskonto`; senkt Kontosaldo **und** Topf-Stand. **Ersatztopf zusätzlich:**
   Aktion „ersetzt" startet den Abschreibungszyklus neu (Anschaffung/`start` = heute, synchron
   mit dem verknüpften Inventargegenstand), damit der Sollstand für den *nächsten* aufbaut.
   Topf-Stand = Σ Zuführung (kalkulatorisch) − Σ Entnahmen; **bei Ersatz nur seit dem aktuellen
   Zyklus-Start gezählt**.

7. **Scope: 1:1 jetzt, n:m später.** Eine Buchung trägt **ein** Gegenkonto über den vollen
   Betrag. Das **n:m-/Teilbetrags-Matching** (eine Überweisung deckt zwei Posten; ein Kauf 50 €
   Topf + 40 € drüber) — das `Zuordnung`-Aggregat mit Teilzuordnungen aus TAKTIK-PLANUNG — ist
   das **Zielbild** und kommt mit dem Bankimport, wo es real gebraucht wird.

8. **Vorwärtskompatibilität zum echten Modul.** Wir speichern weiter **einseitig** (Betrag
   vorzeichenbehaftet + Konto + Gegenkonto), aber **buchungssatz-förmig**: das Gegenkonto ist
   benannt, der Charakter ist abgeleitet. Wenn das Doppik-/Buchungspackage kommt, docke es hinter
   demselben `LedgerPort` an; jede Ist-Buchung wird mechanisch zum zweizeiligen Buchungssatz
   (Soll an Haben), das provisorische Format → A5 per ACL. **Kein Umbau der Plan-/Zuordnungsschicht.**

## Begründung

- **Die Doppik erzwingt Eindeutigkeit:** das Gegenkonto *ist* die Zuordnung — kein Raten aus der
  Kategorie, keine Heuristik, keine Doppelzählung.
- **Charakter und Budget-Matching fallen gratis ab** (aus dem Gegenkonto-Typ bzw. aus
  Kategorie × Periode) — weniger manuelle Felder, weniger Fehlerquellen.
- **Konsistent mit RECHNUNGSWESEN-BEZUG:** Mechanik aus HGB/Doppik (Buchungssatz, Rückstellung,
  kalkulatorische Abschreibung), Haltung aus der KLR (Kostenart als Analyseachse).
- **Zukunftssicher:** modelliert das, was das echte Modul ohnehin verlangt → sanfter Upgrade-Pfad.

## Konsequenzen

**Positiv:** eindeutige Attribution ohne Kategorie-Heuristik; korrekte freie Liquidität bei
Entnahmen; automatischer Charakter und automatisches Budget-Matching; eine Mechanik für
Vertrag/Budget/Topf; mechanischer Pfad zum echten Buchungspackage.

**Preis / negativ:** **SPEC-MVP §4 wird auf einem Punkt abgelöst** — der Verbrauch einer
gedeckten Rücklage ist **Umschichtung, nicht Aufwand** (SPEC §4 las den Verbrauch als Aufwand,
der den Stand ins Minus zieht; das zählte den Schmerz doppelt). Etwas mehr Modell (Gegenkonto-Typ,
Topf als Buchungsziel). Der Ersatz-Zyklus-Neustart ist ein **Lebenszyklus-Ereignis**, kein reines
Booking.

## Abgrenzung (NICHT Teil dieses Schritts)

- Kein echtes Doppik-Package, **keine zweiseitige Speicherung** jetzt, keine GoBD-Festschreibung.
- Kein **n:m / Teilbeträge** (Zuordnung-Aggregat) jetzt — Zielbild, kommt mit dem Import.
- Kein **Auto-Matching** (gehört laut TAKTIK-PLANUNG in die Import-/App-Schicht, nicht in den Kern).
- Budgets bleiben **Soll auf der Kostenart**, kein eigenes Buchungsziel.

## Folgeentscheidungen / Bauplan (kern-first)

1. **Core:** Gegenkonto/Verwendung am `IstBuchung` (Ziel-Typ `regel` | `topf`; „Budget/Kostenart"
   bleibt implizit über `kategorieId`). Das bestehende `planRef` in diese `verwendung` überführen
   (Migration). Reine Funktion `topfStand` (Σ Zuführung − Σ Entnahmen, Charakter je Typ; Ersatz
   gefenstert ab Zyklus-Start). Charakter-Ableitung aus dem Gegenkonto-Typ.
2. **Application:** Use-Case `topfEntnahme` (bucht Gegenkonto = Topf, Charakter nach Tabelle) und
   `ersatzErsetzt` (Entnahme + Zyklus-Neustart, synchron mit Inventargegenstand).
3. **UI:** Töpfe zeigen realen Stand + Überziehung; „Entnehmen"/„ersetzt"-Aktion; Konto-Register
   und Übersicht nutzen die Zuordnung.
4. **SPEC-MVP §4 nachziehen** (Aufwand-Timing der Rücklagen-Entnahme).
5. *Später:* n:m/Teilbeträge + Auto-Matching mit dem Bankimport; danach das echte Buchungspackage
   hinter dem `LedgerPort`.

Offen für später: UI-Defaults für die Verwendungs-Wahl bei mehrdeutigen Kategorien; ob die
Vertragszahlung dauerhaft als „Gegenkonto Kostenart + `planRef`" geführt wird (Tendenz: ja).
