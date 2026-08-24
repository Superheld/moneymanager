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
