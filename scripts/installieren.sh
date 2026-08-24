#!/usr/bin/env bash
# Baut die App und installiert sie nach /Applications (macOS).
#
#   npm run installieren
#
# WOZU ES DAS GIBT. Es gibt keinen Release-Weg: die App wird lokal gebaut und lokal
# installiert. Drei Handgriffe gehoeren dabei zusammen, und der dritte ist der, den man
# vergisst — ohne ihn startet die App nicht, und die Fehlermeldung von macOS zeigt in die
# falsche Richtung („beschaedigt").
#
# WAS SIE MIT DEN DATEN MACHT: nichts. Der Bestand liegt im App-Datenverzeichnis und
# ueberlebt jede Neuinstallation. Welche Datei die installierte App oeffnet, entscheidet
# `src/adapters/persistence/datenbankdatei.ts` — es ist NICHT dieselbe wie im
# Entwicklungsmodus.

set -euo pipefail

WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
QUELLE="$WURZEL/src-tauri/target/release/bundle/macos/Moneymanager.app"
ZIEL="/Applications/Moneymanager.app"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Dieses Skript ist fuer macOS. Auf anderen Systemen: npm run tauri build" >&2
  exit 2
fi

# Die Produktregistrierungsnummer steht in der gitignorierten `.env` und wird zur BAUZEIT
# ins Bundle gebacken (Vite ersetzt `import.meta.env` beim Buendeln). Fehlt sie jetzt,
# fehlt sie der fertigen App — und der Bankabruf meldet das erst beim ersten Versuch.
if [[ ! -f "$WURZEL/.env" ]] || ! grep -q "^VITE_FINTS_PRODUKT_ID=." "$WURZEL/.env"; then
  echo "WARNUNG: keine VITE_FINTS_PRODUKT_ID in $WURZEL/.env"
  echo "         Die App wird gebaut, aber der FinTS-Abruf bleibt gesperrt."
  echo
fi

# Der SIGNATURSCHLUESSEL. Seit `createUpdaterArtifacts` an ist, braucht JEDER Build ihn —
# auch dieser hier, der mit Updates nichts vorhat. Tauri baut erst alles fertig und bricht
# dann im letzten Schritt ab; ohne diese Pruefung wartet man also den ganzen Build ab, um
# eine Fehlermeldung zu bekommen.
#
# Er liegt ausserhalb des Repos, weil er dort nichts zu suchen hat. Eine schon gesetzte
# Variable gewinnt — so laesst sich der Schluessel woanders halten, ohne das Skript zu
# aendern.
SCHLUESSEL="${TAURI_SIGNING_PRIVATE_KEY:-$HOME/.moneymanager-schluessel/updater.key}"
if [[ ! -f "$SCHLUESSEL" && ! "$SCHLUESSEL" =~ ^dW50 ]]; then
  echo "Kein Signaturschluessel unter $SCHLUESSEL." >&2
  echo >&2
  echo "Jeder Build braucht ihn, seit der Updater eingebaut ist. Entweder den vorhandenen" >&2
  echo "Schluessel dorthin legen, oder einen neuen erzeugen:" >&2
  echo "  npx tauri signer generate --ci -p '' -w \"$SCHLUESSEL\"" >&2
  echo >&2
  echo "ACHTUNG bei einem neuen Schluessel: der oeffentliche Teil gehoert in" >&2
  echo "src-tauri/tauri.conf.json (plugins.updater.pubkey). Passt er nicht zum privaten," >&2
  echo "nimmt keine installierte App das Update an." >&2
  exit 2
fi
export TAURI_SIGNING_PRIVATE_KEY="$SCHLUESSEL"
# Muss GESETZT sein, auch leer: sonst fragt Tauri interaktiv nach und das Skript haengt.
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="${TAURI_SIGNING_PRIVATE_KEY_PASSWORD-}"

echo "==> Bauen (das dauert)"
cd "$WURZEL"
npm run tauri build

if [[ ! -d "$QUELLE" ]]; then
  echo "Gebaut, aber kein Bundle unter $QUELLE gefunden." >&2
  exit 1
fi

echo "==> Installieren nach $ZIEL"
if [[ -d "$ZIEL" ]]; then
  echo "    (bestehende Version wird ersetzt — der Datenbestand bleibt unberuehrt)"
  rm -rf "$ZIEL"
fi
cp -R "$QUELLE" "$ZIEL"

# Der Handgriff, den man vergisst. Die App ist nicht mit einem Apple-Developer-Zertifikat
# signiert; Gatekeeper haelt sie deshalb an und meldet sie als „beschaedigt", was sie nicht
# ist. Das Quarantaene-Merkmal einmal abzuraeumen ist die ganze Sache.
echo "==> Gatekeeper-Quarantaene entfernen"
xattr -dr com.apple.quarantine "$ZIEL" 2>/dev/null || true

echo
echo "Fertig: $ZIEL"
echo "Daten:  ~/Library/Application Support/de.netmechanics.moneymanager/moneymanager.db"
