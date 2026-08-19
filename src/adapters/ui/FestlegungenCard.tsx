// Die Liste der Kategorie-Festlegungen — „immer bei diesem Empfänger".
//
// Angelegt werden sie am Einzelfall (Review-Inbox, Buchungsdialog), wo man den Beleg vor
// Augen hat. Hier stehen sie zusammen, und hier lassen sie sich wieder aufheben. Ohne
// diesen Ort wäre die Festlegung eine Einbahnstraße: sie wirkt auf jeden künftigen Import,
// und wer nicht mehr weiß, warum eine Kategorie immer wieder dieselbe ist, hätte keine
// Stelle zum Nachsehen.
//
// Bewusst KEIN Anlegen-Knopf. Eine Festlegung aus dem Nichts einzutippen hieße, ein Muster
// zu raten, statt es an einer echten Zahlung abzulesen — und genau daraus entstünde die
// Regelliste, die der ganze Ansatz vermeiden soll.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Kategorie, Kategoriefestlegung } from "../../application";
import { festlegungEntfernen, festlegungen as festlegungenLaden } from "../dienste";
import { Card, DataTable } from "./ds";

import { fehlerNachricht, useGeld } from "./einstellungenKontext";

export function FestlegungenCard({ kategorien }: { kategorien: Kategorie[] }) {
  const { t } = useTranslation();
  const { locale } = useGeld();
  const [festlegungen, setFestlegungen] = useState<Kategoriefestlegung[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  // Geladen wird beim Betreten des Registers — die Komponente entsteht ohnehin erst
  // dann. Vorher hing das am ersten Aufklappen der Karte.
  useEffect(() => {
    void laden();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function laden() {
    setFehler(null);
    try {
      setFestlegungen(await festlegungenLaden());
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    }
  }

  async function aufheben(muster: string) {
    try {
      await festlegungEntfernen(muster);
      await laden();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    }
  }

  const kategorieName = new Map(kategorien.map((k) => [k.id, k.name]));

  const zeilen = (festlegungen ?? []).map((f) => ({
    muster: f.muster,
    // Zeigt eine Festlegung auf eine gelöschte Kategorie, ist das kein Anzeigefehler,
    // sondern der Grund, sie aufzuheben — also benennen statt verstecken.
    kategorie: kategorieName.get(f.kategorieId) ?? t("einstellungen.festlegung.kategorieWeg"),
    angelegt: new Date(f.angelegtAm).toLocaleDateString(locale),
  }));

  return (
    <Card>
      {fehler && <div className="err">{fehler}</div>}
      {festlegungen === null ? (
        <div className="muted">{t("einstellungen.festlegung.laedt")}</div>
      ) : festlegungen.length === 0 ? (
        <div className="muted">{t("einstellungen.festlegung.leer")}</div>
      ) : (
        <>
          <div className="muted" style={{ fontSize: "var(--fs-xs)", marginBottom: "var(--sp-3)" }}>
            {t("einstellungen.festlegung.hinweis")}
          </div>
          <DataTable
            columns={[
              { key: "muster", label: t("einstellungen.festlegung.spalteMuster") },
              { key: "kategorie", label: t("einstellungen.festlegung.spalteKategorie") },
              { key: "angelegt", label: t("einstellungen.festlegung.spalteAngelegt") },
              {
                key: "weg",
                label: "",
                align: "right",
                sortable: false,
                render: (r: { muster: string }) => (
                  <button className="linkbtn" onClick={() => aufheben(r.muster)}>
                    {t("einstellungen.festlegung.aufheben")}
                  </button>
                ),
              },
            ]}
            rows={zeilen}
            sortable
            pageSize={20}
          />
        </>
      )}
    </Card>
  );
}
