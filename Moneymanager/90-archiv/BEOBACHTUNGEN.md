# Moneymanager — Beobachtungen aus dem Wireframe-Bau

> **DDD-Ebene:** Archiv — Herleitung/Entscheidungslog · **Status:** historisch · **Stand:** 2026-06-13 · **Bezüge:** UBIQUITOUS-LANGUAGE, TAKTIK-PLANUNG, RECHNUNGSWESEN-BEZUG

> Laufendes Logbuch für Funde beim Prototyping/Wireframen. Leichtgewichtig, nicht
> kuratiert. Jeder Eintrag: Beobachtung · Abgleich mit Modell (haben wir's?) · offene
> Entscheidung. Geklärte Punkte wandern später gezielt in KONZEPT / DOMAENENDESIGN /
> TAKTIK-* und werden hier als „→ übernommen" markiert.

## Stand 2026-06-13 — A–D entschieden & eingebettet

Die offenen Entscheidungen sind getroffen und in die DDD-Docs überführt:

- **Mechanik-Bild & Brille ≠ Mechanik** → KONZEPT §3.2/§3.3.
- **Topf-Schnitt (A):** drei Aggregate (Rücklage, Rückstellung, **Freitopf**) am gemeinsamen
  `Topf`-Interface, Zielwert optional (Abstract Core für Saldo/Zuführungen) →
  TAKTIK-PLANUNG §1, DOMAENENDESIGN (UL).
- **Namenskollision** → UBIQUITOUS-LANGUAGE.md: Fachbegriffe „Rücklage/Rückstellung" in der UI tabu;
  UI-Set **Budget · Spartopf (+Sparziel) · Puffer · Ersatz · Vorsorge**.
- **Über-/Unterzahlung (C): „Plan = Ist" + globale Deckung** → TAKTIK-PLANUNG §3.
- **Vorsorge = zwei Beine** (Vermögen + Risikotransfer) → DOMAENENDESIGN (Vorsorge),
  RECHNUNGSWESEN-BEZUG §5.
- **Topf ist kein Shared Kernel** → DOMAENENDESIGN §4.

**Noch offen — geführt in KONZEPT §8:** Topf mit eigenem Konto (UX), saisonaler Verbrauch
ohne Übertrag (nicht-lineare Glättung), Nebenbuch-Option, UI-Wording final bestätigen.

Die folgenden Einträge bleiben als **Herleitung** stehen.

---

## 2026-06-13 · Budget-Typen und ihre Abgrenzung

### Beobachtung
Aus Nutzersicht (Bruce) gibt es vier Arten von Ausgaben:
1. **Budget, monatlich bei 0 beginnend** — regelmäßige Konsumausgaben, kein Übertrag.
2. **Budget saisonal / „einfach ansparend"** — erwartbare Konsumausgaben, die über die
   Zeit angespart und dann (zur Saison) verbraucht werden.
3. **Töpfe** — Rücklagen für Vorhersehbares sowie Abschreibungen/Inventar.
4. **Verträge** — wiederkehrende Zahlungen.

Leitfrage des Nutzers: *„Das muss klar abgegrenzt sein. Grenzt man das an seiner Funktion
ab oder durch die Brille, die der User hat?"*

### Abgleich mit Modell
- **Monatlich bei 0** → ✅ vorhanden als `Budget` (Periode = Monat, geglätteter Abfluss,
  Verbrauch im Zeitraum, direktes Plan/Ist-Matching gegen Istbuchungen). Kein Übertrag —
  passt zur heutigen Mechanik.
- **Saisonal** → ⚠️ nur halb. Über `Periode` + `Glättungsregel` grundsätzlich abbildbar,
  aber Glättung ist heute bewusst „linear fürs MVP" (TAKTIK-PLANUNG §7). Saisonal heißt
  gerade *ungleiche* Verteilung übers Jahr und – wichtiger – *Ansparen bis zum Ereignis*.
- **Ansparend** → ⚠️ Begriffskollision, siehe Analyse unten.
- **Töpfe (Rücklage/Rückstellung)** → ✅ vorhanden, inkl. gemeinsamem Oberbegriff „Topf".

### Analyse: Funktion vs. Brille
Mechanisch existieren nur **zwei Muster**, nicht fünf:

- **Muster A — Verbrauchsrahmen, setzt sich zurück:** monatlich bei 0. Kein Übertrag,
  Verbrauch innerhalb der Periode, direkt gegen Ist gematcht. = heutiges `Budget`.
- **Muster B — ansammelnder Topf:** füllt sich über die Zeit, wird zum Ziel/Ereignis
  geleert. Umfasst mechanisch **saisonal, „ansparend" UND Rücklage/Abschreibung** gleich.

Die Unterscheidung *„saisonaler Konsum-Topf" vs. „Rücklage fürs Inventar"* ist damit
**keine Funktionsabgrenzung, sondern die Brille des Nutzers.** Sie trennt sich nur über:
- **Charakter / Zweck:** Konsum (Urlaub, Weihnachten) vs. Werterhalt/Ersatz (Auto, Geräte).
- **Herkunft des Zielwerts:** frei geschätzt (Saison/Wunsch) vs. abgeleitet aus
  Wiederbeschaffungswert + Nutzungsdauer (= kalkulatorische Abschreibung).

Beides bildet das Modell bereits ab: `Charakter` (Aufwand | Ertrag | Umschichtung) und
`Kategorie` als Querschnittsdimension. Die 5er-Nutzerliste reduziert sich auf
**2 Mechaniken + 1 Brille + Verträge.**

Feinpunkt zum Charakter: Die monatliche *Zuführung* in einen Konsum-Spartopf (Saison) ist
noch **kein Aufwand**, sondern Zweckbindung liquider Mittel (wie eine Rücklagen-Zuführung).
Der **Aufwand** entsteht erst beim Verbrauch (im Saison-Monat). Das unterscheidet B sauber
von A, wo der geglättete Abfluss direkt als Verbrauch der Periode gilt.

### Offene Entscheidung
1. **„Ansparend" = was?** Zwei Lesarten, mechanisch verschieden:
   - *Rollover/Carry-over:* nicht verbrauchtes Monatsbudget wandert in die nächste Periode
     (Umschlag-Logik). → **Neues Budget-Verhalten, heute nicht im Modell** (Budget erzeugt
     nur geglättete Abflüsse, kein Übertrag).
   - *Ziel-Ansparen:* auf ein Ziel hin ansammeln. → ist **Muster B / Topf**, kein neuer
     Budget-Typ.
   - *Status:* **geklärt am 2026-06-13** (siehe Taxonomie-Eintrag unten): Beide Lesarten
     existieren als *getrennte* Mechaniken. Rollover/Carry-over = der revolvierende, „nie
     geleerte" Topf (Userkategorie 2, Beispiel Klamotten). Ziel-Ansparen = Zieltopf
     (Userkategorien 3/4). „Ansparend" ist also kein eigener Begriff, sondern verteilt sich
     auf diese zwei.
2. **Saisonaler Konsum als dritte Topf-Variante?** Topf-Interface liefert heute
   `sollstand(am)` für Rücklage (Zielwert aus Wiederbeschaffung) und Rückstellung
   (Schätzbetrag + Zeitfenster). Ein „Saison-/Wunsch-Topf" (Zielwert frei + Zeitfenster,
   Charakter Aufwand statt Umschichtung) passt strukturell als dritte Variante — zu prüfen,
   ob als eigenes Aggregat oder als Konfiguration von Rückstellung.
3. **UI-Abgrenzung:** Trennung im UI über die Brille (Zweck/Kategorie) führen, nicht über
   die Mechanik — damit der Nutzer „Urlaub" und „neue Waschmaschine" getrennt sieht,
   obwohl beides Muster B ist.

---

## 2026-06-13 · Ausgaben-Taxonomie aus der Userbrille (verfeinert)

> Schärft den Budget-Typen-Eintrag oben. Nutzer hat seine Sicht in **fünf Kategorien**
> sortiert. Sie mappen fast sauber auf das Modell — mit *einer* echten Lücke und *einer*
> Namensfalle.

### Die fünf Userkategorien

| # | Userbrille | Beispiel | Mechanik | Modell heute | Reset / Ziel |
|---|---|---|---|---|---|
| 1 | **Budget** | monatliche Rahmen | Verbrauchsrahmen | `Budget` ✅ | Reset zum Monatsende, **kein Ziel** |
| 2 | **Topf, „nie geleert"** | Klamotten | revolvierender Puffer | — ⚠️ **NEU** | **kein Reset, kein Ziel** |
| 3 | **Rücklage(?)** | Urlaub, Reparatur, Unvorhergesehenes | Zieltopf, ungewiss | `Rückstellung` ✅ | Ziel = Schätzbetrag + Zeitfenster |
| 4 | **Inventar** | Waschmaschine ersetzen | Zieltopf, Abschreibung | `Rücklage` ✅ | Ziel = Wiederbeschaffung + Nutzungsdauer |
| 5 | **Vorsorge** | Rente, Arbeitslosigkeit | Risikodeckung / Anlage | Vorsorge-Kontext + Anlage ✅ (Stufe 2) | — |

Definitionen O-Ton Nutzer:
- **Budget:** Rahmen für manche Ausgaben, jeden Monat gleich, evtl. unregelmäßig; **wird
  zum Monatsende genullt.**
- **Topf:** Geld sammeln für Ausgaben unregelmäßig + unbekannter Höhe (Klamotten); **wird
  nie geleert.**
- **Rücklage(?):** Ausgaben, die vorkommen *oder auch nicht* — Urlaub, Reparaturen,
  Unvorhergesehenes.
- **Inventar:** Wertverluste / Dinge, die wiederbeschafft werden müssen oder sollen.
- **Vorsorge:** alles, was angelegt/abgeschlossen wird, um für den Fall der Fälle gewappnet
  zu sein (Arbeitslosigkeit, Rente).

### Fund 1 — Kategorie 2 ist eine neue Mechanik
Der „nie geleerte" Klamotten-Topf ist **weder Budget** (das resettet) **noch Zieltopf**
(der hat ein Ziel und wird zum Anlass verbraucht). Er ist ein **revolvierender Puffer ohne
Zielwert**: monatliche Zuführung rein, unregelmäßiger Verbrauch raus, Rest bleibt liegen,
kein Endpunkt. → Das ist genau das **Rollover/Carry-over**, das zuvor offen war: bestätigt,
existiert, wird gebraucht.

**Konsequenz fürs Modell:** Ein zielloser Topf hat **keinen `sollstand(am)`** und sprengt
damit die heutige Topf-Annahme (Rücklage/Rückstellung liefern beide einen Sollstand,
TAKTIK-PLANUNG §1/§3). Offene Entscheidung: eigenes Aggregat „Revolvierender Topf" /
„Carry-over-Budget" vs. Erweiterung des Topf-Interfaces um „ohne Ziel".

### Fund 2 — Dreifache Namenskollision bei „Rücklage / Rückstellung"
Nutzer bestätigt die **Mechanik**, belegt aber die **Fachbegriffe spiegelverkehrt** (O-Ton
2026-06-13):
- **Inventar** = Dinge, die ich besitze und irgendwann ersetzen muss; planbar, bezifferbar,
  **abschreibbar**. → Nutzer nennt das **„Rückstellung"**.
- **Unvorhergesehenes** = Autoreparatur o. Ä.; ungewiss, **nicht bezifferbar, nicht
  abschreibbar**. → Nutzer nennt das **„Rücklage"**.

Drei Sprecher, drei Bedeutungen desselben Worts:

| Mechanik | Nutzer (umgangssprachl.) | Modell heute | Strenges HGB |
|---|---|---|---|
| abschreibbarer Ersatz (Inventar) | „Rückstellung" | **Rücklage** (Abschreibungs-Analogie) | Abschreibung / Ersatzbeschaffungsrücklage |
| ungewisse Ausgabe (Reparatur) | „Rücklage" | **Rückstellung** | **Rückstellung** (§249 HGB, ungewisse Verbindlichkeit) |

In strengem HGB ist die **Modell-Belegung korrekt** (ungewisse Reparatur = Rückstellung;
„Rücklage" ist dort eine Eigenkapital-Reserve). Die Alltagssprache „Rücklagen bilden" meint
dagegen den Notgroschen fürs Unvorhergesehene — daher Nutzers umgekehrte Lesart. Beide
Lesarten sind in ihrem Rahmen plausibel.

**Konsequenz:** Über die Wörter nicht streiten. Stabiler Anker ist allein die **Mechanik —
abschreibbar (Inventar) vs. nicht abschreibbar / ungewiss (Reparatur)** —, die der Nutzer
selbst sauber gezogen hat („das muss ich nicht abschreiben"). Intern nach Mechanik benennen,
in der UI **neutrale** Wörter, die *weder* „Rücklage" *noch* „Rückstellung" sind.
Verschärft die Glossar-Disziplin (UBIQUITOUS-LANGUAGE.md): die Fachbegriffe sind nicht nur laienunklar,
sie sind **gegensätzlich besetzt** — also in der UI tabu.

**Benennung — entschieden 2026-06-13:** intern bleiben **Rücklage / Rückstellung / Freitopf**;
UI = **Ersatz / Puffer / Spartopf** (UBIQUITOUS-LANGUAGE.md). Die folgenden zwei Vorschläge sind damit
**verworfen** und stehen nur noch als Herleitung:
1. UI-Wording für die zwei Zieltöpfe neutral festlegen, z. B. „Ersatz/Inventar"
   (abschreibbar) vs. „Unvorhergesehenes/Notfall" (ungewiss) — nicht „Rücklage/Rückstellung".
2. Optional die interne Ubiquitous Language von „Rücklage/Rückstellung" auf mechanik-neutrale
   Aggregatnamen umstellen (z. B. `Abschreibungstopf` / `Schätztopf`), um die Kollision ganz
   zu vermeiden. Berührt UBIQUITOUS-LANGUAGE.md und TAKTIK-PLANUNG §1 → zu entscheiden.

### Fund 3 — Kat. 3/4/5 passen sauber
Rückstellung (3), Rücklage (4) und Vorsorge-Kontext + Anlage (5) decken die Mechanik ab.
Vorsorge ist bewusst eigener Kontext, Ausbaustufe 2.

### Konsolidiertes Mechanik-Bild
- **A — Verbrauchsrahmen mit Reset** (Kat. 1): rein, im Zeitraum verbraucht, genullt.
- **B1 — revolvierender Topf, ziellos** (Kat. 2): rein, unregelmäßig raus, **kein Reset,
  kein Ziel**. ⟵ neu.
- **B2 — Zieltopf** (Kat. 3/4): rein bis Zielwert/Schätzwert im Zeitfenster, dann Verbrauch.
  - B2a ungewiss = Rückstellung (3) · B2b Abschreibung = Rücklage (4).
- **C — Vorsorge/Anlage** (Kat. 5): Risikodeckung, langfristig, eigener Kontext.

### Offene Entscheidungen
1. **Modellierung Kat. 2** (zielloser revolvierender Topf): **Richtung geklärt 2026-06-13**
   → Topf als *laufender Saldo mit optionalem Zielwert* modellieren (siehe Eintrag „Topf
   ohne Ziel bestätigt" unten). Offen bleibt nur: ein Aggregat mit optionalem Ziel **oder**
   getrennte Aggregate an gemeinsamem Topf-Interface (DDD-Vorbehalt, TAKTIK-PLANUNG §1).
2. **Über-/Unterzahlung greift nur bei B2** (Zieltöpfe, es gibt einen Soll-Plan).
   Bei A (Budget) und B1 (zielloser Topf) gibt es **keine** „Unterzahlung gegen Ziel" —
   dort nur laufender Stand / Deckung. Siehe Plan/Ist-Eintrag unten. UI muss das trennen.
3. **UI-Schnitt:** fünf Kategorien als Nutzer-Brille führen, darunter aber nur A / B1 / B2 /
   C als Mechanik. Brille ≠ Mechanik bleibt das Leitprinzip.

---

## 2026-06-13 · Plan/Ist bei Töpfen über mehrere Konten — Über-/Unterzahlung sichtbar machen

### Beobachtung
Planung und späterer Ist-Zustand müssen abgeglichen werden, besonders bei Spartöpfen, die
sich auf verschiedene Konten verteilen. **Ein Konto ist nur eine Zahl und zeigt die Töpfe
darin nicht.** Es muss also eine **Über- oder Unterzahlung** sichtbar werden (habe ich
mehr/weniger beiseitegelegt als geplant?).

### Abgleich mit Modell
- **Gesamt-Deckung** → ✅ abgedeckt: `Deckungsgrad` / `Deckungsrechnung`
  (`(töpfe, verfügbareMittel, stichtag) → [Deckungsgrad]`) beantwortet „Ist mein Puffer
  finanziert?". KONZEPT §3.2: Töpfe sind nicht an Konten gebunden, sondern durch
  Kontostände *gedeckt*.
- **Pro-Topf Plan/Ist (Über-/Unterzahlung)** → ⚠️ **noch nicht im Modell.** Der genaue
  Punkt fehlt.

### Kern des Problems
Ein Topf **ohne eigenes (Unter-)Konto** hat **keine beobachtbare Ist-Zuführung** — es gibt
keine echte Buchung zum Matchen, weil die Zweckbindung nur virtuell über liquiden Mitteln
liegt. „Über-/Unterzahlung" lässt sich daher nicht aus Buchungen ablesen, sondern nur
berechnen als:

> **kumulierte Soll-Zuführung (Plan, bis Stichtag)  vs.  tatsächlich für den Topf
> beiseitegelegter Betrag.**

Hat ein Topf dagegen ein **eigenes Konto** (separates Tagesgeld), sind die Zuführungen
echte Umschichtungen → direkt über das bestehende Plan/Ist-Matching (`Zuordnung`) prüfbar.
→ Zwei Fälle, die die UI unterschiedlich behandeln muss.

### Offene Entscheidung
1. **Eigene Topf-Plan/Ist-Sicht** zusätzlich zum `Deckungsgrad` einführen: je Topf
   Soll-Zuführung (kumuliert) vs. Ist-Stand → Status **überfinanziert / planmäßig /
   unterfinanziert**.
2. **Woher kommt der Ist-Stand eines kontolosen Topfes?** Optionen: (a) abgeleitet aus den
   gematchten Zuführungs-Umschichtungen, falls vorhanden; (b) manuell/regelbasiert
   zugeordneter Anteil der liquiden Mittel; (c) Annahme „geplant = ist", solange Deckung
   gesamt steht. Zu entscheiden.
3. **Verhältnis zu Deckungsgrad klären:** Deckungsgrad = Gesamtsicht (reicht das Geld für
   alle Töpfe?). Über-/Unterzahlung = Pro-Topf-Sicht (stimmt die Befüllung *dieses* Topfes
   gegen den Plan?). Beide nebeneinander zeigen, nicht vermischen.
4. **Mögliches Domänenkonzept:** `Topfstand`/`Topf-Deckung` als Leseschicht
   (Domain Service), analog zu `Deckungsrechnung`, mit Ergebnis je Topf statt aggregiert.

---

## 2026-06-13 · Topf ohne Ziel bestätigt → Zielwert wird optional

### Beobachtung (O-Ton Nutzer)
„Es gibt Töpfe ohne Ziel, das ist für mich keine Frage. Klamotten. Ich möchte ansparen und
ausgeben, ohne dass es gekappt wird. Was, wenn ich mal absichtlich länger spare, um mir
etwas besonders Tolles zu kaufen, oder viel auf einmal?"

### Was das klärt
- **Der ziellose Topf (B1) ist gesetzt** — keine offene Frage mehr.
- „Nie geleert" war zu eng: derselbe Topf trägt auch **bewusstes Ansparen + großen
  Einmal-Verbrauch**. Es gibt also **keinen** harten „Leeren/Reset"-Mechanismus — nur freien
  Verbrauch, klein oder groß, ohne Deckel.
- Für den Splurge-Fall braucht es **keinen** neuen Aggregattyp; er fällt in denselben Topf,
  nur das Nutzerverhalten ändert sich.

### Vereinheitlichung: Topf = laufender Saldo, Zielwert optional
Alle Topf-Spielarten kollabieren auf **ein** Primitiv plus einen optionalen, getypten
Zielwert:

| Spielart | Zielwert | Beispiel |
|---|---|---|
| Frei / ohne Ziel | keiner | Klamotten, einfach floaten |
| Weiches Wunschziel | frei gesetzt, ohne Frist-Zwang | „etwas Besonderes" ansparen |
| Geschätztes Ziel + Zeitfenster | Schätzbetrag + Frist | Rückstellung (Reparatur) |
| Abgeschriebenes Ziel | Wiederbeschaffung ÷ Nutzungsdauer | Rücklage (Inventar) |

**Über-/Unterzahlung** (Plan/Ist) greift nur, **wenn ein Zielwert existiert**. Ohne Ziel
gibt es nur laufenden Stand + Deckung. Budget (A) bleibt davon getrennt: **Reset** statt
laufender Saldo.

### Konsequenz fürs Modell (→ beantwortet offene Frage Kat. 2)
- Topf-Interface um **„Zielwert optional (auch keiner)"** erweitern; `sollstand(am)` nur
  definiert, wenn ein Zielwert vorhanden ist.
- DDD-Vorbehalt: Rücklage und Rückstellung bleiben fachlich evtl. getrennte Aggregate
  (andere Invarianten, andere Sprache — TAKTIK-PLANUNG §1). Der ziellose/Wunsch-Topf käme
  als dritte Variante („Freitopf") an dasselbe Interface.
- Zu entscheiden: **ein** Aggregat mit optionalem Ziel **oder** drei Varianten am
  gemeinsamen Interface. Das Mechanik-Bild ist in beiden Fällen geklärt.
