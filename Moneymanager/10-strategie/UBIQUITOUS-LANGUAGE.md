# Moneymanager — Ubiquitous Language (kanonisch)

> **DDD-Ebene:** Strategisch — Sprache · **Status:** verbindlich · **Stand:** 2026-06-13
> **Kontext:** alle · **Bezüge:** DOMAENENDESIGN, KONZEPT, alle TAKTIK-*
> Einzige Quelle der Wahrheit für Begriffe. Fachsprache **intern**, UI-Wörter **außen**
> (§3). Bei Sprachänderungen ändert sich das Modell — hier zuerst pflegen.

## 1. Begriffe je Bounded Context

Innerhalb eines Kontextes hat jedes Wort **eine** Bedeutung. Über Kontexte hinweg darf
dasselbe Wort Verschiedenes meinen — das löst §2 auf.

### Ledger *(= Buchungspackage, separates Projekt)*
Buchung, Buchungssatz, Soll/Haben, **Sachkonto**, Kontenrahmen, Storno, Festschreibung,
Saldo, Stichtag, Kostenstelle, Kostenträger, kalkulatorische Buchung.

### Planung *(Core)*
**Zahlungsregel** (aus Vertrag abgeleitet: Intervall, Betrag, Quelle/Ziel), **Planbuchung**
(berechnet, nie persistiert), **Schicht** (plan | szenario), **Budget** (Reset zum
Periodenende), **Topf** (gemeinsame Abstraktion, **Zielwert optional**), **Rücklage** (Zielwert
aus Abschreibung), **Rückstellung** (Schätzbetrag, Zeitfenster), **Freitopf** (laufender Saldo,
kein/Wunsch-Ziel), **Deckung/freie Liquidität**, Liquiditätsverlauf, **Matching**
(Planbuchung ↔ Istbuchung, n:m), Szenario, **Charakter** (Aufwand | Ertrag | Umschichtung).

### Stammdaten *(Supporting)*
**Vertrag** (Dokument: Anbieter, Laufzeit, Kündigungsfrist, Anhänge), **Inventargegenstand**
(Wiederbeschaffungswert, Nutzungsdauer), **Zahlungskonto** (Giro, Tagesgeld, Bargeld), Person,
Kategorie, später **Anlage** (Wertstand).

### Import *(Generic/Supporting)*
**Umsatz** (roher Bankdatensatz), Import-Lauf, Duplikat, **Regel** (Kategorisierung),
**Kategorisierungsvorschlag** (Status: vorgeschlagen | bestätigt).

### Vorsorge *(Core, Stufe 2)*
**Risiko** (BU, Haftpflicht, Alter, …), **Deckung** (Vertrag/Anlage deckt Risiko für Person),
**Lücke**, **Zielgröße** (z. B. Rentenlücke). Vorsorge = zwei Beine: Vermögensaufbau **und**
Risikotransfer durch Verträge (siehe RECHNUNGSWESEN-BEZUG §5).

## 2. Aufgelöste Mehrdeutigkeiten

| Wort | Kontext → Bedeutung |
|---|---|
| **Vertrag** | Stammdaten → Dokument · Planung → Zahlungsregel · Vorsorge → Deckungsinstrument |
| **Konto** | Stammdaten → Zahlungskonto (Bank) · Ledger → Sachkonto im Kontenrahmen. Mapping: jedes Zahlungskonto → genau ein Sachkonto. |
| **Buchung** | Ledger → festgeschriebenes Faktum · Planung → Planbuchung (Arbeitsmaterial) |

## 3. Fachbegriff → UI-Wording (verbindlich)

Das Domänenmodell nutzt präzise Rechnungswesen-Begriffe; die UI übersetzt sie konsequent.
Verbindliches UI-Set: **Budget · Spartopf (+Sparziel) · Puffer · Ersatz · Vorsorge.**

| Fachbegriff (Code/Modell) | UI für Laien |
|---|---|
| Rücklage | **Ersatz** (Spartopf für Wiederbeschaffung) |
| Rückstellung | **Puffer** (für Überraschungen) |
| Freitopf | **Spartopf** (frei); „Sparziel" bei gesetztem Wunschziel |
| Budget | **Budget** (monatlicher Rahmen, Reset) |
| Vorsorge | **Vorsorge** (Absicherung + Anlage) |
| Abschreibung / Ansparrate | Ansparrate |
| Liquidität | Verfügbares Geld |
| Umschichtung | Sparen/Anlegen (kein Verbrauch) |
| Deckung / freie Liquidität | „Ist mein Puffer finanziert?" |
| Aktiva / Anlage | Vermögen |

## 4. Namensfalle (wichtig)

„Rücklage" und „Rückstellung" sind im **Alltagsdeutsch oft gegensätzlich** besetzt (viele
sagen „Rücklage" fürs Unvorhergesehene) und im **strengen HGB** nochmals anders. Diese
Fachbegriffe erscheinen deshalb **nie** in der UI — dort gelten nur die rechten Wörter aus §3.
Stabiler Anker ist die **Mechanik**: abschreibbar (Ersatz) vs. ungewiss (Puffer) vs.
revolvierend/ziellos (Spartopf). Herleitung: BEOBACHTUNGEN, RECHNUNGSWESEN-BEZUG.
