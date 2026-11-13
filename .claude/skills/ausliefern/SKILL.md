---
name: ausliefern
description: "Eine Moneymanager-Version ausliefern: Version in package.json und package-lock.json heben, CHANGELOG, Merge nach main, Tag, Release-Workflow, Beta-Kanal, Updater und Update-Knopf, minisign- und Apple-Signatur, die drei Plattformen. Laden, bevor eine Version gehoben, ein Tag gesetzt, release.yml oder release-text.sh geändert oder der Update-Weg geprüft wird."
---

# Ausliefern

Was überall gilt, steht in der Wurzel-`CLAUDE.md`.

## Der Weg: GitHub-Release, Update in der App

**Ausgeliefert wird über ein GitHub-Release, eingespielt über den Updater in der App.** Ein
Tag `v*` löst `.github/workflows/release.yml` aus; der Workflow baut, signiert für den
Updater, legt das Release an und hängt Archiv, DMG und das Update-Manifest daran. Die laufende
App fragt beim Start die Datei latest.json unter releases/latest/download ab und bietet
den Knopf an.

Bis zum 28.08.2026 stand hier das Gegenteil („es gibt keinen Release-Weg"), und das war seit
`v0.16.0` schlicht überholt — die Doku beschrieb eine Welt, die es nicht mehr gab, und der
Abschnitt weiter unten beschrieb daneben die richtige. Wer beide las, konnte sich aussuchen,
was gilt.

**Lokal gebaut wird nicht mehr.** `npm run installieren` gibt es weiterhin und es
funktioniert; als Auslieferungsweg ist es abgelöst. Das ist keine Kleinigkeit, sondern die
Voraussetzung dafür, dass der Weg überhaupt geprüft wird: ein Release, das nur im Notfall
benutzt wird, ist beim nächsten Notfall kaputt. Und es hat eine Folge, die weiter unten
zuschlägt — ein Wächter, der das Release blockiert, blockiert damit alles.

Drei Dinge, die dabei zusammengehören und von denen das dritte gern vergessen wird:

- **Die Produktregistrierungsnummer wird zur BAUZEIT eingebacken.** Vite ersetzt
  `import.meta.env.VITE_FINTS_PRODUKT_ID` beim Bündeln; fehlt die `.env` im Moment des
  Bauens, fehlt sie der fertigen App, und der Bankabruf meldet das erst beim ersten
  Versuch. `scripts/installieren.sh` warnt vorher.
- **Gatekeeper hält die App an.** Sie ist nicht mit einem Apple-Developer-Zertifikat
  signiert; macOS meldet sie deshalb als „beschädigt", was sie nicht ist. Das
  Quarantäne-Merkmal einmal abräumen (`xattr -dr com.apple.quarantine`) ist die ganze
  Sache, und das Skript tut es mit.
- **Der Datenbestand überlebt die Neuinstallation.** Er liegt im App-Datenverzeichnis, nicht
  im Bundle.

Der Weg selbst steht: `tauri-plugin-updater` (auf Linux ausschliesslich mit AppImage), der
Signaturschlüssel, der Workflow mit `VITE_FINTS_PRODUKT_ID` als Repository-Secret. Der
Secret-Weg ist dabei nicht
Geheimniskrämerei, sondern die **Produktgrenze**: ein Fork ist laut DK-Bedingungen ein
anderes Produkt und hat das Secret nicht — sein Build läuft ohne Nummer und wird damit zur
eigenen Registrierung geschoben, statt still unter unserem Namen zu laufen.

## Der Update-Knopf

Die App prüft beim Start still nach. Ist nichts da, verändert sich nichts — kein Hinweis,
kein Haken, keine Meldung. Ist etwas da, erscheint **unten links in der Seitenleiste**,
neben Version und Stadium, ein Knopf; ein Klick lädt, installiert und startet neu.

Der Ort ist nicht beliebig: dort steht schon, welche Version läuft. „0.19.0" und „0.20.0
installieren" beantworten dieselbe Frage.

**Bei schmalem Fenster steht er allein.** Die Seitenleiste klappt unter 1100 px auf ihre
Icons zusammen, und Version und Stadium fallen dabei weg — das Nebeneinander, das den Ort
begründet, also auch. Der Knopf bleibt trotzdem, als Icon mit `title`. Er ist das einzige
Stück der Fusszeile, das schmal überlebt, und daran hängt eine Regel, die über diesen Fall
hinausgeht: **Auskunft darf weichen, eine Handlung nicht.** Ein Update, von dem niemand
erfährt, ist keines.

**Ein Fehlschlag beim PRÜFEN ist kein Fehler.** Kein Netz, Endpunkt weg, Antwort kaputt —
in allen Fällen lautet die Antwort „nichts Neues". Ein Haushalt, der Ausgaben eintragen
will, hat mit einer Updater-Fehlermeldung nichts zu tun; sie wäre Beunruhigung ohne
Handlungsmöglichkeit. Beim **Einspielen** dreht sich das um: dort hat jemand geklickt und
wartet, und ein Fehler gehört ihm gesagt.

**Die Prüfung ist der erste Netzzugriff, den die App von sich aus macht.** Bisher sprach
sie nur nach draussen, wenn jemand einen Bankabruf auslöste. Deshalb ist sie abschaltbar
(`aktualisierungPruefen` in `einstellung`); ohne Zutun ist sie an, denn ein Update, von
dem niemand erfährt, ist keines.

**Daneben steht „Jetzt prüfen"** (seit 2026-11-12, `aktualisierungJetztPruefen`): sonst
prüfte die App nur beim Start. Der Startschalter gilt dafür nicht — er regelt, ob die App
UNGEFRAGT nach draussen spricht, und ein Klick ist die Frage. Anders als beim Start
werden „nichts Neues" und „ging nicht" getrennt gemeldet: hier wartet jemand auf die
Antwort.

Der Schalter dafür steht unter **Einstellungen → Über die App**, in einer eigenen Karte
„Aktualisierung" und nicht bei den Experimenten (die Karte darunter): die Prüfung ist keins, sie ist an,
und der Grund für den Schalter — der einzige ungefragte Netzzugriff — gehört
daneben geschrieben statt in eine Fussnote. Ein fehlender Schlüssel heisst dabei „nie
entschieden" und nicht „abgelehnt", weshalb das Kästchen ohne Zeile in der Tabelle
angehakt ist.

**Der private Signaturschlüssel liegt ausserhalb des Repos** (`~/.moneymanager-schluessel/`)
und ist **unersetzlich**: geht er verloren, kann keine installierte App je wieder ein
Update annehmen — sie prüft gegen den öffentlichen Schlüssel, der in ihrem Bundle steckt.
Er gehört gesichert. Solange nichts veröffentlicht ist, kostet ein Neuerzeugen nichts;
nach dem ersten Release kostet es jede Installation da draussen.

Zwei Dinge, die man dabei auseinanderhalten muss:

- **Die Updater-Signatur hat mit Apple nichts zu tun.** Sie ist minisign und verhindert,
  dass jemand anderes ein Update unterschiebt. Gatekeeper bleibt davon unberührt: eine
  unsignierte App aktualisiert sich klaglos, sobald sie einmal starten durfte.
- **Auf Linux kann der Updater ausschliesslich AppImages ersetzen.** Ein `.deb` kann sich
  nicht selbst austauschen. Das entscheidet also das Bundle-Format mit, nicht erst die
  Verteilung.

## Der Beta-Kanal

Seit 0.29.3. Eine neue Fassung soll am echten Bestand laufen, bevor sie alle bekommen, und
dafür gab es nur `npm run installieren`. Jetzt läuft eine Beta denselben Weg wie jede
Fassung, und sie erreicht nur, wer **Einstellungen → Über die App → Betaversionen
erhalten** eingeschaltet hat. Ab Werk ist das aus.

```
v0.30.0-beta.1   ein Tag mit Bindestrich ist eine Vorabversion
v0.30.0          die fertige Fassung, für alle
```

| | fragt | sieht |
|---|---|---|
| normal | latest.json unter releases/latest/download | nur reguläre Fassungen, GitHub überspringt Vorabversionen |
| Schalter an | latest.json der Release-Seite `beta-kanal`, Rückfall wie normal | die jüngste Fassung, gleich welche |

Vier Dinge, die man wissen muss:

- **Die Seite `beta-kanal` wird bei JEDEM Release fortgeschrieben**, nicht nur bei einer
  Beta. Der Updater fragt die Endpunkte der Reihe nach und nimmt die erste Antwort. Läge
  dort nur die letzte Beta, bliebe jeder auf ihr sitzen, sobald die fertige Fassung
  erschienen ist. Dass 0.30.0 nach 0.30.0-beta.1 kommt, regelt SemVer; es muss nur dastehen.
- **Der normale Weg ist nicht angefasst.** `check()` aus dem Plugin nimmt keinen anderen
  Endpunkt an, deshalb gibt es für den Kanal ein eigenes Kommando
  (`src-tauri/src/aktualisierung.rs`), und nur er läuft darüber. Laden, Signaturprüfung und
  Einspielen sind danach dasselbe `Update` wie sonst, gegen denselben Schlüssel.
- **Es gibt keinen Weg zurück per Schalter.** Ausschalten nimmt eine Beta nicht zurück, ein
  Downgrade gibt es nicht. Und eine Beta mit Migration baut den echten Bestand um; der
  Rückweg ist dann die Tagessicherung vor den Migrationen.
- **Der Tag einer Beta liegt auf `develop`**, nicht auf `main`: `main` bleibt der Stand, den
  alle haben. Der Workflow fragt nicht nach dem Branch, nur nach dem Tag.

## Den Update-Weg durchspielen

Halb prüfen geht nicht: entweder eine installierte App findet ein signiertes Paket, lädt
es, ersetzt sich und startet neu — oder man weiss nichts. Dafür gibt es einen Endpunkt auf
`127.0.0.1`, der nur läuft, solange man ihn laufen lässt.

```bash
export TAURI_SIGNING_PRIVATE_KEY=~/.moneymanager-schluessel/updater.key
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=

# 1. Die ALTE Fassung bauen und installieren — mit dem Probe-Endpunkt.
npm run tauri build -- --config src-tauri/tauri.updater-probe.conf.json
rm -rf /Applications/Moneymanager.app
cp -R src-tauri/target/release/bundle/macos/Moneymanager.app /Applications/
xattr -dr com.apple.quarantine /Applications/Moneymanager.app

# 2. Die NEUE Fassung bauen. Die höhere Version steht in der Config, nicht in
#    package.json — eine Probe soll die Versionsangabe des Projekts nicht anfassen.
npm run tauri build -- --config src-tauri/tauri.updater-probe-neu.conf.json

# 3. Endpunkt starten. Er nimmt, was im Bundle-Verzeichnis liegt, und bietet es unter
#    der mitgegebenen Version an.
npm run updater-probe -- 0.20.0

# 4. Die INSTALLIERTE App starten. Der Knopf muss unten links erscheinen.
```

Drei Fallen, alle drei gemessen und nicht vermutet:

- **Die Variable heisst `TAURI_SIGNING_PRIVATE_KEY`**, nicht `…_PATH` — sie nimmt den Pfad
  genauso wie den Schlüssel selbst. Mit der `_PATH`-Variante läuft der Build durch und
  bricht ganz am Ende beim Signieren ab („A public key has been found, but no private
  key"); das Archiv liegt dann unsigniert da.
- **Ein `http`-Endpunkt lässt die App gar nicht erst starten.** Tauri prüft das Schema beim
  INITIALISIEREN des Plugins, nicht beim Abruf, und wirft: *„The configured updater
  endpoint must use a secure protocol like `https`"* — die gebaute App panict beim Start.
  Für die Probe hebt `dangerousInsecureTransportProtocol` das auf; der Schalter steht
  ausschliesslich in den Probe-Overlays, und `src/auslieferung.test.ts` hält ihn aus
  `tauri.conf.json` heraus.
- **Der Plattformschlüssel im Manifest muss exakt passen** (`darwin-aarch64` auf Apple
  Silicon). Steht dort etwas anderes, meldet der Updater „nichts Neues" statt eines
  Fehlers — und man sucht lange an der falschen Stelle.

**Der Endpunkt steckt im Bundle, nicht in der laufenden App.** Eine App, die ohne
`--config` gebaut wurde, fragt GitHub und findet nichts — sie lässt sich nachträglich nicht
auf den Probe-Endpunkt umbiegen. Wer den Knopf nicht sieht, prüft das zuerst.

**Den Endpunkt nicht laufen lassen, während gebaut wird.** Er liefert die Dateien aus dem
Bundle-Verzeichnis aus, und ein Build schreibt genau dort. Wer dazwischen klickt, lädt ein
Archiv, das nicht mehr zu der Signatur im Manifest passt — der Updater weist es dann ab
(richtig so), und man sucht den Fehler beim Schlüssel. Erst bauen, dann den Endpunkt
starten; er erzeugt das Manifest beim Start neu.

**Und die Seitenleiste zeigt beim Probelauf weiter die ALTE Nummer.** `version.ts` liest
`package.json`, die höhere Version steht aber nur im Config-Overlay. Ob das Update
ankam, sagt deshalb nicht die Anzeige, sondern das Bundle:

```bash
/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" \
  /Applications/Moneymanager.app/Contents/Info.plist
```

Bei einem echten Release gibt es diese Lücke nicht — dort wird `package.json` gehoben, und
`tauri.conf.json` liest die Version von dort. Beide Zahlen haben dann dieselbe Quelle.

## Was am Update-Weg noch fehlt

Mechanismus, Workflow und Releases stehen. Offen ist:

- **Das Apple-Zertifikat** und die sechs Secrets dazu. Ohne sie wird unsigniert
  ausgeliefert, und das Release sagt es (siehe unten). Die drei anderen Secrets liegen:
  `TAURI_SIGNING_PRIVATE_KEY`, dessen Passwort und `FINTS_PRODUKT_ID`.
Alle drei Plattformen bauen. **Windows seit 0.29.0** — `x64-setup.exe` und seine Signatur
hängen seither an jedem Release; Linux liefert sein AppImage seit 0.24.0.

Hier stand bis zum 22.09.2026, der Windows-Job sterbe an den TESTS, bevor überhaupt ein
Compiler laufe, und die vermutete Hürde (SQLCipher zieht OpenSSL mit, dessen Bauweg dort
Perl und NASM braucht) liege „hinter einer Tür, die noch nie aufging". Die Tür ist auf, und
dahinter stand nichts: der Rust-Bauweg lief durch, sobald die Tests ihn liessen.

**Der allgemeine Teil daran bleibt und hat sich bewährt: ein plattformübergreifender
Testlauf prüft auch die TESTS auf Plattformunterschiede.** Der Fund, der die Tür geöffnet
hat, war ein URL-Pfad, der als Dateipfad benutzt wurde (`new URL(…).pathname` — auf Windows
steht der Laufwerksbuchstabe hinter einem Schrägstrich). Wer eine vierte Plattform
dazunimmt, rechnet wieder mit einer Kette solcher Funde und nicht mit einem.

**Was in einem veröffentlichten Archiv steckt** und was nicht, weil die Frage naheliegt:
keine Zugangsdaten, keine Kontodaten, kein Datenbestand — die Datenbank liegt im
App-Datenverzeichnis, nicht im Bundle. Aber die **DK-Produktregistrierungsnummer** ist
darin, zur Bauzeit eingebacken. Sie ist kein Geheimnis (sie geht bei jeder
Dialoginitialisierung im Klartext an die Bank), aber sie identifiziert dieses Produkt
gegenüber allen Banken, und wer ein Release herunterlädt, spricht mit seiner Bank unter
unserer Registrierung. Das ist der normale Zustand eines Softwareherstellers — aber es ist
eine Entscheidung, einer zu sein.

## Eine Version ausliefern

1. `develop` ist grün und enthält alles, was mit soll.
2. Version in `package.json` heben — und **`package-lock.json` mit**. `tauri.conf.json`
   und `version.ts` lesen wirklich von dort; der Lockfile nicht (siehe unten).
3. `CHANGELOG.md` schreiben. Keine Zahl aus dem echten Bestand hinein.
4. Nach `main` mergen (nur aus `develop`, der Hook lässt nichts anderes zu).
5. Tag setzen und pushen — **das löst `.github/workflows/release.yml` aus**: bauen,
   signieren, Release anlegen, Archiv, DMG und Manifest anhängen.
6. **Die installierte App einmal starten.** Das ist kein Ritual: der Build kann
   durchlaufen und die App trotzdem nicht hochkommen — an einer Migration, an einer
   fehlenden Capability, an Gatekeeper.

Für den eigenen Rechner geht es auch ohne Release: `npm run installieren` baut und
installiert lokal. Beide Wege erzeugen dasselbe Bundle; der Unterschied ist nur, ob es
jemand anders erreichen kann.

### Der Lockfile trägt die Version zweimal, und niemand schreibt sie fort

Hier stand bis zum 09.09.2026 „**eine** Stelle", und das war zu kurz gefasst. `package.json`
ist die Quelle für alles, was zur Bauzeit gelesen wird — aber **`package-lock.json` hält
seine eigene Kopie**, zweimal: an der Wurzel und in `packages[""]`. Fortgeschrieben wird
sie nur von `npm version` oder einem `npm install`; wer die Zahl von Hand hebt, hebt sie
dort nicht mit.

**Deshalb fällt es nicht auf:** `npm ci` prüft die Auflösung der Abhängigkeiten, nicht die
eigene Versionsnummer des Wurzelpakets. Der Lockfile stand bei 0.27.0 auf 0.26.0, und das
Release lief durch. Der Schaden ist kein Build, der bricht, sondern eine Zahl, die falsch
dasteht — und je länger sie stehen bleibt, desto eher glaubt sie jemand, der von aussen
draufsieht.

**Von Hand heben, nicht mit `npm install --package-lock-only`.** Das rechnet nebenbei
Auflösungen neu und zieht damit in einen Release-Commit Änderungen an Abhängigkeiten
hinein, die niemand geprüft hat — genau das, wogegen der Pin und die Wächter der
Lieferkette stehen. Zwei Zeilen ändern, danach `npm ci --dry-run`.

**Zwei Schalter im Release-Workflow dürfen nicht auf „vorsichtig" stehen**, und beide sind
verlockend:

- **`releaseDraft: false`** — die Assets eines Entwurfs sind ohne Anmeldung nicht
  abrufbar. Ein Entwurf wäre bequem zum Nachsehen und macht den Updater blind.
- **`prerelease` nur bei einem Tag mit Bindestrich** — `releases/latest/` **überspringt
  Vorabversionen**. Bei einer App im Alpha-Stadium ist „prerelease" die naheliegende Wahl,
  und der Endpunkt liefert dann eine 404, die für den Updater aussieht wie „kein Update
  da". Bei einer Beta ist genau das der Zweck (siehe „Der Beta-Kanal").

**Der Punkt, an dem man sonst das Falsche tut:** vor dem Bauen prüfen, dass die `.env`
steht. Sie ist gitignoriert, in einem frischen Klon oder Worktree also nicht da, und die
Produktregistrierungsnummer wird zur **Bauzeit** eingebacken. Fehlt sie, ist die App
fertig und der Bankabruf tot — und das merkt man erst beim ersten Abruf.
`scripts/installieren.sh` warnt, aber es bricht nicht ab.

## Signierung: zwei Signaturen, die nichts miteinander zu tun haben

Sie werden regelmässig verwechselt, und die Verwechslung führt zu falschen Schlüssen:

| | wofür | Stand |
|---|---|---|
| **minisign** (Updater) | verhindert, dass jemand ein Update unterschiebt | liegt, Secret hinterlegt |
| **Apple** (Gatekeeper) | erlaubt, einen **frischen Download** zu starten | fehlt |

**Eine bereits laufende App aktualisiert sich auch ohne Apple-Signatur** — Gatekeeper prüft
eine App, die einmal starten durfte, nicht erneut. Die Apple-Signatur zählt für den, der auf
der Releases-Seite landet und zum ersten Mal herunterlädt. Ohne die minisign-Signatur
dagegen bricht schon der Build ab, und das setzt Tauri selbst durch.

Der Release-Workflow reicht **sechs Apple-Secrets** durch (`APPLE_CERTIFICATE`,
`APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`,
`APPLE_TEAM_ID`). Sobald sie hinterlegt sind, signiert und notarisiert `tauri-action` von
selbst — es braucht keine Änderung am Workflow mehr. **Signierung allein genügt nicht:**
Gatekeeper verlangt bei einem geladenen Bundle auch die Notarisierung, dafür sind die
letzten drei da. `APPLE_PASSWORD` ist ein app-spezifisches Kennwort, nie das echte.

### Der Türsteher, und warum er eine Weiche geworden ist

Vom 26. bis zum 28.08.2026 **brach der Workflow ab**, wenn die Apple-Secrets fehlten —
bevor irgendetwas gebaut wurde. Der Gedanke war richtig und ist es weiterhin: `tauri-action`
baut sonst klaglos ein unsigniertes Bundle und hängt es an ein öffentliches Release, und ein
Zertifikat kann man nachreichen, ein Release nicht zurückholen.

Seine Begründung stand im Workflow und nannte die Tür, die offen bleibt: *„Der LOKALE Weg
ist davon unberührt — wer auf der eigenen Maschine baut und dort installiert, weiss, was er
tut."* **Genau diese Tür ist zu**, seit lokal nicht mehr gebaut wird (siehe oben). Damit
blockierte er nicht mehr das Riskante, sondern das Einzige — und ein Wächter, der jede
Auslieferung verhindert, wird abgeschaltet statt umgangen. Das ist dieselbe Überlegung, aus
der jeder Hook hier ein `--no-verify` hat.

**Was von ihm bleibt, ist der wertvollere Teil: der Release-Text sagt die Wahrheit über den
Signierungsstand.** Der Schritt prüft weiterhin die vier Secrets, bricht aber nicht mehr ab,
sondern baut daraus den Text:

| Secrets da | Release-Text |
|---|---|
| ja | „Signiert und notarisiert." |
| nein | was macOS melden wird, dass ein frischer Download deshalb kein empfohlener Weg ist, und dass ein installierter Moneymanager davon unberührt bleibt |

Der Schaden, um den es wirklich geht, ist nicht das unsignierte Bundle — es ist ein
unsigniertes Bundle unter der Zeile „Signiert und notarisiert". Ein Release, dem man
ansieht, dass es unsigniert ist, ist ehrlich; ein Literal im Workflow wäre genau dann
falsch, wenn es darauf ankommt. Deshalb ist `releaseBody` kein fester Text mehr, sondern
die Ausgabe des Schritts.

**Und seit dem 06.09.2026 gilt dasselbe für die PLATTFORMEN.** Der Text nannte macOS,
Windows und Linux unbedingt — auch in einem Release, an dem nur zwei davon hingen. Genau
das war bei 0.27.0 der Fall: der Windows-Job stirbt an den Tests, und über einer Datei,
die nie entstand, stand „**Windows** (`.exe`)". Derselbe Schaden wie ein unsigniertes
Bundle unter „Signiert und notarisiert", nur eine Spalte weiter.

Ein Matrix-Job kann das nicht wissen — wenn er seinen Text baut, hat noch niemand gebaut.
Deshalb ist die Zuständigkeit geteilt, und der Text steht jetzt in einem eigenen Skript:

| Wer | Plattformliste | Ergebnis |
|---|---|---|
| die Matrix-Jobs | **leer** | nur der allgemeine Teil — knapp und immer wahr |
| der Job `text` danach | aus `gh release view` | die Abschnitte der Artefakte, die wirklich dranhängen |

Zwei Dinge daran sind Absicht und keine Vorsicht. **`if: always()`** am Nachjob: der
häufige Fall IST der teilweise Fehlschlag, und mit `needs` allein liefe ausgerechnet dann
nichts mehr. Und die **Artefaktliste als Quelle** statt der Job-Ergebnisse: sie kann nicht
lügen, ein grüner Job ohne hochgeladene Datei schon.

Die Fehlerform ist damit die richtige: fällt der Nachjob aus, bleibt der allgemeine Teil
stehen — unvollständig, aber nicht falsch.

Der Wächter ist dabei der Teil, der sich gelohnt hat: ein Regex über den Workflow hätte
den Fund nie gemacht, weil dort alles Richtige stand — nur eben unbedingt. Geprüft wird
deshalb die Ausgabe des Skripts bei gegebener Eingabe, und der Fall aus 0.27.0 (macOS und
Linux da, Windows nicht) steht als eigener Testfall.

**Was der unsignierte Zweig NICHT mehr enthält, ist die `xattr`-Anleitung.** Sie stand dort
bis zum 30.08.2026, und die Begründung dafür war richtig: ohne sie ist der Fehlschlag
unerklärlich — macOS meldet „beschädigt", und wer die App nicht selbst gebaut hat, hat keine
Handhabe. Sie wiegt trotzdem weniger als das, was eine öffentliche Seite **einübt**.
„Quarantäne-Merkmal abräumen, wenn eine App als beschädigt gemeldet wird" ist als Gewohnheit
genau der Griff, mit dem sich jemand das nächste Mal etwas anderes einfängt — und die
Anleitung dazu stünde bei uns. Der Zustand wird weiterhin **benannt**, nur nicht mehr
umgangen; wer ihn beheben will, hat einen Weg, und das ist das Zertifikat.

`src/auslieferung.test.ts` hält beides fest: dass der unsignierte Zweig den Zustand nennt,
und dass **im ganzen Workflow** kein Weg an Gatekeeper vorbei steht. Über den ganzen
Workflow und nicht nur über den Textschritt, weil der Weg zurück sonst eine Zeile weiter
oben läge, wo niemand hinsieht.

**Für den LOKALEN Bau bleibt die Zeile stehen** (`scripts/installieren.sh`, die
Updater-Probe weiter oben). Das ist kein Widerspruch, sondern der Unterschied, um den es
geht: wer auf der eigenen Maschine baut, räumt die Quarantäne von etwas ab, das er selbst
gerade erzeugt hat. Ein Release-Text richtet sich an jemanden, der eine fremde Datei
heruntergeladen hat.

## Drei Plattformen aus einem Workflow

Seit dem 28.08.2026 baut der Release-Workflow eine **Matrix** statt eines Jobs. Cross-Compile
gibt es bei Tauri nicht — jede Plattform braucht ihren eigenen Läufer:

| | Läufer | Bundle | signiert |
|---|---|---|---|
| macOS | `macos-latest` (arm64) | `app`, `dmg` | sobald das Zertifikat da ist |
| Linux | `ubuntu-22.04` | `appimage` | braucht es nicht |
| Windows | `windows-latest` | `nsis` | nein — SmartScreen meldet einen unbekannten Herausgeber |

Vier Entscheidungen darin, die man nicht anfassen sollte, ohne den Grund zu kennen:

- **`max-parallel: 1`, und das ist Pflicht, keine Vorsicht.** Die Datei latest.json trägt
  alle Plattformen zusammen, und tauri-action baut sie als READ-MODIFY-WRITE: es lädt die
  vorhandene vom Release, übernimmt ihre `platforms` und schreibt die eigene dazu
  (nachgesehen im Quelltext von tauri-action, Datei upload-version-json.ts, beim
  gepinnten SHA — auch nach dem Sprung auf 1.0.0 noch). Zwei Jobs, die
  gleichzeitig lesen, sehen denselben Stand — der zweite überschreibt den Eintrag des
  ersten. Der Fehlschlag ist **still**: die verlorene Plattform bekommt vom Updater
  „nichts Neues" statt eines Fehlers.
- **Den Release-Text schreibt zuletzt der Job `text`, nicht die Matrix.** Bis v0 setzte
  tauri-action Titel und Text nur beim ANLEGEN des Releases und liess ein vorgefundenes
  unberührt; seit 1.0.0 schreibt jeder Job beides neu. Beide Stände hatten dasselbe
  Problem: kein Matrix-Job weiss, was am Ende dranhängt. Deshalb liefern sie nur noch den
  allgemeinen Teil, und der Nachjob schreibt aus den Artefakten (siehe oben). Dass macOS
  weiterhin oben steht, entscheidet damit nur noch, wer das Release ANLEGT — nicht mehr,
  was drinsteht.
- **`shell: bash` am Textschritt.** Ohne ihn nimmt GitHub auf Windows PowerShell, und das
  Skript stirbt an der ersten Zeile. Ein Schritt, der auf zwei von drei Läufern
  funktioniert, fällt erst im Release auf.
- **Linux liefert NUR ein AppImage.** Ein `.deb` kann sich nicht selbst austauschen, der
  Updater könnte es nie ersetzen — es läge im Release und sähe aus wie ein Weg, der keiner
  ist. Und `ubuntu-22.04` statt `latest`, weil ein AppImage nur auf Systemen mit
  mindestens seiner Bau-glibc läuft: die älteste unterstützte Umgebung ist hier die
  richtige, nicht die neueste.

`bundle.targets` in `tauri.conf.json` bleibt auf `"all"` — das ist die Vorgabe für einen
Bau von Hand. Eingegrenzt wird im Workflow über `--bundles`.

### Ein leeres Secret ist nicht dasselbe wie kein Secret

Die Falle, die den ersten Lauf von 0.23.0 gekostet hat, und sie kostet sechseinhalb
Minuten, bevor sie sich zeigt: **ein fehlendes Secret wird in einem `env:`-Block zum leeren
String, und GitHub setzt die Variable trotzdem.** Tauri prüft „ist gesetzt", nicht „hat
Inhalt", versucht ein `security import` mit nichts und bricht beim Bündeln ab —
`SecKeychainItemImport: One or more parameters ... not valid`. Der Build davor läuft
vollständig durch.

Die sechs `APPLE_*`-Variablen entstehen deshalb über `GITHUB_ENV` und nur im signierten
Zweig. Im `env:`-Block gibt es keine Möglichkeit, einen Schlüssel WEGZULASSEN — nur, ihn
leer zu setzen, und genau das ist der Fehler.

**Zwei Tage lang war das unsichtbar**, weil der Türsteher davor abbrach: die eine Änderung
hat den Fehler der anderen verdeckt. Beide kamen im selben Schritt herein. Das ist der
allgemeine Teil daran — ein Wächter, der einen Weg sperrt, prüft den Weg dahinter nicht
mehr, und was dort verrottet, merkt niemand.

`src/auslieferung.test.ts` hält drei Dinge fest: dass der Text BERECHNET wird und nicht
behauptet, dass beide Zweige dastehen, und dass keine `APPLE_*`-Variable wieder direkt aus
ihrem Secret gesetzt wird.

**Was das Zertifikat kostet und einbringt:** Apple Developer Program, jährlich. Danach
laufen beide Wege — der Updater wie bisher, und zusätzlich kann jemand die App frisch
herunterladen und starten. Der Weg dorthin ist ein `gh run rerun` auf den bestehenden Tag,
keine Tag-Chirurgie.

**Zwei Dinge müssen ausserhalb des Repos bereitliegen**, und beide fehlen in einem frischen
Klon:

| | wo | wenn es fehlt |
|---|---|---|
| Produkt-ID | `.env` | App läuft, Bankabruf gesperrt |
| Signaturschlüssel | `~/.moneymanager-schluessel/updater.key` | **Build bricht ab** |

Der Schlüssel wird seit `createUpdaterArtifacts` bei **jedem** Build gebraucht, auch bei
einem, der mit Updates nichts vorhat. Tauri baut dabei erst alles fertig und bricht im
letzten Schritt ab — `installieren.sh` prüft deshalb vorher, statt den ganzen Build für
eine Fehlermeldung abzuwarten.
