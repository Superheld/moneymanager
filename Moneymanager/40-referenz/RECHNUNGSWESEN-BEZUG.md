# Moneymanager — Bezug zum Rechnungswesen (Begründungsschicht)

> **DDD-Ebene:** Referenz — Begründung/Foundation · **Status:** tragend · **Stand:** 2026-06-13 · **Bezüge:** KONZEPT, DOMAENENDESIGN

> Stand: 2026-06-13 · Warum die App so modelliert ist, wie sie modelliert ist.
> Liegt fachlich *unter* KONZEPT.md und dem Glossar: Sie begründet, welche Konzepte
> erfolgreicher Unternehmen übertragen werden, welche bewusst nicht, und wo die Analogie
> strukturell endet. Diskussionsergebnis Bruce × Claude.

## 1. Leitthese

Die App importiert **nicht** die externe Bilanzwelt des HGB (die ist für Gläubiger und
Finanzamt gebaut), sondern die **interne Steuerungswelt**: Kosten- und Leistungsrechnung
(KLR) plus Controlling. Das HGB liefert die *Maschinerie und das Vokabular* (doppelte
Buchführung, Buchungssatz, Rückstellung, Abschreibung, Periodenabgrenzung); KLR und
Controlling liefern den *Zweck* — intern steuern, vorausplanen, ehrlich bewerten.

> **Mechanik vom HGB, Haltung von der KLR, den Gläubiger-/Steuer-Ballast weglassen.**

Das ist die präzise Lesart von „bewährte Konzepte erfolgreicher Unternehmen auf den
Privathaushalt übertragen". Es ist auch der Grund, warum klassische Budget-Apps flach
wirken: Sie modellieren nur die Cash-Sicht — eines von vier Rechenwerken.

## 2. Konzept-Mapping

| Haushalts-Konzept (App) | Herkunft im Rechnungswesen | Worum es geht |
|---|---|---|
| Konten + Anlagen vs. Töpfe | **Bilanz** (Aktiva vs. Passiva) | Was gehört mir *frei*? Töpfe sind Ansprüche gegen mein Geld |
| Charakter: Aufwand \| Ertrag \| **Umschichtung** | **GuV** + Buchungsarten (Aktivtausch) | Sparen ist kein Verbrauch — erfolgswirksam ≠ liquiditätswirksam |
| Liquiditätsplan | **Finanz-/Liquiditätsrechnung** (Kapitalflussrechnung) | Bin ich zahlungsfähig? (≠ profitabel) |
| Rücklage / Ansparrate (Inventar) | **kalkulatorische Abschreibung** (KLR) | Monatliche Selbstbelastung für Verschleiß, ohne Geldfluss |
| Rückstellung (Reparatur, Steuer) | **§249 HGB** (ungewisse Verbindlichkeit) | Vorsichtsprinzip: Wahrscheinliches vorwegnehmen |
| Glättung (Jahresprämie ÷ 12) | **Periodenabgrenzung** (§252 HGB) | Aufwand der Periode zuordnen, nicht dem Zahlungsmonat |
| Kategorie / Person | **Kostenstelle / Kostenträger** (KLR) | Auswertungsachsen: wo / wofür angefallen |
| Ist-Journal, Festschreibung, Storno | **GoB/GoBD + Doppik** | Integrität: nachträglich unmanipulierbar |
| Plan/Ist-Abgleich, Szenarien | **Controlling** (Soll-Ist, Plankostenrechnung) | Steuern statt nur nachsehen |

## 3. Die vier Rechenwerke — und dass Haushalte nur eines führen

Ein Unternehmen beantwortet getrennt vier Fragen; ein Privathaushalt fast immer nur die
halbe erste:

1. **Bin ich zahlungsfähig?** → Finanz-/Liquiditätsrechnung → App: Liquiditätsplan.
2. **Lebe ich über meine Verhältnisse?** → GuV/Erfolgsrechnung → App: Charakter (Aufwand
   vs. Umschichtung), gelesen als **Vermögensentwicklung**, nicht als Gewinn.
3. **Was bin ich wert?** → Bilanz → App: „heimlich eine private Bilanz" (KONZEPT §1).
4. **Was kostet mich was wirklich?** → KLR → App: kalkulatorische Ansparraten, Kategorien.

Profitable Firmen gehen pleite, weil sie illiquide werden — deshalb hält man die Sichten
auseinander. Eure App baut alle vier; das ist der Differenzierer.

## 4. Die zwei schärfsten Importe

**Aufwand vs. Umschichtung.** Ein Unternehmen verwechselt nie „Geld ausgegeben" mit
„Aufwand". Ein ETF-Sparplan ist ein **Aktivtausch** (Geld → Wertpapier): liquiditätswirksam,
aber nicht erfolgswirksam — das Vermögen bleibt gleich. Budget-Apps buchen das als Ausgabe.
Das `Charakter`-Feld ist die formale Korrektur dieses Fehlers.

**Kalkulatorische Abschreibung.** Eine Firma bucht Abschreibung auf die Maschine, obwohl
kein Cent fließt, damit am Ende Geld für die Ersatzmaschine da ist. Die Rücklage/Ansparrate
fürs Inventar ist genau das. Feinheit: Die HGB-*Bilanz* schreibt auf historische
*Anschaffungskosten* ab; die App nimmt den **Wiederbeschaffungswert** — und das ist exakt
die *KLR*-Variante (kalkulatorische Abschreibung rechnet bewusst mit Wiederbeschaffung, um
Inflation einzufangen). Bestätigt die Wahl der Steuerungs-, nicht der Steuerrechnung.
(Vgl. die Namenskollision-Analyse in BEOBACHTUNGEN.md, 2026-06-13.)

## 5. Wo die Analogie bricht — und ihr bewusst abweicht

### 5.1 Going Concern vs. endlicher Lebenszyklus *(der strukturelle Bruch)*

Das HGB unterstellt **Unternehmensfortführung** (Going-Concern, §252 Abs. 1 Nr. 2): der
Betrieb läuft unbegrenzt weiter. Hört er auf, Einnahmen zu erzeugen, wird er **abgewickelt**
(Liquidationsbilanz) — ein geordneter, legitimer Endzustand.

**Für einen Menschen / Haushalt ist das keine Option.** „Kein Einkommen mehr" ist keine
Abwicklung, sondern Existenzbedrohung. Daraus folgt eine Zeitstruktur, die kein Unternehmen
in dieser Form hat:

- **Erwerbsphase** (Einkommen > Konsum, Akkumulation) →
- **Entsparphase / Ruhestand** (Einkommen endet planmäßig, Konsum läuft weiter,
  Dekumulation) — das *exakte Gegenteil* eines Going Concern.
- Dazu **unfreiwillige Einkommensabbrüche** (Arbeitslosigkeit, Berufsunfähigkeit, Tod mit
  Hinterbliebenen), die abgesichert werden müssen.

Ökonomisch ist das die **Lebenszyklushypothese** (Modigliani): Konsum über ein *endliches*
Leben glätten. Und das Konzept **Humankapital** (Becker): Das größte Aktivum eines jungen
Menschen ist die künftige Erwerbsfähigkeit — sie steht in keiner Bilanz, und genau sie
versichert die Vorsorge (BU, Risiko-LV). Mit dem Alter wandelt sich Humankapital in
Finanzkapital; Vorsorge steuert diese Umwandlung und versichert ihre Risiken.

**Konsequenz fürs Modell:** Vorsorge hat *keinen* Platz in den vier Rechenwerken, weil die
alle Fortführung unterstellen. Sie braucht eine eigene **Lebenszyklus-Sicht** und ist
deshalb zu Recht ein **eigener Bounded Context** (DOMAENENDESIGN: Vorsorge = Core, Stufe 2),
kein Anhängsel der Bilanz. Der einzige echte Unternehmens-Anklang ist die
**Pensionsrückstellung** (§249 HGB): Da provisioniert eine Firma *aktuarisch* für das
Einkommensende *ihrer Mitarbeiter*. Die *Technik* (versicherungsmathematisches Abzinsen
künftiger Verpflichtungen) ist borgbar — nur wendet die Firma sie auf andere an, der
Haushalt auf sich selbst (Earner und Begünstigter in Personalunion).

### 5.2 Gewinn ist nicht das Ziel → Vermögensentwicklung *und* Absicherung

Eine Firma maximiert Profit. Ein Haushalt maximiert Sicherheit und Lebensqualität bei
tragbarem Mittelabfluss. Die „GuV" des Haushalts liest man nicht als Gewinn, sondern als
**Sparquote / Vermögensentwicklung** — gemessen *gegen den Lebenszyklus-Bedarf*
(Rentenlücke). Die Bilanz wird damit von der Stichtags-Momentaufnahme für Gläubiger zur
**Zeitreihe auf ein Ziel hin**.

Aber **Vorsorge geht nicht in der Vermögensentwicklung auf.** Sie hat **zwei Beine**:
*Vermögensaufbau* (Finanzkapital ansparen) **und** *Risikotransfer durch echte Verträge*
(BU, Risiko-LV, Rente, Haftpflicht). Eine BU-Police hat fast keinen Vermögenswert, aber
riesigen Vorsorgewert — angespartes Vermögen kann sie nicht ersetzen, solange das
Finanzkapital die Lücke nicht selbst tragen kann. Vorsorge misst sich deshalb als
**Deckung vs. Lücke**, nicht als Saldo. Genau darum ist sie ein eigener Kontext
(Risiko × Deckung × Lücke, DOMAENENDESIGN) und keine Kennzahl der Bilanz. „Gewinn allein
ist nicht Vorsorge."

### 5.3 Kein externer Adressat → konservative Bewertung entfällt

Das HGB ist vorsichtig (Niederstwertprinzip, Anschaffungskostendeckel), weil es Gläubiger
und Fiskus schützt. Ein Haushalt hat dieses Publikum nicht; die GoBD-Strenge im
Buchungspackage dient der *eigenen* Integrität, nicht einer Abgabepflicht. Also dürfen die
konservativen Bewertungsregeln fallen.

### 5.4 Anlagen zum Zeitwert statt zu Anschaffungskosten

Für echtes Reinvermögen zählt, was das Depot **heute** wert ist — Verkehrs-/Zeitwert (näher
an IFRS-Fair-Value) statt HGB-Anschaffungskosten. Wieder gewinnt das passendere Framework.

## 6. Quintessenz

HGB/Doppik geben die *präzise Sprache und die unbestechliche Buchungsmechanik*; KLR und
Controlling geben den *Zweck* (steuern, planen, ehrlich bewerten). Die App nimmt die
Mechanik des einen und die Haltung des anderen — und ergänzt, was Unternehmen gar nicht
brauchen: eine **Lebenszyklus-/Vorsorge-Sicht**, weil ein Mensch nicht abgewickelt wird.
Das ist keine Buzzword-Übertragung, sondern eine bewusste Auswahl aus drei Frameworks
(HGB-Bilanz, KLR/Controlling, Versicherungsmathematik) je nach Frage.

| Frage des Haushalts | Geliehen von |
|---|---|
| Bin ich zahlungsfähig? Was ist mein Vermögen? | HGB-Bilanz + Finanzrechnung (Mechanik) |
| Was kostet mich was? Lebe ich über Verhältnisse? Steuere ich? | KLR + Controlling (Haltung) |
| Bin ich gewappnet, wenn das Einkommen endet — vorübergehend oder für immer? | Versicherungsmathematik / Lebenszyklus (eigener Kontext) |
