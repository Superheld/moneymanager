// Konten verwalten — Anlegen, Bearbeiten, Löschen, Bankverbindung.
//
// Getrennt von der Konten-ÜBERSICHT, und die Trennung folgt der Frage, was man gerade
// tut: die Übersicht ist die tägliche Sicht auf Stände und Buchungen, das hier ist der
// Ort, an dem ein Konto entsteht oder seine Verbindung bekommt. Deshalb steht sie unter
// Überblick und dieser Screen unter Verwaltung.
//
// Zwei Register: die Konten selbst und die Bankzugänge dahinter. Der Bankabruf-Screen lag
// bis 2026-08-18 unter Import — dort war er nur, weil er als Erprobung entstanden ist.

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Kontostand, Person, Zahlungskonto } from "../../../application";
import {
  bankzugaenge,
  kontozuordnungen,
  kontozuordnungLoeschen,
  stammdaten,
} from "../../dienste";
import { Bereich } from "../bausteine/Bereich";
import { AbgleichBereich } from "./AbgleichBereich";
import { BankzugaengeScreen } from "./BankzugaengeScreen";
import { HerkunftBereich } from "./HerkunftBereich";
import { KontenVerwaltung, type KontoVerbindung } from "./KontenVerwaltung";

export function KontenVerwaltungScreen() {
  const { t } = useTranslation();
  const [personen, setPersonen] = useState<Person[]>([]);
  const [konten, setKonten] = useState<Zahlungskonto[]>([]);
  const [kontostaende, setKontostaende] = useState<readonly Kontostand[]>([]);
  const [hatGebuchtes, setHatGebuchtes] = useState(false);
  const [verbindungen, setVerbindungen] = useState<Map<string, KontoVerbindung>>(new Map());

  // Zusammen laden und zusammen setzen: gestaffelte setState lassen die abgeleiteten
  // Werte (realer Stand, Inhaber-Namen) kurz gegen leere Listen rechnen.
  async function laden() {
    const [daten, zuordnungen, zugaenge] = await Promise.all([
      stammdaten(),
      kontozuordnungen(),
      bankzugaenge(),
    ]);
    setPersonen([...daten.personen]);
    setKonten([...daten.konten]);
    setKontostaende(daten.kontostaende);
    setHatGebuchtes(daten.hatGebuchtes);
    setVerbindungen(
      new Map(
        zuordnungen.map((z) => [
          z.zahlungskontoId,
          {
            zugangId: z.zugangId,
            zugangName: zugaenge.find((b) => b.id === z.zugangId)?.bezeichnung ?? z.zugangId,
            schluessel: z.schluessel,
            letzterAbrufBis: z.letzterAbrufBis,
          },
        ]),
      ),
    );
  }

  useEffect(() => {
    laden().catch(() => {
      /* reiner Browser-Modus ohne SQLite */
    });
  }, []);

  const personName = useMemo(() => new Map(personen.map((p) => [p.id, p.name])), [personen]);


  return (
    <Bereich
      titel={t("konten.verwaltungTitel")}
      register={[
        {
          id: "konten",
          label: t("konten.registerKonten"),
          untertitel: t("einstellungen.konto.untertitel"),
          inhalt: () => (
            <KontenVerwaltung
              konten={konten}
              personen={personen}
              personName={personName}
              kontostaende={kontostaende}
              hatGebuchtes={hatGebuchtes}
              verbindungen={verbindungen}
              onTrennen={async (v) => {
                // Nur die Zuordnung fällt weg — der Zugang bleibt, er kann weitere
                // Konten tragen. Was schon importiert wurde, bleibt ebenfalls stehen.
                await kontozuordnungLoeschen(v.zugangId, v.schluessel);
                await laden();
              }}
              onChange={() => void laden()}
            />
          ),
        },
        {
          id: "abgleich",
          label: t("konten.abgleichBereich.register"),
          untertitel: t("konten.abgleichBereich.untertitel"),
          inhalt: () => <AbgleichBereich />,
        },
        {
          id: "herkunft",
          label: t("konten.herkunft.register"),
          untertitel: t("konten.herkunft.untertitel"),
          inhalt: () => <HerkunftBereich />,
        },
        {
          id: "zugaenge",
          label: t("konten.registerZugaenge"),
          untertitel: t("bankzugaenge.untertitel"),
          inhalt: () => (
            <BankzugaengeScreen kontoNamen={new Map(konten.map((k) => [k.id, k.bezeichnung]))} />
          ),
        },
      ]}
    />
  );
}
