// Konten verwalten — Liste, Bearbeiten, Löschen, und der Weg zum Anlegen.
//
// Bis 2026-08-18 lag das als Karte in den Einstellungen. Ein Konto ist aber kein
// Einstellungswert: es hat einen Stand, eine Bankverbindung und bald einen Abruf auf
// Knopfdruck. Deshalb steht es jetzt unter „Konten" neben der Übersicht.
//
// Das ANLEGEN läuft über einen eigenen Dialog (KontoAnlegenModal), weil dort die Weiche
// online/offline sitzt. Das BEARBEITEN bleibt hier: ein bestehendes Konto umzubenennen
// oder seinen Anfangsbestand zu korrigieren hat mit der Bankverbindung nichts zu tun.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  KONTOTYPEN,
  istSummeKonto,
  minorZuMajor,
  realerKontostand,
  type IstBuchung,
  type Kontotyp,
  type Person,
  type Zahlungskonto,
} from "../../core";
import { kontoAnlegen } from "../../application/stammdatenAnlegen";
import { sqliteZahlungskontoRepository as kontoRepo } from "../persistence/sqliteStammdatenRepositories";
import { Button, Card, DataTable, FormField, Pill } from "./ds";
import { KontoAnlegenModal } from "./KontoAnlegenModal";
import { Modal } from "./Modal";
import { fehlerNachricht, useGeld } from "./einstellungenKontext";

export function KontenVerwaltung({
  konten,
  personen,
  personName,
  ist,
  onlineKonten,
  onChange,
}: {
  konten: Zahlungskonto[];
  personen: Person[];
  personName: Map<string, string>;
  ist: IstBuchung[];
  /** Konten, die an einer Bankverbindung hängen. */
  onlineKonten: ReadonlySet<string>;
  onChange: () => void;
}) {
  const { t } = useTranslation();
  const geld = useGeld();
  const hatIst = ist.some((b) => b.planRef || b.quelle === "import");
  const [offen, setOffen] = useState(false);
  const [anlegen, setAnlegen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [bezeichnung, setBezeichnung] = useState("");
  const [typ, setTyp] = useState<Kontotyp>("Giro");
  const [iban, setIban] = useState("");
  const [inhaberIds, setInhaberIds] = useState<string[]>([]);
  const [saldoText, setSaldoText] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);

  function toggleInhaber(id: string) {
    setInhaberIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }
  function bearbeiten(k: Zahlungskonto) {
    setEditId(k.id);
    setBezeichnung(k.bezeichnung);
    setTyp(k.typ);
    setIban(k.iban ?? "");
    setInhaberIds([...k.inhaberIds]);
    setSaldoText(String(minorZuMajor(k.saldo, geld.waehrung)));
    setFehler(null);
    setOffen(true);
  }
  async function speichern() {
    setFehler(null);
    try {
      await kontoAnlegen(kontoRepo, { bezeichnung, typ, iban, inhaberIds, saldo: geld.parse(saldoText) ?? 0 }, editId ?? undefined);
      setOffen(false);
      onChange();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    }
  }

  return (
    <Card action={<Button variant="primary" plus onClick={() => setAnlegen(true)}>{t("einstellungen.konto.anlegen")}</Button>}>
      {hatIst && (
        <div className="muted" style={{ fontSize: "var(--fs-xs)", marginBottom: "var(--sp-3)" }}>
          {t("einstellungen.konto.untertitelIst")}
        </div>
      )}
      {konten.length === 0 ? (
        <div className="muted">{t("einstellungen.konto.leer")}</div>
      ) : (
        <DataTable
          columns={[
            { key: "bezeichnung", label: t("einstellungen.konto.spalteBezeichnung") },
            { key: "typ", label: t("einstellungen.konto.spalteTyp"), render: (k) => t(`einstellungen.konto.typ.${k.typ}`) },
            {
              key: "verbindung",
              label: t("konten.spalteVerbindung"),
              render: (k) =>
                onlineKonten.has(k.id) ? (
                  <Pill variant="ok">{t("konten.online")}</Pill>
                ) : (
                  <Pill variant="neutral">{t("konten.offline")}</Pill>
                ),
            },
            { key: "iban", label: t("einstellungen.konto.spalteIban"), render: (k) => k.iban ?? "—" },
            { key: "inhaber", label: t("einstellungen.konto.spalteInhaber"), render: (k) => (k.inhaberIds.length ? k.inhaberIds.map((id: string) => personName.get(id) ?? "?").join(", ") : "—") },
            { key: "saldo", label: `${hatIst ? t("einstellungen.konto.spalteAnfangsbestand") : t("einstellungen.konto.spalteKontostand")} ${geld.symbol}`, align: "right", render: (k) => geld.format(k.saldo) },
            ...(hatIst
              ? [
                  { key: "ist", label: `${t("einstellungen.konto.spalteIst")} ${geld.symbol}`, align: "right" as const, render: (k: Zahlungskonto) => (istSummeKonto(ist, k.id) ? geld.format(istSummeKonto(ist, k.id), { mitVorzeichen: true }) : "—") },
                  { key: "real", label: `${t("einstellungen.konto.spalteRealerStand")} ${geld.symbol}`, align: "right" as const, render: (k: Zahlungskonto) => <span style={{ fontWeight: "var(--fw-bold)" }}>{geld.format(realerKontostand(k, ist))}</span> },
                ]
              : []),
            { key: "_e", label: "", align: "right", render: (k) => <button className="linkbtn" onClick={() => bearbeiten(k)}>{t("einstellungen.bearbeiten")}</button> },
            { key: "_x", label: "", align: "right", render: (k) => <button className="linkbtn" onClick={() => kontoRepo.loeschen(k.id).then(onChange)}>{t("einstellungen.loeschen")}</button> },
          ]}
          rows={konten}
        />
      )}
      {offen && (
        <Modal
          title={editId ? t("einstellungen.konto.modalBearbeiten") : t("einstellungen.konto.modalAnlegen")}
          onClose={() => setOffen(false)}
          footer={<><Button variant="primary" onClick={speichern}>{t("einstellungen.speichern")}</Button><button className="linkbtn" onClick={() => setOffen(false)}>{t("einstellungen.abbrechen")}</button>{fehler && <span className="err">{fehler}</span>}</>}
        >
          <div className="form-grid">
            <FormField label={t("einstellungen.konto.feldBezeichnung")} required>
              <input className="field" value={bezeichnung} onChange={(e) => setBezeichnung(e.target.value)} placeholder={t("einstellungen.konto.feldBezeichnungPlaceholder")} />
            </FormField>
            <FormField label={t("einstellungen.konto.feldTyp")}>
              <select className="field" value={typ} onChange={(e) => setTyp(e.target.value as Kontotyp)}>
                {KONTOTYPEN.map((kt) => (<option key={kt} value={kt}>{t(`einstellungen.konto.typ.${kt}`)}</option>))}
              </select>
            </FormField>
            <FormField label={t("einstellungen.konto.feldIban")} hint={t("einstellungen.konto.feldIbanHinweis")}>
              <input className="field" value={iban} onChange={(e) => setIban(e.target.value)} placeholder={t("einstellungen.konto.ibanPlatzhalter")} />
            </FormField>
            <FormField label={t("einstellungen.konto.feldKontostand")} hint={t("einstellungen.konto.feldKontostandHinweis")}>
              <input className="field" inputMode="decimal" value={saldoText} onChange={(e) => setSaldoText(e.target.value)} placeholder={geld.format(0)} />
            </FormField>
            <FormField label={t("einstellungen.konto.feldInhaber")}>
              {personen.length === 0 ? (
                <span className="muted">{t("einstellungen.konto.feldInhaberLeer")}</span>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-3)", paddingTop: 4 }}>
                  {personen.map((p) => (
                    <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--fs-sm)" }}>
                      <input type="checkbox" checked={inhaberIds.includes(p.id)} onChange={() => toggleInhaber(p.id)} />
                      {p.name}
                    </label>
                  ))}
                </div>
              )}
            </FormField>
          </div>
        </Modal>
      )}
      {anlegen && (
        <KontoAnlegenModal
          personen={personen}
          konten={konten}
          onClose={() => setAnlegen(false)}
          onGespeichert={onChange}
        />
      )}
    </Card>
  );
}

