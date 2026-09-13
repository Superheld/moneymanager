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
import type { TFunction } from "i18next";
import {
  KONTOTYPEN,
  minorZuMajor,
  KONTOKLASSEN,
  klasseVorschlag,
  istAktiv,
  istLoeschbar,
  type Kontoloeschung,
  type Kontoklasse,
  type Kontostand,
  type Kontotyp,
  type Person,
  type Zahlungskonto,
} from "../../../application";
import {
  kontoAnlegen,
  kontoLoeschen,
  kontoloeschung,
  kontoStilllegen,
  kontoVollstaendigLoeschen,
  kontoWiederaufnehmen,
} from "../../dienste";
import { Button, Card, DataTable, FormField, Pill } from "../bausteine";
import { Auswahl } from "../bausteine/Auswahl";
import { Zeilenlink } from "../bausteine/Zeilenlink";
import { HerkunftBereich } from "./HerkunftBereich";
import { IconButton } from "../bausteine/IconButton";
import { KontoAnlegenModal } from "./KontoAnlegenModal";
import { Modal } from "../bausteine/Modal";
import { fehlerNachricht, useGeld } from "../bausteine/einstellungenKontext";
import { geldFarbe } from "../bausteine/geldFarbe";
import { useLoeschfrage } from "../bausteine/Loeschfrage";

/**
 * Die Sperren als Aufzählung — „3 Buchungen, 214 importierte Zahlungen und eine
 * Bankverbindung".
 *
 * **Nur was zählt, kommt hinein.** Ein „0 Buchungen" in einer Begründung liest sich wie ein
 * Fehler im Programm, und es verlängert einen Satz, der ohnehin schon erklärt, was der
 * Nutzer nicht tun kann. Deshalb wird gefiltert und nicht formatiert.
 */
function teileText(t: TFunction, teile: readonly (string | null)[]): string {
  const da = teile.filter((x): x is string => x !== null);
  if (da.length <= 1) return da[0] ?? "";
  return `${da.slice(0, -1).join(", ")} ${t("konten.und")} ${da[da.length - 1]}`;
}

/** Was das Löschen SPERRT. */
function sperrenText(t: TFunction, l: Kontoloeschung): string {
  return teileText(t, [
    l.buchungen > 0 ? t("konten.loeschsperreBuchungen", { count: l.buchungen }) : null,
    l.belege > 0 ? t("konten.loeschsperreBelege", { count: l.belege }) : null,
    l.bankverbindung ? t("konten.loeschsperreBankverbindung") : null,
  ]);
}

/** Was seinen Bezug auf das Konto VERLIERT, ohne zu verschwinden. */
function folgenText(t: TFunction, l: Kontoloeschung): string {
  return teileText(t, [
    l.budgets > 0 ? t("konten.folgenBudgets", { count: l.budgets }) : null,
    l.ruecklagen > 0 ? t("konten.folgenRuecklagen", { count: l.ruecklagen }) : null,
    l.regeln > 0 ? t("konten.folgenRegeln", { count: l.regeln }) : null,
    l.erkennungsregeln > 0 ? t("konten.folgenErkennung", { count: l.erkennungsregeln }) : null,
  ]);
}

/** Woran ein Konto hängt: welcher Zugang, welches Bankkonto, bis wann geholt. */
export interface KontoVerbindung {
  readonly zugangId: string;
  readonly zugangName: string;
  readonly schluessel: string;
  readonly letzterAbrufBis?: string;
}

export function KontenVerwaltung({
  konten,
  personen,
  personName,
  kontostaende,
  hatGebuchtes,
  verbindungen,
  onTrennen,
  onChange,
}: {
  konten: Zahlungskonto[];
  personen: Person[];
  personName: Map<string, string>;
  /** Die Zahlen je Konto, fertig gerechnet aus `stammdatenLaden`. */
  kontostaende: readonly Kontostand[];
  /** Gibt es überhaupt gebuchte Bewegungen? Ohne sie IST der Anfangsbestand der Stand. */
  hatGebuchtes: boolean;
  /** Bankverbindung je Zahlungskonto — fehlt sie, ist das Konto offline. */
  verbindungen: ReadonlyMap<string, KontoVerbindung>;
  /** Löst die Verbindung eines Kontos (der Zugang selbst bleibt bestehen). */
  onTrennen: (v: KontoVerbindung) => Promise<void>;
  onChange: () => void;
}) {
  const { t } = useTranslation();
  const loeschfrage = useLoeschfrage();
  const geld = useGeld();
  const stand = new Map(kontostaende.map((k) => [k.konto.id, k]));
  const [offen, setOffen] = useState(false);
  /**
   * Welches Konto seine eingelesenen Zeilen zeigt — direkt unter der Tabelle.
   *
   * Derselbe Aufbau wie im Kontoauszug: oben die Liste, darunter das Gewählte. Ein Sprung
   * in ein anderes Register waere schneller getippt und im Gebrauch schlechter — man
   * verliert die Zeile aus den Augen, von der man ausgegangen ist, und muss zurück, um
   * das nächste Konto anzusehen.
   */
  const [zeilenVon, setZeilenVon] = useState<string | null>(null);
  const [anlegen, setAnlegen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [bezeichnung, setBezeichnung] = useState("");
  const [typ, setTyp] = useState<Kontotyp>("Giro");
  /**
   * Wofür das Konto da ist. Getrennt vom Typ, weil beide verschiedene Fragen beantworten
   * — und weil nur die Klasse darüber entscheidet, ob der Saldo als verfügbar zählt.
   */
  const [klasse, setKlasse] = useState<Kontoklasse>("liquide");
  const [iban, setIban] = useState("");
  const [inhaberIds, setInhaberIds] = useState<string[]>([]);
  const [saldoText, setSaldoText] = useState("");
  /**
   * Der Zustand im Dialog — nur zur ANZEIGE, und er wird sofort geschrieben.
   *
   * Er läuft ausdrücklich NICHT über `speichern`: `kontoAnlegen` fasst `aktiv` nicht an
   * (sonst holte jedes Umbenennen ein stillgelegtes Konto zurück in die Gegenwart), also
   * hätte ein Feld, das erst beim Speichern wirkt, keinen Weg in den Bestand. Der Schalter
   * hier ruft denselben Dienst wie der in der Liste, und dieser Zustand hält nur nach, was
   * danach dasteht — sonst zeigte der Dialog den alten Stand weiter, bis man ihn schliesst.
   */
  const [aktiv, setAktiv] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  function toggleInhaber(id: string) {
    setInhaberIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }
  const verbindung = editId ? verbindungen.get(editId) : undefined;

  async function trennen() {
    if (!verbindung) return;
    await onTrennen(verbindung);
    setOffen(false);
  }

  function bearbeiten(k: Zahlungskonto) {
    setEditId(k.id);
    setBezeichnung(k.bezeichnung);
    setTyp(k.typ);
    setKlasse(k.klasse);
    setIban(k.iban ?? "");
    setInhaberIds([...k.inhaberIds]);
    setSaldoText(String(minorZuMajor(k.saldo, geld.waehrung)));
    setAktiv(istAktiv(k));
    setFehler(null);
    setOffen(true);
  }
  async function speichern() {
    setFehler(null);
    try {
      await kontoAnlegen(
        { bezeichnung, typ, klasse, iban, inhaberIds, saldo: geld.parse(saldoText) ?? 0 },
        editId ?? undefined,
      );
      setOffen(false);
      onChange();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    }
  }

  return (
    <>
    <Card action={<Button variant="primary" plus onClick={() => setAnlegen(true)}>{t("einstellungen.konto.anlegen")}</Button>}>
      {hatGebuchtes && (
        <div className="muted" style={{ fontSize: "var(--fs-xs)", marginBottom: "var(--sp-3)" }}>
          {t("einstellungen.konto.untertitelIst")}
        </div>
      )}
      {konten.length === 0 ? (
        <div className="muted">{t("einstellungen.konto.leer")}</div>
      ) : (
        <DataTable
          columns={[
            {
              key: "bezeichnung",
              label: t("einstellungen.konto.spalteBezeichnung"),
              // Der Bezeichner führt weiter — sichtbar, weil er wie ein Link aussieht.
              // Die Zeile selbst bleibt stumm: eine unsichtbare Klickfläche findet
              // niemand, und wer sie zufällig trifft, hat sie nicht gemeint.
              render: (k: Zahlungskonto) => (
                <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--sp-2)" }}>
                  <Zeilenlink
                    onKlick={() => setZeilenVon(zeilenVon === k.id ? null : k.id)}
                    titel={t("konten.herkunft.zeigeZeilen", { konto: k.bezeichnung })}
                  >
                    {k.bezeichnung}
                  </Zeilenlink>
                  {/* Die Marke steht NEBEN dem Namen und nicht in einer eigenen Spalte:
                      der Zustand ist selten, eine Spalte dafuer waere in jeder Zeile
                      leer — und hier liest es sich als das, was es ist, ein Teil der
                      Identitaet des Kontos. Die Zeile bleibt ansonsten normal lesbar:
                      ein ausgegrautes Konto saehe nach „nicht benutzbar" aus, und
                      benutzbar ist es sehr wohl, nur nicht fuer Neues. */}
                  {!istAktiv(k) && <Pill variant="neutral">{t("konten.stillgelegt")}</Pill>}
                </span>
              ),
            },
            { key: "typ", label: t("einstellungen.konto.spalteTyp"), render: (k) => t(`einstellungen.konto.typ.${k.typ}`) },
            {
              key: "klasse",
              label: t("einstellungen.konto.spalteKlasse"),
              render: (k) => t(`einstellungen.konto.klasse.${k.klasse}`),
            },
            {
              key: "verbindung",
              label: t("konten.spalteVerbindung"),
              render: (k) =>
                verbindungen.has(k.id) ? (
                  <Pill variant="ok">{t("konten.online")}</Pill>
                ) : (
                  <Pill variant="neutral">{t("konten.offline")}</Pill>
                ),
            },
            { key: "iban", label: t("einstellungen.konto.spalteIban"), render: (k) => k.iban ?? "—" },
            { key: "inhaber", label: t("einstellungen.konto.spalteInhaber"), render: (k) => (k.inhaberIds.length ? k.inhaberIds.map((id: string) => personName.get(id) ?? "?").join(", ") : "—") },
            { key: "saldo", label: `${hatGebuchtes ? t("einstellungen.konto.spalteAnfangsbestand") : t("einstellungen.konto.spalteKontostand")} ${geld.symbol}`, align: "right", render: (k) => geld.format(k.saldo) },
            ...(hatGebuchtes
              ? [
                  { key: "ist", label: `${t("einstellungen.konto.spalteIst")} ${geld.symbol}`, align: "right" as const, render: (k: Zahlungskonto) => { const b = stand.get(k.id)?.bewegungen ?? 0; return b ? <span style={{ color: geldFarbe(b) }}>{geld.format(b, { mitVorzeichen: true })}</span> : "—"; } },
                  { key: "real", label: `${t("einstellungen.konto.spalteRealerStand")} ${geld.symbol}`, align: "right" as const, render: (k: Zahlungskonto) => <span style={{ fontWeight: "var(--fw-bold)" }}>{geld.format(stand.get(k.id)?.realerStand ?? k.saldo)}</span> },
                ]
              : []),
            { key: "_e", label: "", align: "right", render: (k) => <IconButton icon="bearbeiten" label={t("einstellungen.bearbeiten")} onClick={() => bearbeiten(k)} /> },
            // Stilllegen steht VOR dem Muelleimer und ohne Rueckfrage: es ist der
            // umkehrbare Weg, und eine Rueckfrage vor etwas, das ein Klick zurueckholt,
            // erzieht nur dazu, Rueckfragen wegzuklicken. Der Muelleimer daneben behaelt
            // seine — dort geht wirklich etwas weg.
            {
              key: "_s",
              label: "",
              align: "right",
              render: (k: Zahlungskonto) =>
                istAktiv(k) ? (
                  <IconButton
                    icon="stilllegen"
                    label={t("konten.stilllegen")}
                    hinweis={t("konten.stilllegenHinweis")}
                    onClick={async () => { await kontoStilllegen(k.id); onChange(); }}
                  />
                ) : (
                  <IconButton
                    icon="wiederaufnehmen"
                    label={t("konten.wiederaufnehmen")}
                    hinweis={t("konten.wiederaufnehmenHinweis")}
                    onClick={async () => { await kontoWiederaufnehmen(k.id); onChange(); }}
                  />
                ),
            },
            // Der Muelleimer raeumt ein LEERES Konto weg. Er zaehlt vorher, was daran
            // haengt, und nennt es beim Namen — bis zum 13.09.2026 stand hier eine
            // Vermutung („ein Konto mit Buchungen laesst sich nicht loeschen"), die in
            // zwei Richtungen falsch war: gesperrt wird auch ohne eine einzige Buchung
            // (eine Importzeile, eine Bankverbindung), und was ohne sie mitgeht, ist mehr
            // als „nur das Konto selbst". Was ankam, war „FOREIGN KEY constraint failed".
            //
            // Gezaehlt wird beim Oeffnen der Frage und nicht beim Laden der Liste: es sind
            // acht Abfragen je Konto, und eine Liste mit zehn Konten fuehrte achtzig davon
            // aus, um einen Satz zu zeigen, den fast niemand aufschlaegt.
            { key: "_x", label: "", align: "right", render: (k) => <IconButton icon="loeschen" ton="gefahr" label={t("einstellungen.loeschen")} hinweis={t("konten.loeschenHinweis")} onClick={async () => {
              const l = await kontoloeschung(k.id);
              loeschfrage.stellen({
                name: k.bezeichnung,
                folgen: istLoeschbar(l)
                  ? t("konten.loeschbar")
                  : t("konten.loeschsperre", { was: sperrenText(t, l) }),
                ausfuehren: async () => { await kontoLoeschen(k.id); onChange(); },
              });
            }} /> },
            // Der zweite Weg, und er steht NUR am stillgelegten Konto. Nicht aus
            // Vorsicht: so ist Stilllegen die vorgegebene Antwort und das Zerstoerende
            // eine zweite, eigene Handlung. Stuenden beide am selben Muelleimer, gewaenne
            // der kuerzere Weg — auch dann, wenn der andere gemeint war.
            {
              key: "_xx",
              label: "",
              align: "right",
              render: (k: Zahlungskonto) =>
                istAktiv(k) ? null : (
                  <IconButton
                    icon="verwerfen"
                    ton="gefahr"
                    label={t("konten.endgueltigLoeschen")}
                    hinweis={t("konten.endgueltigHinweis")}
                    onClick={async () => {
                      const l = await kontoloeschung(k.id);
                      const folgen = folgenText(t, l);
                      loeschfrage.stellen({
                        name: k.bezeichnung,
                        folgen: [
                          t("konten.endgueltigFolgen", { was: sperrenText(t, l) || t("konten.loeschbarKurz") }),
                          l.umbuchungspaare > 0
                            ? t("konten.endgueltigPaare", { count: l.umbuchungspaare })
                            : null,
                          folgen ? t("konten.endgueltigFolgenLos", { was: folgen }) : null,
                          t("konten.endgueltigSicherung"),
                        ]
                          .filter(Boolean)
                          .join(" "),
                        ausfuehren: async () => { await kontoVollstaendigLoeschen(k.id); onChange(); },
                      });
                    }}
                  />
                ),
            },
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
          {/* Die Verbindung gehört an den Anfang: sie entscheidet, wie viel an diesem
              Konto überhaupt von Hand gilt. IBAN und Bezeichnung kommen bei einem
              Online-Konto von der Bank, und der Stand füllt sich über den Abruf. */}
          <FormField label={t("konten.verbindung.titel")}>
            {verbindung ? (
              <span style={{ display: "flex", gap: "var(--sp-2)", alignItems: "center", flexWrap: "wrap" }}>
                <Pill variant="ok">{t("konten.online")}</Pill>
                <span>{verbindung.zugangName}</span>
                <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>
                  {verbindung.schluessel.replace("|", " · ")}
                  {verbindung.letzterAbrufBis
                    ? ` · ${t("konten.verbindung.abgerufenBis", { datum: verbindung.letzterAbrufBis })}`
                    : ` · ${t("konten.verbindung.nieAbgerufen")}`}
                </span>
                <button className="linkbtn" onClick={() => void trennen()}>
                  {t("konten.verbindung.trennen")}
                </button>
              </span>
            ) : (
              <span style={{ display: "flex", gap: "var(--sp-2)", alignItems: "center", flexWrap: "wrap" }}>
                <Pill variant="neutral">{t("konten.offline")}</Pill>
                <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>
                  {t("konten.verbindung.hinweisOffline")}
                </span>
              </span>
            )}
          </FormField>

          {/* Der Zustand steht NEBEN der Verbindung und nach demselben Muster: eine Pille,
              die ihn nennt, ein Satz, der ihn erklärt, und der Weg, ihn zu ändern. Beides
              sind Auskünfte über das Konto als Ganzes und keine Stammdatenfelder — deshalb
              stehen sie über dem Gitter und nicht darin.

              Nur beim BEARBEITEN: ein Konto, das gerade angelegt wird, ist geführt, und ein
              Schalter dafür wäre eine Frage, die sich niemand stellt. */}
          {editId && (
            <FormField label={t("konten.zustandTitel")}>
              <span style={{ display: "flex", gap: "var(--sp-2)", alignItems: "center", flexWrap: "wrap" }}>
                <Pill variant={aktiv ? "ok" : "neutral"}>
                  {aktiv ? t("konten.gefuehrt") : t("konten.stillgelegt")}
                </Pill>
                <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>
                  {aktiv ? t("konten.zustandHinweisGefuehrt") : t("konten.zustandHinweisStill")}
                </span>
                <button
                  className="linkbtn"
                  title={aktiv ? t("konten.stilllegenHinweis") : t("konten.wiederaufnehmenHinweis")}
                  onClick={async () => {
                    if (aktiv) await kontoStilllegen(editId);
                    else await kontoWiederaufnehmen(editId);
                    setAktiv(!aktiv);
                    onChange();
                  }}
                >
                  {aktiv ? t("konten.stilllegen") : t("konten.wiederaufnehmen")}
                </button>
              </span>
            </FormField>
          )}

          <div className="form-grid">
            <FormField label={t("einstellungen.konto.feldBezeichnung")} required>
              <input className="field" value={bezeichnung} onChange={(e) => setBezeichnung(e.target.value)} placeholder={t("einstellungen.konto.feldBezeichnungPlaceholder")} />
            </FormField>
            <FormField label={t("einstellungen.konto.feldTyp")}>
              <Auswahl
                ariaLabel={t("einstellungen.konto.feldTyp")}
                wert={typ}
                aufAenderung={(v) => {
                  const neu = v as Kontotyp;
                  setTyp(neu);
                  // Nur beim ANLEGEN nachziehen. Wer ein bestehendes Konto bearbeitet, hat
                  // seine Klasse womöglich bewusst gesetzt — die wegen eines Typwechsels
                  // zurückzusetzen, wäre eine stille Änderung an der Liquiditätsrechnung.
                  if (!editId) setKlasse(klasseVorschlag(neu));
                }}
                optionen={KONTOTYPEN.map((kt) => ({ wert: kt, text: t(`einstellungen.konto.typ.${kt}`) }))}
              />
            </FormField>
            <FormField
              label={t("einstellungen.konto.feldKlasse")}
              hint={t(`einstellungen.konto.klasseHinweis.${klasse}`)}
            >
              <Auswahl
                ariaLabel={t("einstellungen.konto.feldKlasse")}
                wert={klasse}
                aufAenderung={(v) => setKlasse(v as Kontoklasse)}
                optionen={KONTOKLASSEN.map((kk) => ({ wert: kk, text: t(`einstellungen.konto.klasse.${kk}`) }))}
              />
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

    {/* Die Buchungsliste steht als EIGENE Tabelle unter der Kontentabelle — nicht in ihr.
        Sie bringt eine eigene Karte mit, und eine Karte in einer Karte ergibt zwei
        Rahmen um dieselbe Sache: der Inhalt rückt zweimal ein, und die Trennung, die
        eine Karte leisten soll, wird zur Verschachtelung. Dasselbe Muster wie bei den
        Bankzugängen, wo die Kontenliste ebenfalls daneben steht. */}
    {zeilenVon && (
      <div style={{ marginTop: "var(--gap-card)" }}>
        <HerkunftBereich key={zeilenVon} kontoId={zeilenVon} />
      </div>
    )}
    {loeschfrage.dialog}

    </>
  );
}

