// Abrufen — der Knopf, hinter dem eine Banksitzung steckt.
//
// Gefragt wird nur nach der PIN: alles andere (Bank, Zugangsname, welche Konten) steht
// schon am Zugang und an den Zuordnungen. Die PIN wird nicht gespeichert — sie lebt in
// diesem State und ist mit dem Schließen weg.
//
// Was danach passiert, ist genau der Weg des Dateiimports: die abgerufenen Umsätze
// laufen durch dieselbe Übernahme mit Dedup, Kategorie-Vorschlag und Review-Inbox. Der
// Abruf ist nur eine andere Quelle, kein zweiter Import.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Bankzugang, TanHerausforderung } from "../../application/fints/abrufPort";
import { abrufAusfuehren, type AbrufBefund } from "../../application/fints/abrufAusfuehren";
import { kategorisierungsquellen } from "../../application/kategorisierungsquellen";
import { fintsAbruf } from "../fints";
import {
  sqliteBankzugangRepository,
  sqliteKontozuordnungRepository,
} from "../persistence/sqliteBankzugangRepositories";
import { sqliteImportLaufRepository, sqliteUmsatzRepository } from "../persistence/sqliteImportRepositories";
import { sqliteKategoriefestlegungRepository } from "../persistence/sqliteKategoriefestlegungRepository";
import { sqliteKlassifikatorRepository } from "../persistence/sqliteKlassifikatorRepository";
import { sqliteMerkmalskonfigurationRepository } from "../persistence/sqliteMerkmalskonfigurationRepository";
import {
  sqliteKategorieRepository,
  sqliteZahlungskontoRepository,
} from "../persistence/sqliteStammdatenRepositories";
import { sqliteVertragRepository } from "../persistence/sqliteVertragRepository";
import { sqliteVertragserkennungRepository } from "../persistence/sqliteVertragZuordnungRepositories";
import { TanDialog, type TanFrage } from "./TanDialog";
import { Button, FormField } from "./ds";
import { Modal } from "./Modal";

function heuteIso(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

export function AbrufDialog({ onClose, onFertig }: { onClose: () => void; onFertig: () => void }) {
  const { t } = useTranslation();
  const [zugaenge, setZugaenge] = useState<Bankzugang[]>([]);
  const [zugangId, setZugangId] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [befunde, setBefunde] = useState<AbrufBefund[] | null>(null);
  const [tanFrage, setTanFrage] = useState<TanFrage | null>(null);

  useEffect(() => {
    sqliteBankzugangRepository
      .alle()
      .then((z) => {
        setZugaenge(z);
        setZugangId(z[0]?.id ?? "");
      })
      .catch(() => setZugaenge([]));
  }, []);

  function frageTan(h: TanHerausforderung): Promise<string | undefined> {
    return new Promise((antworten) => setTanFrage({ herausforderung: h, antworten }));
  }

  async function abrufen() {
    const zugang = zugaenge.find((z) => z.id === zugangId);
    if (!zugang) return;
    setBusy(true);
    setFehler(null);
    try {
      const ergebnis = await abrufAusfuehren(zugang, pin, frageTan, {
        adapter: fintsAbruf,
        zugangRepo: sqliteBankzugangRepository,
        zuordnungRepo: sqliteKontozuordnungRepository,
        kontoRepo: sqliteZahlungskontoRepository,
        kategorieRepo: sqliteKategorieRepository,
        umsatzRepo: sqliteUmsatzRepository,
        laufRepo: sqliteImportLaufRepository,
        id: () => crypto.randomUUID(),
        // Dieselbe Kette wie beim Dateiimport: Umbuchung → Festlegung → Vertrag → Modell.
        kategorisierung: await kategorisierungsquellen({
          kategorieRepo: sqliteKategorieRepository,
          festlegungRepo: sqliteKategoriefestlegungRepository,
          vertragRepo: sqliteVertragRepository,
          erkennungRepo: sqliteVertragserkennungRepository,
          klassifikatorRepo: sqliteKlassifikatorRepository,
          merkmalRepo: sqliteMerkmalskonfigurationRepository,
        }),
        heute: heuteIso(),
      });
      setBefunde(ergebnis);
      setPin("");
      onFertig();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Modal
        title={t("konten.abruf.titel")}
        subtitle={t("konten.abruf.untertitel")}
        onClose={onClose}
        footer={
          befunde ? (
            <Button variant="primary" onClick={onClose}>
              {t("konten.abruf.fertig")}
            </Button>
          ) : (
            <>
              <Button variant="primary" onClick={() => void abrufen()}>
                {busy ? t("konten.abruf.laeuft") : t("konten.abruf.starten")}
              </Button>
              <button className="linkbtn" onClick={onClose}>
                {t("einstellungen.abbrechen")}
              </button>
              {fehler && <span className="err">{fehler}</span>}
            </>
          )
        }
      >
        {zugaenge.length === 0 && <div className="muted">{t("konten.abruf.keinZugang")}</div>}

        {zugaenge.length > 0 && !befunde && (
          <>
            {zugaenge.length > 1 && (
              <FormField label={t("konten.abruf.feldZugang")}>
                <select className="field" value={zugangId} onChange={(e) => setZugangId(e.target.value)}>
                  {zugaenge.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.bezeichnung}
                    </option>
                  ))}
                </select>
              </FormField>
            )}
            <FormField label={t("bankabruf.feldPin")} required hint={t("bankabruf.feldPinHinweis")}>
              <input className="field" type="password" value={pin} onChange={(e) => setPin(e.target.value)} autoComplete="off" autoFocus />
            </FormField>
          </>
        )}

        {befunde && (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {befunde.map((b) => (
              <li key={b.zahlungskontoId + b.von} style={{ borderTop: "1px solid var(--line-soft)", padding: "var(--sp-2) 0" }}>
                <strong>{b.bezeichnung}</strong>{" "}
                <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>
                  {b.von} – {b.bis}
                  {b.format ? ` · ${b.format}` : ""}
                </span>
                <div>
                  {b.fehler ? (
                    <span className="err">{b.fehler}</span>
                  ) : (
                    t("konten.abruf.zeile", {
                      eingelesen: b.ergebnis?.eingelesen ?? 0,
                      neu: b.ergebnis?.neu ?? 0,
                      duplikate: b.ergebnis?.duplikate ?? 0,
                    })
                  )}
                </div>
              </li>
            ))}
            {befunde.length === 0 && <li className="muted">{t("konten.abruf.keineZuordnung")}</li>}
            <li className="muted" style={{ fontSize: "var(--fs-xs)", paddingTop: "var(--sp-3)" }}>
              {t("konten.abruf.weiterInInbox")}
            </li>
          </ul>
        )}
      </Modal>

      {tanFrage && <TanDialog frage={tanFrage} onFertig={() => setTanFrage(null)} />}
    </>
  );
}
