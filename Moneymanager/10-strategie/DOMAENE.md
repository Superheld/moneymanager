# Domäne: Persönliche Finanzverwaltung (Arbeitstitel)

> **DDD-Ebene:** Strategisch — Domänenmodell (Redesign) · **Status:** provisorisch, aber präzise · **Stand:** 2026-07-19 · **Bezüge:** ersetzt das Modell v1 (siehe 90-archiv/2026-06-modell-v1/)
>
> **Status: provisorisch, aber präzise.** Jede Aussage hier ist der aktuelle Stand des Modells und darf sich durch tiefere Einsicht ändern. Vage darf sie nicht sein.
>
> Erarbeitet im Dialog Bruce ⇄ Claude.

## 1. Zweck

Lokal laufende, werbefreie persönliche Finanzverwaltung. Kernmotivation neben der Fachlichkeit: Lernprojekt für KI-getriebene Software — nicht KI als angeschraubtes Feature, sondern die App von der KI her gedacht.

Leitidee: Die App ist eine Menge fachlicher Operationen mit zwei gleichberechtigten Bedienern — Mensch (UI) und Sprachmodell (Chat). Invarianten leben im Kern und gelten für beide. Zugleich ist die App der große Kontext des Sprachmodells: Zustand, Historie und Korrekturen bilden sein Arbeitsgedächtnis.

**USP (Beschluss 2026-07-19):** Die KI entscheidet selbst — Zuordnungen, Prognosen, Anpassungen. Der Nutzer steigt nach; jede Korrektur ist Override und Trainingssignal zugleich. Die UI ist primär das Fenster auf die Arbeit der KI mit den Daten. Alle Daten und alle Nutzeränderungen sind Kontext der KI.

## 2. Fachsprache (Entwurf — noch keinem Bounded Context zugeordnet)

| Begriff | Bedeutung |
|---|---|
| **Buchung** | Einzelner Umsatz auf einem Konto (importiert oder manuell). |
| **Kategorie / Hauptkategorie** | Beschreibende Einordnung einer Buchung. Universell, dient Übersicht und Analyse. Hierarchisch (Hauptkategorie → Unterkategorien). |
| **Budget** | Ausgabenrahmen je Hauptkategorie. Zwei Arten: **aufbauendes Budget** (sammelt an, unregelmäßige Entnahme — z. B. Klamotten) und **periodisches Budget** (monatlicher Reset — z. B. Lebensmittel). Horizont: binnen Jahresfrist. Verhaltensbasiert — die Erwartung dazu wird *gelernt*. |
| **Inventargegenstand** | Erfasstes Gut (Computer, Waschmaschine …) mit Anschaffungspreis/-datum, Nutzungsdauer, Restwert/Wiederbeschaffungswert. |
| **Rücklage** | Ansparung, hart an einen Inventargegenstand gebunden; als virtueller Topf auf einem realen Konto geführt. Horizont: mehrjährig. Fälligkeit wird aus harten Fakten *errechnet* (Abschreibung), nicht geschätzt. |
| **Fälligkeitsplan** | Errechnete mehrjährige Vorschau: was könnte wann fällig werden — gespeist aus Abschreibungen (Rücklagen) und Vertragsterminen. |
| **Vertrag** | Wiederkehrende Zahlungsverpflichtung mit Empfänger, Betrag, Periodizität, perspektivisch Laufzeit/Kündigungsfrist. |
| **Ziel** | Vom Nutzer gesetzter Budgetwert. Normativ. Ändert sich nur durch bewusste Entscheidung. |
| **Ist** | Gemessene tatsächliche Ausgaben. Keine Pflege nötig — Messung. |
| **Erwartung** | KI-gepflegte Prognose der realistischen Ausgaben je Hauptkategorie. Eigenständig gerechnet (Saisonalität, anstehende Vertragszahlungen, Trends, geplante Einmaleffekte) — ausdrücklich **kein** rollierender Durchschnitt. |
| **Simulation / Szenario** | Deterministische Durchrechnung von Was-wäre-wenn-Fragen (Sparrate, Budget-, Vertragsänderungen). Die Erwartung ist die Simulation unter der Annahme „alles bleibt, wie es ist". |
| **Finden vs. Entscheiden** | Architekturprinzip: Finden und Entscheiden sind getrennte, benannte Stellen im System. *Revidiert 2026-07-19:* Standard-Entscheider ist die **KI**; der Nutzer steigt nach (Override). Vorgeschlagene Grenze: gilt für reversible Entscheidungen; irreversible Operationen kehren den Standard um — *Grenze noch unbestätigt.* |
| **Entscheidungsjournal** | Lückenlose, chronologische Dokumentation aller KI-Entscheidungen samt Begründung. Zugleich Rechenschaft, Rückgängig-Grundlage und Trainingsdatenquelle. Ersetzt jede Verifikation: **Dokumentation statt Verifikation** — kein Freigabe-Gate. |

### Rollen der KI

1. **Bediener** — der Chat ruft dieselben Fachoperationen auf wie die UI (Driving Adapter).
2. **Entscheider** *(revidiert, vormals „Vorschlagsgeber")* — Classifier, Vertragserkennung, Beleg-Extraktion, Anomalien: die KI ordnet zu und entscheidet selbst; sie hat dafür dieselben Möglichkeiten wie ein Mensch (voller Datenkontext).
3. **Korrektiv** — unbestechlicher Dritter gegen Wunschdenken: pflegt die Erwartung, konfrontiert Ziel vs. Erwartung, meldet sich proaktiv.

### Drei Quellen der Zukunft

Die Vorausschau der Haushaltsführung speist sich aus drei Quellen absteigender Härte:

1. **Fixiert** — Verträge: Betrag und Termin stehen fest.
2. **Kalkuliert** — Rücklagen: Fälligkeiten aus Abschreibungsplänen errechnet, mehrjährig.
3. **Gelernt** — Budgets: Erwartung aus Verhalten geschätzt, binnen Jahresfrist.

Erwartung, Fälligkeitsplan und Simulation kombinieren alle drei.

## 3. Invarianten & Regeln (provisorisch)

1. **Verträge belasten niemals Budgets.** Harte Invariante, gilt für alle Bediener.
2. Eine Buchung gehört zu **höchstens einem** von beiden: Budget-relevant *oder* Vertrag — möglicherweise zu keinem (Umbuchungen, Einnahmen, bewusst ungebudgetete Einmalausgaben).
3. Die Budget-Belastung leitet sich aus der Kategorie ab (Hauptkategorie → Budget, fest), sofern Regel 1/2 nicht greifen. Keine separate Budget-Zuweisung pflegen.
4. Ziel, Ist und Erwartung sind drei getrennte Werte je Hauptkategorie. Fortschritt = Annäherung der Erwartung an das Ziel (Lücke als Trend), nicht „Budget gerissen ja/nein".
5. Die Erwartung wird von der KI eigenständig gerechnet und ist vom Nutzer nicht editierbar — überstimmbar in der Konsequenz, aber nicht zum Schweigen zu bringen.
6. Simulation rechnet deterministisch. Das Sprachmodell übersetzt in Parameter und erklärt Ergebnisse — es rechnet nicht selbst.
7. Jede KI-Entscheidung ist **sichtbar, begründbar und revidierbar** — aber durch nichts blockierbar: kein Freigabe-Gate. Dokumentation im Entscheidungsjournal ersetzt Verifikation. Nutzerkorrekturen fließen als Lernsignal zurück. („Was ich sehe, ist das, was die KI mit meinen Daten macht.")

## 4. Featureideen mit ML-Bezug (gesammelt, ungewichtet)

- Kategorien-Classifier (kleines lokales Modell/Embeddings) mit **Korrektur-Lernschleife** als zentralem Designelement (Active Learning; jede Nutzerkorrektur ist ein Trainingsdatum)
- Händler-Normalisierung (rohe Buchungstexte → kanonische Händler) als Vorstufe für alles Weitere
- Vertragserkennung (Periodizität + Empfänger + Betrag) — bewusst auch als Vergleich Algorithmus vs. Netz
- Anomalien: Preiserhöhung erkannt, Doppelabbuchung, untypische Ausgabe (Statistik zuerst)
- Belege: OCR → strukturierte Extraktion → Matching Beleg ⇄ Buchung (VLM)
- Frühwarnung im Monatsverlauf statt Feststellung am Monatsende
- Monats-Retro (Plan vs. Ist, erzählt vom LLM über deterministischen Fakten), Beschluss im Chat
- Kalibrierungs-Tracking: Güte der eigenen Budgetschätzungen als Metrik
- Precommitment-Check: Simulation der Folgen vor geplanter Anschaffung
- Kündigungsfrist-Radar: Meldung vor stillschweigender Verlängerung
- Hybrid Regeln ⇄ Classifier: Regeln schlagen Classifier; Korrekturen können zu Regeln erstarren

## 5. Subdomänen & Bounded Contexts

**Gesetzt (Bruce):** Der Kern ist die KI-Autonomie — die KI führt die Bücher, der Nutzer führt Aufsicht.

Core-Subdomäne (**bestätigt 2026-07-19**): **Autonome Haushaltsführung** — Zuordnen, Erwartung rechnen, Auffälligkeiten erkennen, Anpassungen vornehmen, inklusive Korrekturschleife als Lernmechanik und Entscheidungsjournal.

Klar Generic: FinTS-Anbindung, CSV/Excel-Import, OCR-Technik (Texterkennung selbst, nicht die fachliche Verwertung).

Offen: Einordnung von Budgetierung (Ziel/Ist/Erwartung), Verträgen, Simulation, Analyse — Supporting oder Teil des Kerns?

**Kandidat (neu, unbestätigt): Vermögen / Bestandsrechnung.** Erweiterung von reiner Stromrechnung (Buchungen, Budgets = Geldflüsse) um Bestandsgrößen: Inventar mit Abschreibungen und Restwerten, Rücklagen (als virtuelle Töpfe an ein reales Konto gebunden), Depot/Wertpapiere. Invarianten-Kandidat: Summe der Rücklagen eines Kontos ≤ Kontosaldo. Abschreibungspläne speisen die Erwartung (anstehende Ersatzbeschaffungen sind prognostizierbar).

**Sortierung (vorgeschlagen 2026-07-19, unwidersprochen — vor dem Kontextschnitt bestätigen):**

- **Core:** Autonome Haushaltsführung (bestätigt).
- **Kern-nah:** Budgetierung (Ziel/Ist/Erwartung — keine Stangenware) · Simulation/Planung (Rechenarm der KI, teilt Maschinerie mit der Erwartung).
- **Supporting:** Verträge · Analyse/Auswertung · Vermögen (Inventar, Rücklagen, Depot).
- **Generic:** FinTS-Anbindung · CSV/Excel-Import · OCR-Technik.

## 6. Produktoberfläche (erste Skizze)

Gestaltungsprinzip: clean, werbefrei, nichts wird versteckt (Anti-Finanzguru). Die UI ist das Fenster auf die Arbeit der KI — inklusive sichtbarem Entscheidungsjournal.

- **Einstieg: Kontenverwaltung** — alle Konten, gruppierbar, aktueller Überblick.
- **Dashboard** — Gesamtüberblick, ggf. noch vor der Kontenverwaltung.
- Bereiche: **Verträge** · **Budgets** · **Analyse/Auswertung** · **Planung/Simulation** · **Inventar/Rücklagen** · **Depot**.
- **Chat** durchgängig verfügbar (Bediener-Rolle), Datei-/Belegupload inkl. Foto (OCR).

## 7. Context Map

*[Folgt nach dem Kontextschnitt.]*

## 8. Offene Fragen

- Kontextstrategie: „Alles ist Kontext für die KI" — wie wird das bei endlichen Kontextfenstern eingelöst (Aggregation, Retrieval, Journal als Gedächtnis)? Bewusst noch nicht taktisch beantwortet.
- Grenze der KI-Entscheidungsautonomie: Gilt „KI entscheidet, Nutzer steigt nach" uneingeschränkt — oder nur für reversible Operationen (Kriterium vorgeschlagen, unbestätigt)?
- Vermögen/Depot: reines Tracking (Supporting) oder mehr? Reichweite der KI-Autonomie dort ungeklärt.
- Budgets später über mehrere Kategorien bündelbar? (Bewusst zurückgestellte Lockerung.)
- Wie schlägt die KI aus der Ziel-Erwartungs-Lücke Zwischenziele vor? (Idee angerissen, nicht ausgearbeitet.)
- Beleg-Erfassung per Foto: Aufnahme mit dem Handy, Verarbeitung lokal — wie kommen Handy und Desktop zusammen? Hängt an der Deployment-Frage: Was heißt „lokal" genau (eigener Server im Heimnetz? Desktop-App? Mobilzugriff)? *Berührt ADR-0001 (Tauri) — bei der Deployment-Entscheidung prüfen, ob ADR-0001 Bestand hat.*

**Entschieden:**

- Kontoanbindung: FinTS (Zugang beantragt) + Import für CSV/Excel.
- Rücklage ≠ aufbauendes Budget. Kriterium: Rücklage ist gut-gebunden, mehrjährig, *errechnet*; Budget ist verhaltensbasiert, binnen Jahresfrist, *gelernt*.
- **Doppik/summae: bewusst draußen (2026-07-19).** „Buchung" ist ein Kontoumsatz, kein Buchungssatz; das Modell hat keinen Ledger-Unterbau mehr. Modell-v1-Doku dazu archiviert (90-archiv/2026-06-modell-v1/), ADR-0002/0003 als superseded markiert. summae bleibt als eigenständiges Projekt bestehen, ist aber kein Upstream-Kontext dieser App.

## 9. Arbeitsstand & nächste Schritte

Dieses Dokument ist das vollständige Gedächtnis der Session vom 2026-07-19 und als Übergabe in dieses Projektverzeichnis eingepflegt — es ist ohne den Chatverlauf lesbar.

**Erledigt:** Zielklärung · Fachsprache (Entwurf) · Invarianten · KI-Rollen und Autonomie-Beschluss · Marktblick ML (Abschnitt 4) · Core-Subdomäne bestätigt · Sortierung vorgeschlagen · Altdoku (Modell v1) archiviert.

**Nächste Schritte, in dieser Reihenfolge:**

1. Sortierung (Abschnitt 5) bestätigen oder korrigieren.
2. **Bounded Contexts schneiden.** Leitfrage je Begriff: Bedeutet „Buchung" (etc.) überall dasselbe? Wo die Bedeutung kippt, verläuft eine Kontextgrenze. Kandidaten prüfen: Haushaltsführung, Vermögen, Planung, Import.
3. **Context Map** zeichnen: Beziehungen, Übersetzungsstellen (ACL gegen FinTS/Import-Formate), Richtung der Abhängigkeiten.
4. Erst danach taktisch: Aggregate, Stories/Slices (Walking Skeleton), Technologie- und Deployment-Entscheidung („lokal" präzisieren — löst auch die Foto/Sync-Frage).
5. Offene Fragen (Abschnitt 8) dabei laufend abräumen.
