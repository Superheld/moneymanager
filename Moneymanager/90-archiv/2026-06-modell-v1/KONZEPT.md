# Moneymanager — Konzept

> **DDD-Ebene:** Strategisch — Vision & Domänenüberblick · **Status:** tragend · **Stand:** 2026-06-13 · **Bezüge:** DOMAENENDESIGN, UBIQUITOUS-LANGUAGE, RECHNUNGSWESEN-BEZUG

> Stand: 2026-06-07 · Status: Diskussionsergebnis, Grundlage für Spezifikation

## 1. Vision

Eine lokale Finanzverwaltungs-App, die die Denkweise des betrieblichen Rechnungswesens
(Liquiditätsrechnung, Rückstellungen, Abschreibungen, Bilanz) auf Privathaushalte überträgt —
mit einer Sprache, die normale Menschen verstehen.

Kernunterscheidung zu klassischen Budget-Apps (YNAB, Finanzguru & Co.):

- Nicht nur Ist-Betrachtung, sondern **Planung**: Wie verhält sich mein Jahr voraussichtlich?
- Saubere Trennung von **Ausgabe vs. Vermögensumschichtung** (ein ETF-Sparplan ist keine "Ausgabe")
- Saubere Trennung von **Zweckbindung vs. Liquidität** (eine Rücklage "liegt" nicht auf einem Konto,
  sie ist davon gedeckt)

Die App ist heimlich eine **private Bilanz plus Finanzplan**.

## 2. Leitprinzipien

1. **Lokal first.** Alle Daten bleiben auf dem Gerät. Keine Cloud-Pflicht.
2. **Funktioniert ohne KI.** Der Kern (Projektion, Rücklagen, Liquidität) ist reine Arithmetik.
   KI ist eine optionale Komfortschicht.
3. **Fachlich streng innen, alltagstauglich außen.** Das Domänenmodell nutzt präzise
   Rechnungswesen-Begriffe; die UI übersetzt sie konsequent (siehe Glossar).
4. **Haushalt als ein Datenbestand.** Ein Account, perspektivisch mehrere Zugänge.
   Personen sind eine Dimension *im* Datenbestand, keine getrennten Mandanten.
5. **Architektur-Optionen offenhalten.** MVP: ein Rechner, ein Zugang. Datenhaltung so
   kapseln, dass später ein lokaler Server (Haushalts-Sync) davor passt.

## 3. Domänenmodell

Vier Gruppen: Aktiva, Töpfe (Passiva), Ströme, Linsen. Dazu Querschnittsdimensionen.

### 3.1 Aktiva — wo Geld/Wert tatsächlich ist

| Konzept | Definition | Liefert |
|---|---|---|
| **Konto** | Liquides Geldkonto (Giro, Tagesgeld, Bargeld) | Ist-Buchungen |
| **Anlage** | Gebundenes Vermögen (Depot, ETF, Rentenversicherung mit Kapitalwert, ggf. Immobilie) | Wertstände (MVP: manuell gepflegt) |

### 3.2 Töpfe — Zweckbindung (Passiva-Seite)

| Konzept | Definition | Mechanik |
|---|---|---|
| **Rücklage** | Planbarer künftiger Ersatz, inventarbasiert | Wiederbeschaffungswert + Nutzungsdauer → monatliche Ansparrate (Privat-Analogie zur Abschreibung). Zielwert wächst mit der Zeit. |
| **Rückstellung** | Ungewisse, aber erwartbare Verpflichtung (Nebenkosten-/Steuernachzahlung, Autoreparatur) | Schätzbetrag + Zeitfenster |
| **Freitopf** | Revolvierender Topf für unregelmäßige Ausgaben unbekannter Höhe (Klamotten); auch bewusstes Ansparen für einen großen Kauf | Laufender Saldo, **kein Reset, Zielwert optional** (frei/Wunsch). Wird nie „gekappt". |

Die drei (Rücklage, Rückstellung, Freitopf) sind Spielarten **eines** Topf-Konzepts:
laufender Saldo mit **optionalem, getyptem Zielwert** (keiner/Wunsch · Schätzung+Frist ·
Abschreibung). Töpfe sind **nicht** an Konten gebunden; sie werden durch Kontostände *gedeckt*
(→ Deckungs-Anzeige: "Ist mein Puffer eigentlich finanziert?"). Über-/Unterzahlung erscheint
als **globale Deckung** (Summe der Topf-Sollstände vs. liquides Geld) — weil ein Konto nur
eine Zahl ist und die Töpfe darin nicht zeigt; ein Topf mit eigenem Konto zeigt sie direkt.
Reicht das Geld nicht, geht die *freie Liquidität* ins Minus (zeigt Überplanung) — keine
Allokation, keine aktive Warnung.
Später ergänzbar: Kredite/Verbindlichkeiten.

### 3.3 Ströme — was Zahlungen erzeugt

| Konzept | Definition | Hinweise |
|---|---|---|
| **Vertrag** | Wiederkehrende Zahlung: Intervall, Betrag, Laufzeit, Kündigungsfrist | Umfasst auch **Einnahmen** (Gehalt, Kindergeld) und **Sparpläne**. Versicherungen sind Verträge. |
| **Budget** | Rahmen für variable Ausgaben einer Kategorie pro Periode | Erzeugt geglättete Plan-Abflüsse; **Reset zum Periodenende** (kein Übertrag). Saisonales *Ansparen* gehört in einen Topf, nicht ins Budget. |

**Zentrale Regel:** Die Zahlung eines Sparplan-Vertrags ist eine **Umschichtung**, keine Ausgabe —
liquiditätswirksam (Geld verlässt das Girokonto), aber nicht erfolgswirksam
(Vermögen bleibt gleich/steigt). Jeder Zahlungsstrom trägt daher den Charakter
`Aufwand | Ertrag | Umschichtung`.

### 3.4 Linsen — Sichten ohne eigene Daten

| Linse | Bedient sich aus | Zeigt |
|---|---|---|
| **Liquiditätsplan** | allen Plan-Zahlungen (Verträge, Budgets, Topf-Zuführungen) | Jahresverlauf je Konto/gesamt, Plan vs. Ist, Engpässe |
| **Vorsorge-Cockpit** | Verträgen (Versicherungen) + Anlagen | Person × Risikoart (BU, Haftpflicht, Alter, …) × deckende Verträge/Anlagen; Lücken; Zielgrößen (z. B. Rentenlücke). Linse **und** Tracker, aber kein eigenes Datensilo. |
| **Analysen** | allem, über Kategorien/Verträge/Budgets/Töpfe hinweg | Auswertungen quer und dediziert |

### 3.5 Querschnitt

- **Haushalt** — der eine Datenbestand (Tenant).
- **Person** — Mitglied des Haushalts, ab Tag 1 als Entität (auch bei nur einem Zugang).
  Zuordnungsdimension für Vorsorge, Konten-Inhaberschaft, Verträge.
- **Kategorie** — Querschnittsdimension über allen Strömen, Basis der Analysen.

## 4. Kernmechanik: Projektions-Engine

Der unifying Kern der App. Alles in Funktionalität A ist aus Sicht von Funktionalität B
ein **Zahlungsstrom-Erzeuger**:

1. Jede Quelle (Vertrag, Budget, Rücklage, Rückstellung) projiziert Plan-Zahlungen auf eine Zeitachse.
2. Der Liquiditätsplan aggregiert diese Ströme je Konto und gesamt.
3. Ist-Buchungen (Import/Bankanbindung) werden gegen Plan-Zahlungen gematcht → Plan/Ist-Abgleich.
4. Analysen und Vorsorge-Cockpit sind Auswertungen über denselben Datenbestand.

**Eine Projektions-Engine, viele Quellen.** Das ist die Core Domain — Vertragslisten und
CSV-Import kann jeder.

## 5. Buchhaltungsfundament: Buchungspackage + Schichtenmodell

Die App baut auf einem **separaten Buchungspackage** auf (eigenes Projekt), das Doppik und
KLR beherrscht und **GoBD-konform** arbeitet. Daraus ergibt sich eine harte Kontextgrenze.
**Zeitlich** wird das Package erst nötig, sobald echte Ist-Buchungen entstehen (Import →
Ist-Journal, Plan/Ist-Abgleich, Ist-Anteil im Liquiditätsverlauf); die Plan-Seite (Verträge,
Budgets, Töpfe, Inventar/Ansparrate, Projektion) ist app-seitig ohne es baubar — siehe § 5.2.

### 5.1 Was das Package liefert (und unverändert bleibt)

- **Ist-Journal:** append-only, Korrektur nur per Storno, Festschreibung, Audit-Trail.
  Hier landen ausschließlich Fakten — niemals Plan- oder Szenario-Daten.
- **Stichtags-Salden:** Saldo beliebiger Konten zu beliebigem Datum, gefiltert nach Dimensionen.
- **KLR-Dimensionen:** Kostenstelle ≈ Kategorie, Kostenträger ≈ Person/Zweck —
  liefert der App ihre Analyse-Achsen.
- **Kalkulatorischer Kreis / Abgrenzung:** kalkulatorische Buchungen (KLR-wirksam, nicht
  zahlungswirksam) — die Rücklagen-Ansparrate ist fachlich eine kalkulatorische Abschreibung.

### 5.2 Was die App selbst hält (Projektions-Kontext)

- **Plan- und Szenario-Buchungen** als eigenes Modell — im *Format* des Packages
  (Soll/Haben, Konten, Datum, Dimensionen; Published Language), aber **nie im GoBD-Buch
  gespeichert**. Sie sind Arbeitsmaterial: frei änderbar, regenerierbar, verwerfbar.
- **Erzeugungslogik:** Verträge, Budgets, Topf-Zuführungen → Planbuchungsströme.
  Das Package weiß nichts von Verträgen.
- **Plan/Ist-Matching:** App-seitig gespeicherte Verknüpfungen (auch n:m, z. B.
  Teilzahlungen), die auf Buchungs-IDs des Packages referenzieren.
- **Szenario-Isolation:** benannte, verwerfbare Schichten für What-if.
- **Plan-Salden** = Ist-Saldo (aus dem Package) + projizierte Deltas (App-Berechnung).

### 5.3 Wunsch an das Package (einziger Berührungspunkt)

Das **Rechenwerk** (Salden-/Aggregationslogik) als pure functions nutzbar machen,
anwendbar auf beliebige Buchungssätze — dann rechnen Plan-Schichten mit exakt derselben
Logik wie das Ist, ohne dass je etwas Unechtes ins GoBD-Buch geschrieben wird.
Trennung: *Rechenwerk* (wiederverwendbar) vs. *Aufbewahrung* (GoBD, nur Fakten).

### 5.4 Integritätsregeln

1. **Die Ist-Schicht ist heilig** — garantiert das Package (Storno-Prinzip, Festschreibung).
2. **Plan/Szenario sind physisch getrennt** — erzwungen per Architektur: sie existieren
   im GoBD-Buch gar nicht.
3. **Keine Vermischung per Default** — jede Auswertung benennt ihre Schichten explizit;
   ein reiner Ist-Abschluss ist jederzeit ohne Plan-Kontamination ziehbar.

## 6. Glossar & UI-Wording

→ Kanonisch in **UBIQUITOUS-LANGUAGE.md** (Fachbegriff → UI-Wording, Namensfalle, Begriffe je
Kontext). Dort zuerst pflegen.

## 7. Feature-Schnitt

### MVP (ein Rechner, ein Zugang)

1. Stammdaten: Haushalt, Personen, Konten, Kategorien
2. Vertragsverwaltung (inkl. Einnahmen, Kündigungsfristen-Erinnerung)
3. Rücklagenmanager (Inventarliste → Ansparraten) + Rückstellungen
4. Budgetplaner
5. Liquiditätsplaner (Jahresprojektion, Plan-only)
6. Ist-Daten per **CSV/CAMT-Import** + manuelles/regelbasiertes Kategorisieren
7. Plan/Ist-Abgleich, Basis-Analysen

### Ausbaustufe 2

- Anlagen + Vorsorge-Cockpit (Risiken, Lücken, Rentenlücke)
- Erweiterte Analysen
- Vertragserkennung aus Umsätzen (Periodizitätserkennung, deterministisch)

### Ausbaustufe 3

- **FinTS/HBCI-Anbindung** (direkt Client→Bank, ohne Drittanbieter)
- KI-Schicht (lokal)
- Mehrere Zugänge / Haushalts-Sync (lokaler Server)

## 8. Offene Punkte & Entscheidungen

| Thema | Stand |
|---|---|
| Plattform | ✓ **Entschieden (ADR-0001, 2026-06-13):** lokale Desktop-App, React + TypeScript, **Tauri**; portabler TS-Domänenkern (hexagonal) hält Server/Browser- und Mobile-Pfad offen. |
| Girokontoanbindung | PSD2-APIs brauchen lizenzierten Drittanbieter → ungeeignet für lokal. **FinTS/HBCI** geht direkt, erfordert als Produkt eine kostenlose Registrierung bei der Deutschen Kreditwirtschaft. Daher: CSV zuerst. |
| KI | Ausgearbeitet in **KI-KONZEPT.md** (vier Schichten: Erfassung, Befragung, Ambient, Agentisch; lokal via Ollama/llama.cpp; optional, nie Pflicht). |
| Sync/Mobile | Geparkt. Optionen: lokaler Server im Haushalt (bevorzugt), Datei-Sync (Syncthing/Nextcloud), CRDT. |
| Ambition | Produkt / Open Source → UX, Onboarding und Laien-Wording sind zentral, nicht nachgelagert. |
| Kredite | Noch nicht modelliert; passt später auf die Passiva-Seite. |
| Buchungspackage | Separates Projekt, GoBD-konform (Doppik + KLR). Anforderung aus dieser App: Rechenwerk als pure functions exponieren (§ 5.3). Plan/Szenario bleiben app-seitig. Erst zum Ist-Schritt eine echte Abhängigkeit — die Plan-Basis läuft ohne. |
| Topf mit eigenem Konto | UX-Frage: ob/wann ein eigenes (Unter-)Konto je Topf angeboten wird. Schaltet echte Pro-Topf-Funding-Disziplin frei (sonst gilt „Plan = Ist" + globale Deckung). Entscheidung 2026-06-13 (C). |
| Saisonaler Verbrauch | Saisonales *Ansparen* = Topf mit Frist (gelöst). Offen nur *saisonaler Verbrauch ohne Übertrag* (Winter-Heizkosten) → nicht-lineare Glättung, später. |
| Nebenbuch je Topf | Erfasste Earmark-Buchungen (kalkulatorisch) für präzise Funding-Disziplin — spätere Option, gegen „Plan = Ist" abgewogen. |
| UI-Wording | Vorschlag steht: Budget · Spartopf (+Sparziel) · Puffer · Ersatz · Vorsorge (§6). Final zu bestätigen. |
