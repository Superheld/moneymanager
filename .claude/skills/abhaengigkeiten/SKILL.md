---
name: abhaengigkeiten
description: "Die Lieferkette des Moneymanager: npm audit, cargo-deny und deny.toml, npm audit signatures, die Allowlist der Install-Skripte, Dependabot, an SHAs gepinnte Actions, der Pin von lib-fints. Laden bei Sicherheitsupdates, Advisories, Dependabot-Vorschlägen oder wenn eine Abhängigkeit gehoben wird."
---

# Abhängigkeiten

Was überall gilt, steht in der Wurzel-`CLAUDE.md`.

## Die Lieferkette

Vier Wächter in der CI (`.github/workflows/ci.yml`), und sie finden verschiedene Dinge:

| | prüft | wo konfiguriert |
|---|---|---|
| `npm audit --omit=dev --audit-level=high` | **bekannte Lücken**, npm-Seite | Flags im Workflow |
| `cargo-deny check advisories sources` | **bekannte Lücken**, Rust-Seite | `deny.toml` |
| `npm audit signatures` | **Herkunft**: kam das Paket wirklich von der Registry | — |
| `scripts/install-skripte-pruefen.mjs` | **Ausführung beim Installieren** | `allowScripts` in `package.json` |

Die dritte und vierte Zeile fangen etwas anderes als die ersten beiden: nicht „bekannte
Lücke", sondern „untergeschoben" bzw. „läuft ungefragt". **Der vierte ist der wichtigste**
— ein `postinstall` läuft mit den Rechten dessen, der `npm ci` tippt, vor jedem Test und
in jeder CI. Eine Lücke IM Code muss erst erreicht werden; ein Install-Skript läuft von
selbst.

**Warum dort eine Allowlist steht und kein `ignore-scripts=true`:** gemessen, nicht
vermutet — ein globales Verbot bricht den Build. `lib-fints` kommt aus einem
Git-Repository und wird beim Installieren über sein `prepare`-Skript gebaut; ohne das
fehlt sein `dist/`, und Vite bricht mit „failed to resolve import" ab. Ein Verbot, das
den Build kostet, wird abgeschaltet. Freigeben mit `npm install-scripts approve <paket>`,
und der Moment der Freigabe ist die Gelegenheit hinzusehen.

**Der Wochenlauf ist kein Beiwerk.** Beide Advisory-Datenbanken ändern sich ohne unser
Zutun: eine Schwachstelle wird gemeldet, während hier niemand etwas tippt. Ein Lauf, der
nur bei Push startet, findet sie erst beim nächsten Commit — bei einem Solo-Projekt
können das Wochen sein.

**Die Actions hängen an Commit-SHAs**, nicht an Tags. Ein Tag ist beweglich; wer ihn
kontrolliert, führt Code in unserer CI aus, und die hat das Signaturgeheimnis. Der Preis:
SHAs altern stumm — deshalb steht `github-actions` in `.github/dependabot.yml`, das sie
hebt und den Tag als Kommentar dahinterschreibt.

Der Rust-Wächter läuft als **eigener Job, der nichts baut** — `cargo-deny` liest nur
`Cargo.lock` und die RustSec-Datenbank. Damit bleibt die Entscheidung bestehen, den
schweren Tauri-Build aus der CI herauszuhalten.

**Und weil dieser Job nichts baut, sagt er über einen Rust-Vorschlag weniger, als sein
grüner Haken vermuten lässt.** `app` baut ausschliesslich das Frontend, `lieferkette` liest
nur den Lockfile — ein Dependabot-PR auf eine Rust-Kiste ist also grün, ohne dass je ein
Compiler auf ihn gesehen hat. Genau daran ist ein Vorschlag schon aufgelaufen: die
Versionszeile stimmte, der Aufruf im Code war seit dem Major weg. **Eine Rust-Abhängigkeit
wird deshalb lokal gebaut, bevor sie hereinkommt** — `cargo build --bins --lib` dauert im warmen
Cache Sekunden. Das ist keine Nachlässigkeit der CI, sondern der Preis der Entscheidung,
den schweren Build draussen zu lassen; er ist es weiterhin wert, aber er wird hier bezahlt.

Der Wächter über die Vorschläge selbst ist `src/lieferkette.test.ts`: er hält fest, dass es
alle drei Ökosysteme gibt und dass **jedes** auf `develop` zielt. Der Fehler entsteht nicht
beim Ändern der Datei, sondern beim Ergänzen eines vierten Eintrags.

Drei Dinge, die man beim Kalibrieren wissen muss, weil sie sonst zu Dauerrot führen —
und ein Wächter, der bei jedem Lauf dasselbe meldet, wird abgeschaltet statt gelesen:

- **`unmaintained` gilt nur für den Workspace.** Sonst fällt bei jedem Lauf halb Tauri
  an: die GTK3-Bindings, `proc-macro-error`, die `unic-*`-Reihe. Alle transitiv, keine
  von hier aus wechselbar. **Schwachstellen zählen weiterhin überall im Baum** — nur die
  Wartungslage nicht.
- **Lizenzen werden nicht geprüft.** Eigene Frage, eigene Kriterien; eine halb gepflegte
  Allowlist nähme die Schwachstellenprüfung mit in den Abgrund.
- **Jede Einzelfreigabe trägt ihren Grund in `deny.toml`.** Ohne ihn steht dort in einem
  Jahr eine Kennung, die niemand mehr einordnen kann — und die deshalb bleibt.

`lib-fints` hängt an einem **Commit-SHA**, nicht mehr an einem Branch. Ein beweglicher
Ref bedeutet, dass ein `npm update` stillschweigend fremden Code einzieht; der Lockfile
allein schützt nur, solange niemand ihn erneuert.

Die Kehrseite des Pins: **`node_modules` gehört keinem Branch.** Wer von `develop`
abzweigt, während ein neuerer Lib-Stand installiert ist, bekommt rote Typfehler in
Dateien, die er nie angefasst hat. Das ist kein Fund, sondern die Divergenz — entweder den
Lib-Branch mergen oder `npm ci`.
