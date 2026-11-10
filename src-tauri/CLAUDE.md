# Shell — CSP, Verschlüsselung, Sicherungen

Gilt für die Rust-Shell und ihre Konfiguration. Was überall gilt, steht in der Wurzel-`CLAUDE.md`.

## Die CSP ist die Sperre, nicht die Absicht

`app.security.csp` in `tauri.conf.json` erlaubt nur `'self'` und den Tauri-IPC. Das
schützt nicht gegen einen Angreifer am Schreibtisch, sondern gegen den realistischen Fall:
eine **Abhängigkeit**, die eines Tages etwas mitbringt, das niemand bestellt hat. Der
Webview hat über `db_select` und `db_execute` Vollzugriff auf den Bestand — lesen kann
fremder Code also alles. Was die CSP nimmt, ist der Rückweg: **fortschaffen kann er
nichts** — solange auch die Capabilities keinen offen lassen (nächster Abschnitt).

Drei Dinge, die man dabei wissen muss:

- **Der Bankabruf ist davon unberührt.** Er läuft über `tauri-plugin-http` durch Rust
  (`adapters/fints/transport.ts` legt einen Umleiter über `globalThis.fetch`), also am
  Webview vorbei. Die CSP sieht ihn nie; begrenzt wird er von den Capabilities.
- **`devCsp` ist getrennt und lockerer.** Vite und React-Refresh spritzen ihre Skripte
  inline ein; ohne `'unsafe-inline'` startet der Dev-Modus nicht. Die ausgelieferte
  Fassung hat es ausdrücklich nicht, und der Wächter hält das auseinander.
- **Eine Schrift aus dem Netz würde die CSP entwerten**, nicht nur ergänzen. Wer einen
  fremden Host in `font-src` und `style-src` erlauben muss, hat einen Kanal, über den sich
  Daten in einer URL hinaustragen lassen. Deshalb prüft der Wächter beides zusammen: die
  CSP und dass keine CSS-Datei etwas nachlädt. Eine CSP mit diesem Loch beruhigt, ohne zu
  wirken — und ein Wächter, der nichts sieht, ist schlimmer als keiner.

## Die Capabilities sind die zweite Hälfte derselben Sperre

Die CSP sieht nur, was der Webview SELBST ins Netz schickt. Ein Plugin läuft durch Rust
und damit an ihr vorbei: jedes Recht in `capabilities/*.json` ist eine eigene Tür, und die
CSP sieht keine davon. `src/absicherung.test.ts` hält deshalb eine **geschlossene Liste**
der Rechte — ein neues macht den Test rot, und wer es einträgt, beantwortet dabei die
Frage, ob darüber etwas hinauskommt.

**Bis 2026-11-10 stimmte „fortschaffen kann er nichts" nicht.** `opener:default` stand in
`default.json`, aus der Tauri-Vorlage übernommen und von niemandem benutzt. Es öffnet
beliebige http(s)-Adressen im Systembrowser, und eine Adresse trägt Daten. Die CSP war
dicht und der Wächter grün; die Tür stand daneben.

Dieselbe Überlegung gilt für die eigenen Kommandos, und dort heisst sie: **kein Pfad aus
dem Webview.** Jeder Name, den ein Kommando entgegennimmt, geht durch
`datenbank::einfacher_dateiname`, und zwar durch diese eine Funktion — die Prüfung stand
einmal zweifach da und fehlte an fünf Stellen (`zugang_*`, `sicherung_anlegen`). Was die
Naht leistet, ist nicht „fremder Code kann nichts": er hat den Bestand. Sie begrenzt den
Schaden AUF den Bestand, statt ihn auf alles auszudehnen, was der Nutzer erreicht. Aus
demselben Grund gibt es kein Kommando mehr, das die Datenbank mit einem Schlüssel aus dem
Webview öffnet — geöffnet wird nur über `zugang_*`.

## Was die CSP NICHT leistet

Sie hindert fremden Code nicht am **Lesen**, und sie greift nicht gegen jemanden, der als
du auf dieser Maschine läuft. Dagegen hülfe nur eine verschlüsselte Datenbank mit
Passphrase — die lohnt sich, sobald ein Bestand die Maschine verlässt (Cloud, Sync), und
solange er das nicht tut, deckt FileVault dasselbe Szenario ab.

Gegen einen **anderen Account** auf derselben Maschine greift dagegen etwas Billigeres,
und das ist seit 2026-08-26 eingebaut: die App setzt beim Start ihre `umask` auf 0077 und
zieht vorhandene Datenbankdateien auf 0600 (`src-tauri/src/dateirechte.rs`). Vorher
entstand der Bestand mit `-rw-r--r--` und war für jeden Nutzer des Rechners lesbar. Die
`umask` ist dabei die eigentliche Massnahme, nicht das `chmod`: SQLite legt `-wal` und
`-shm` bei jedem Öffnen neu an, und sie entstünden sonst wieder offen. Auf Windows greift
weder das eine noch das andere — dort deckt die Rechteverwaltung des Nutzerprofils den
Fall ab.

## Der Bestand liegt verschlüsselt

Seit 2026-08-27. **Die Einrichtung ist nicht abzulehnen** — beim ersten Start, egal ob
neuer Nutzer oder vorhandener Bestand. Es gibt kein „später" und kein „ohne
Verschlüsselung": wer beim ersten Start unter Zeitdruck steht, klickt genau das weg und
legt dann für immer offen ab, ohne es je wieder zu bemerken.

**Die Passphrase ist nicht der Schlüssel, sie wickelt ihn ein.** Ein gewürfelter
Datenschlüssel verschlüsselt die Datenbank; er selbst liegt, mit einem aus der Passphrase
abgeleiteten Schlüssel verschlüsselt, in `<name>.schluessel.json` daneben. Der Umweg
kostet eine Datei und leistet zweierlei, was direkt nicht ginge: die Passphrase zu
wechseln dauert Sekunden statt einer Neuverschlüsselung des Bestands, und ein
**Wiederherstellungscode** ist überhaupt erst möglich — er IST der Datenschlüssel in
lesbarer Form.

Fünf Dinge, die man wissen muss:

- **`PRAGMA key` gilt pro Verbindung**, und es muss als ERSTES kommen. Deshalb steht es in
  den Verbindungsoptionen und nicht in `after_connect`: dieser Haken läuft nach sqlx'
  eigenen Pragmas, und `journal_mode` liest den Dateikopf. Bei einer verschlüsselten
  Datenbank scheitert das mit „file is not a database" — einer Meldung, die nach kaputtem
  Bestand aussieht statt nach fehlendem Schlüssel.
- **Ein Pool lässt sich auch mit falschem Schlüssel anlegen.** Erst die erste echte
  Abfrage fällt um. `datenbank_oeffnen` prüft deshalb mit einem Zugriff, statt einen
  Erfolg zu melden und die App mit leeren Screens dastehen zu lassen.
- **Die Überführung ist so gelegt, dass es keinen Moment gibt, in dem beide Fassungen
  unbrauchbar sind:** sichern, daneben schreiben, nachweisen dass es heil ist, erst dann
  die alte wegwerfen. Bricht es vorher ab, steht der Altbestand unberührt da.
- **Die Sicherungen aus der Klartext-Zeit werden dabei weggeworfen** — geprüft am
  Dateikopf, nicht am Namen. Sie liegen zu lassen hiesse, den ganzen Aufwand durch die
  Hintertür wieder aufzugeben.
- **Aber nur die im Ordner `sicherungen/`.** `alte_sicherungen_wegwerfen` schaut genau
  dort; was von Hand daneben ins Datenverzeichnis gelegt wurde (`.bak-…`, `.vor-…`), sieht
  die Überführung nie und bleibt im Klartext liegen. Das ist die unangenehmere Hälfte:
  solche Kopien entstehen aus Sorgfalt vor einem riskanten Schritt, und danach denkt
  niemand mehr an sie.
- **Eine vergessene Passphrase nimmt auch das Jahresarchiv mit.** `VACUUM INTO` schreibt
  mit dem Schlüssel der offenen Verbindung; alle Sicherungen sind damit verschlüsselt.
  Deshalb ist der Wiederherstellungscode Pflicht und nicht Komfort.

**Was es NICHT leistet:** gegen Schadcode, der als der Nutzer läuft, während die App
offen ist, wirkt es nicht — der Schlüssel liegt dann im selben Speicher. Das ist Fall D
aus dem Bedrohungsmodell und bleibt Sache von CSP und Capabilities.

Die **Zeitsperre** (Einstellungen → Verschlüsselung, Vorgabe 15 Minuten, abschaltbar)
deckt den Fall ab, den weder Dateirechte noch Verschlüsselung erreichen: jemand setzt
sich an den entsperrten Rechner. Aus demselben Grund ist der Wiederherstellungscode dort
nur gegen die Passphrase einzusehen — läge er offen, wäre die Sperre umsonst.

**Ihre Frist ist eine Uhrzeit, kein Countdown** (`useZeitsperre.ts`). Ein `setTimeout`
steht still, während der Rechner schläft, und läuft danach mit dem Rest weiter; die Sperre
prüft deshalb bei jeder Rückkehr ins Fenster gegen die Uhr. Die Rückkehr selbst zählt
nicht als Bedienung — sonst verlängerte das Aufklappen des Rechners die Frist.

**Der Datenschlüssel lässt sich wechseln** (Einstellungen → Verschlüsselung, „Neuen
Schlüssel erzeugen"; `zugang_schluessel_wechseln`). Das ist der Weg für den Fall, dass der
Wiederherstellungscode bekannt geworden sein könnte: eine neue Passphrase hilft dann
nicht, der Code IST der Schlüssel. Drei Dinge daran:

- **Nicht `PRAGMA rekey`, sondern derselbe Weg wie die Überführung:** daneben schreiben
  (`sqlcipher_export`), prüfen, tauschen. Der alte Bestand bleibt unberührt, bis der neue
  nachweislich heil ist; der Preis ist Platz für eine zweite Kopie.
- **Die Hülle des neuen Schlüssels liegt auf der Platte, BEVOR umgeschrieben wird**
  (`….schluessel.json.wechsel`). Bricht es danach ab, trägt die Datei den neuen Schlüssel
  und die Hülle den alten — `zugang_entsperren` erkennt das („Passphrase stimmt, Datei
  geht nicht auf") und setzt die vorläufige ein. Es gibt keinen Zeitpunkt, an dem der
  Schlüssel der Datei in keiner Hülle steht.
- **Die Sicherungen werden mit umgeschrieben.** Sonst öffnete der alte Code weiter jeden
  früheren Stand. Was sich nicht umschreiben lässt, bleibt liegen und wird gezählt
  zurückgemeldet — weggeworfen wird dabei nichts, die Jahresstufe ist das Archiv.

## Die App sichert sich selbst, gestaffelt

Beim Start legt die App eine Sicherung des Tages an — **vor den Migrationen**, und das ist
der ganze Punkt: der Fall, für den es Sicherungen gibt, ist eine Schemaänderung, die
schiefgeht. Danach zu sichern hiesse, den kaputten Stand zu sichern.

| | |
|---|---|
| wo | `<App-Datenverzeichnis>/sicherungen/<name>-<YYYY-MM-DD>.db` |
| wie | `VACUUM INTO` — **nicht kopieren** |
| wann | beim Start, höchstens eine je Kalendertag |
| wie viele | 7 täglich · 4 wöchentlich · 3 monatlich · 2 quartalsweise · 2 halbjährlich · **jährlich ohne Ende** |

Vier Dinge, die man wissen muss:

- **`VACUUM INTO` statt Kopieren, weil eine Kopie das WAL nicht mitnimmt.** Die jüngsten
  Schreibvorgänge stehen dort und nicht in der Hauptdatei; die Kopie sähe vollständig aus
  und wäre es nicht — das merkt man erst beim Wiederherstellen.
- **Eine vorhandene Sicherung wird nicht überschrieben.** Wer die App am selben Tag zum
  dritten Mal startet, behält den Stand von heute früh: der ist der, in dem eine inzwischen
  kaputtgegangene Änderung noch nicht steckt.
- **Eine Stufe zählt vorhandene Stände, keine Kalendereinheiten.** „Vier wöchentlich"
  heisst: die vier jüngsten Sieben-Tage-Blöcke, in denen es eine Sicherung GIBT. Sonst
  bliebe von einem, der die App wochenlang nicht startet, gar nichts übrig — und genau der
  braucht seine alten Stände am dringendsten.
- **Ein Fehlschlag hält den Start nicht auf.** Wer die App öffnet, will seine Ausgaben
  sehen; dieselbe Abwägung wie bei der Update-Prüfung.
- **Die Zahlen folgen einer Regel, nicht dem Geschmack:** jede Stufe reicht genau so weit,
  wie die nächstgröbere ihre Schrittweite hat — sieben Tage bis zur Woche, vier Wochen bis
  zum Monat, drei Monate bis zum Quartal, zwei Quartale bis zum Halbjahr, zwei Halbjahre
  bis zum Jahr. Quartal und Halbjahr sind dabei kein Zierrat: ohne sie müsste die
  Monatsstufe das ganze Jahr überbrücken (zwölf Stände statt drei).

**Die Jahresstufe läuft nie aus, und das ist der wichtigste Teil.** Eine Sicherung enthält
immer den GANZEN Bestand — alte Stände tragen also keine Buchung, die der neueste nicht
auch hätte. Was sie tragen, ist der Stand, BEVOR etwas verschwand: eine versehentliche
Löschung, eine Migration, die wegnimmt (im Alpha-Stadium ausdrücklich erlaubt), ein Fehler,
den niemand bemerkt hat.

Solange die Bank die Umsätze noch führt, ist so etwas ärgerlich und behebbar — man ruft sie
neu ab. Genau das hört aber auf: Institute halten Umsätze eine begrenzte Zeit vor, danach
ist dieser Bestand die einzige Stelle, an der die Jahre davor noch stehen. Ab dann wäre
eine weggeworfene Jahressicherung nicht ein verlorener Wiederherstellungspunkt, sondern ein
verlorenes Jahr. Der Preis ist eine Datei pro Jahr — gemessen daran der billigste Posten in
diesem Projekt.

Wo was liegt: die Staffelung in `src/core/sicherung/rotation.ts` (rein, ohne Uhr), der
Use-Case in `src/application/sicherung.ts`, das Dateisystem in
`src-tauri/src/sicherung.rs`.

**Wenn der Bestand einmal verschlüsselt ist, sind es die Sicherungen mit** — `VACUUM INTO`
schreibt mit dem Schlüssel der offenen Verbindung. Das ist bequem und hat eine Kehrseite,
die in das Recovery-Konzept gehört: eine vergessene Passphrase nimmt die Sicherungen mit.

Den Spielstand schreibt `npm run seed` — vollständig migriert, mit erfundenen Daten in
jedem Bereich. Zwei Dinge daran sind Absicht:

- **Er weist `moneymanager.db` am Dateinamen ab.** Das Skript überschreibt sein Ziel
  vollständig; ein vertippter Pfad wäre nicht ein Fehler, sondern der Verlust der Daten,
  um deren Trennung es geht.
- **Sein Zufall ist gesät.** Derselbe Aufruf erzeugt denselben Bestand — ein Screenshot von
  gestern zeigt dieselben Zahlen wie einer von heute.

Die Daten selbst stehen in `src/testwerkzeug/seedDaten.ts`, nicht im Skript. Der Grund ist
derselbe wie bei allen Wächtern hier: ein Seed **verrottet still**, wenn die Kette wandert
und seine INSERTs stehenbleiben, und der Fehler zeigt sich erst, wenn man eigentlich etwas
anderes vorhatte. `src/seed.test.ts` fährt ihn deshalb bei jedem `npm test` gegen die
aktuelle Migrationskette.
