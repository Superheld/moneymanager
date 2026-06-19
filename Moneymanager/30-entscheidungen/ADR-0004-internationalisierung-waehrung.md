# ADR-0004 — Internationalisierung: währungs- und sprachneutraler Kern, eine Währung pro Haushalt

> **DDD-Ebene:** Entscheidung — ADR-Serie · **Status:** Vorgeschlagen · **Stand:** 2026-06-19 · **Bezüge:** KONZEPT, ARCHITEKTUR, README, design-system-Glossar, ADR-0001, ADR-0002, ADR-0003

> Status: **Vorgeschlagen** · 2026-06-19 · Entscheider: Bruce + Claude
> Format: Kontext → Entscheidung → Begründung → Konsequenzen → Abgrenzung → Folgeentscheidungen.

## Kontext

- **Ziel: mehr Menschen sollen die App nutzen können** — heute ist sie deutsch-only und
  EUR-fest verdrahtet.
- **Sprache steckt nirgends abstrahiert.** Es gibt keine Label-/i18n-Schicht; Enum-Werte
  (`Aufwand|Ertrag|Umschichtung`) werden direkt als Anzeige gerendert, ~300–400 deutsche
  Strings hängen inline in den ~13 Screens.
- **Geld ist EUR-fest.** `core/geld.ts` nutzt Integer-Cent mit fester Skala 2 und
  hartem `"de-DE"`; es gibt keine Settings-/Config-Tabelle.
- **Die einzige echte Deutschland-Fessel ist FinTS** (Bank-Standard) — und das ist ein
  *Import-Adapter*, kein Kern-Bestandteil. Ohne FinTS (manuell/CSV) ist die App
  länderunabhängig nutzbar.
- **Es gibt keine Steuer-/Jurisdiktionslogik.** Kein USt, keine EÜR, kein Abschluss. Der
  Kern ist Projektion/Töpfe/Liquidität — **kulturneutrale Arithmetik**. Währung + Sprache zu
  lokalisieren zieht daher *keine* Jurisdiktions-Semantik nach.

## Entscheidung

1. **Kern bleibt währungs- und sprachneutral.** Sprache, Locale und Währung sind
   Rand-Belange (UI + eine Settings-Zeile), nicht Domäne. `core` bleibt pure und
   parametrisiert (Währung/Locale als Argument, nie hartcodiert).

2. **Eine Währung pro Haushalt.** Beim Setup einmal gewählt, gilt überall. Beträge bleiben
   **ganzzahlige Minor Units**, aber die **Skala richtet sich nach der Währung**
   (EUR/USD/GBP = 2, JPY/KRW = 0, KWD = 3). **Kein FX, keine gemischten Konten.**

3. **Sprache über eine Label-/Übersetzungsschicht** (`react-i18next` als bewährter
   Standard). **Gespeicherte Enum-Werte bleiben Code-Konstanten** — nie übersetzt, nie
   umgespeichert (Determinismus, keine Migration). Die UI bildet `(locale, enumWert) →
   Label` ab. Diese Schicht dient zugleich dem Entschärfen des Buchhalter-Jargons
   („Charakter" etc. → freundliches Label).

4. **Glossar pro Sprache ist redaktionelle Arbeit.** „Spartopf"/„Puffer" sind *gestaltete
   Metaphern*, keine zu übersetzenden Wörter. Jede Zielsprache braucht ihre eigene
   Alltagsvokabel (EN-Beispiele: sinking fund, rainy-day fund, buckets/envelopes). Das ist
   Produkt-/Copy-Arbeit, keine Library-Aufgabe.

5. **FinTS = optionaler deutscher Import-Adapter** hinter der Import-Grenze — neben anderen
   (CSV, andere Länderformate, manuelle Erfassung). **Nie in den Kern sickern lassen.**

6. **Formatierung über `Intl`** (`NumberFormat`/`DateTimeFormat`), gespeist aus Währungscode +
   Locale der Settings-Zeile. Das hartcodierte „€"-Suffix in der UI weicht dem Währungssymbol.

## Begründung

- Die **kleinste Fläche für den größten Effekt**: Eine Währung pro Haushalt deckt „mehr
  Menschen" zu ~95 % ab (ein Haushalt wirtschaftet real in *einer* Währung) — zum Bruchteil
  des FX-Aufwands. Konsistent mit summae (eine `baseCurrency` pro Mandant, Fremdwährung abgelehnt).
- **Integer-Minor-Units überleben** — wir hören nur auf, „÷100" und „de-DE" zu verdrahten.
- **Trennung sauber:** Was an Deutschland fesselt (FinTS), bleibt ein Adapter; der Kern wird frei.
- Die Label-Schicht ist **doppelt nützlich** (i18n + Jargon-Kosmetik) — einmal gebaut, zwei Ziele.

## Konsequenzen

**Positiv:** länder-/sprachoffen ohne Jurisdiktions-Ballast; Geld-Modell bleibt stabil;
Label-Schicht räumt nebenbei den Jargon auf; FinTS später additiv statt blockierend.

**Preis / negativ:** eine neue Settings-Zeile (erste Nicht-Buchungs-Migration);
Skala-≠-2-Fälle (JPY/KWD) müssen in Parsing/Formatierung sauber behandelt werden; ab jetzt
trägt jeder neue UI-String i18n-Pflege (→ Mittelweg, s. u.); EN-Glossar ist echte
redaktionelle Arbeit, kein `t()`.

## Abgrenzung (NICHT Teil dieses Schritts)

- **Kein FX / keine gemischten Währungen** pro Haushalt (Wechselkurse, Umrechnung) — geparkt.
- **Kein FinTS** jetzt; nur die Import-Grenze sauber halten, damit es additiv andockt.
- **Keine Steuer-/Jurisdiktions-Semantik** (USt, EÜR, Jahreskonventionen) — haben wir nicht,
  bauen wir hier nicht.

## Folgeentscheidungen / Bauplan (kern-first)

1. **Label-/Übersetzungsschicht + `react-i18next`** aufsetzen (dient i18n *und* Jargon-Kosmetik).
2. **`core/geld.ts`** währungs-/locale-fähig (Skala je Währung, Locale als Parameter) +
   **Settings-Zeile** (Währungscode + Locale, beim Setup gewählt).
3. **Ein Pilot-Screen** vollständig umgestellt (Strings extrahiert, Geld über die neuen Primitive)
   — als Muster für den Rest.
4. *Dann:* volle String-Extraktion + **EN-Glossar** (redaktionell) — wenn die UI nach
   Kosmetik/ADR-0003 steht (Mittelweg: Infrastruktur jetzt, volle Übersetzung später, damit
   keine beweglichen Ziele übersetzt werden).

**Offen:** EN-Glossar-Vokabular — YNAB-nah („buckets/sinking funds") vs. neutraler
(„reserves/savings goals"). Bruce entscheidet; kein Code nimmt das ab.
