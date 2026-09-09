#!/usr/bin/env bash
#
# Der Release-Text — an EINER Stelle, aus dem, was wirklich vorliegt.
#
# Zwei Angaben gehen hinein, und beide sind Befunde, keine Behauptungen:
#
#   SIGNIERT      "ja" | "nein"  — ob die Apple-Secrets hinterlegt sind
#   PLATTFORMEN   Liste aus "macos", "linux", "windows", leer erlaubt
#                 — welche Artefakte am Release WIRKLICH haengen
#
# Warum das Skript ueberhaupt existiert: der Text stand bis zum 06.09.2026 inline im
# Workflow und nannte alle drei Plattformen unbedingt. Der Windows-Job scheitert aber
# seit mehreren Releases an den Tests, und das Release trug daraufhin einen Abschnitt
# „**Windows** (.exe)" ueber einer Datei, die es nicht gab. Das ist derselbe Schaden,
# gegen den der Signierungs-Zweig gebaut wurde — ein Text, der etwas zusichert, was das
# Release nicht haelt —, nur an der Plattform statt an der Signatur.
#
# Ein Matrix-Job kann das nicht wissen: wenn er seinen Text baut, hat noch niemand
# gebaut. Deshalb ruft ihn die Matrix mit LEERER Liste (dann steht nur der allgemeine
# Teil da, und der stimmt immer), und ein Job NACH der Matrix schreibt ihn mit der
# echten Liste neu. Faellt dieser Job aus, bleibt der allgemeine Teil stehen: knapp,
# aber wahr. Das ist die Fehlerform, die wir wollen.

set -euo pipefail

signiert="${SIGNIERT:-nein}"
plattformen=" ${PLATTFORMEN:-} "

hat() { [[ "$plattformen" == *" $1 "* ]]; }

echo "Lokale Haushalts-Finanz-App, Stadium **Alpha**."
echo
echo "Der Bestand wird beim ersten Start verschluesselt — die Passphrase wird dabei"
echo "gesetzt, und der Wiederherstellungscode gehoert aufgeschrieben."

if hat macos; then
  echo
  echo "**macOS** (\`.dmg\`)"
  echo
  if [ "$signiert" = "ja" ]; then
    echo "Signiert und notarisiert."
  else
    # KEINE ANLEITUNG, DIE GATEKEEPER AUSHEBELT — auch nicht fuer die eigene App.
    #
    # Bis zum 30.08.2026 stand hier die xattr-Zeile, mit der Begruendung, ihr Weglassen
    # mache den Fehlschlag unerklaerlich. Der Einwand stimmt und wiegt trotzdem weniger:
    # ein Release-Text ist eine oeffentliche Seite, und was dort steht, uebt jemand ein.
    # „Quarantaene-Merkmal abraeumen, wenn eine App als beschaedigt gemeldet wird" ist
    # als Gewohnheit genau der Griff, mit dem man sich das naechste Mal etwas anderes
    # einfaengt — und dann steht die Anleitung dafuer bei uns.
    #
    # Der Zustand wird deshalb weiterhin BENANNT, nur nicht mehr umgangen. Wer ihn
    # beheben will, hat einen Weg: das Zertifikat.
    echo "Nicht mit einem Apple-Zertifikat signiert: macOS meldet die App beim ersten"
    echo "Start als „beschaedigt“ und startet sie nicht. Beschaedigt ist sie nicht —"
    echo "es fehlt die Signatur. Solange das so ist, ist der frische Download auf"
    echo "macOS kein Weg, den wir empfehlen."
  fi
fi

if hat windows; then
  echo
  echo "**Windows** (\`.exe\`)"
  echo
  echo "Nicht mit einem Authenticode-Zertifikat signiert: SmartScreen meldet einen"
  echo "unbekannten Herausgeber. Ueber \"Weitere Informationen\" laesst sich der Start"
  echo "erlauben."
fi

if hat linux; then
  echo
  echo "**Linux** (\`.AppImage\`)"
  echo
  echo "Ausfuehrbar machen und starten; eine Signatur braucht es hier nicht. Nur das"
  echo "AppImage kann sich selbst aktualisieren — ein \`.deb\` koennte das nie, deshalb"
  echo "gibt es keins."
fi

echo
echo "Ein bereits installierter Moneymanager aktualisiert sich ohne all das: der"
echo "Updater prueft seine eigene Signatur, und die ist unabhaengig davon."
