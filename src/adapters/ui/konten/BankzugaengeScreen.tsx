// Bankzugänge — was hinterlegt ist, und was die Bank dazu sagt.
//
// Das war bis 2026-08-18 der Bankabruf-Screen unter Import, und dort war er auch nur
// deshalb, weil er als Erprobung entstanden ist. Angelegt wird ein Zugang inzwischen
// beim Anlegen eines Online-Kontos; hier steht, was daraus geworden ist:
//
//  • welche Zugänge es gibt und wie viele Konten daran hängen,
//  • was die Bank je Konto freigibt (die Fähigkeitsmatrix — statt eines Knopfes, der
//    kommentarlos nichts tut),
//  • was sie an Rückmeldungen schickt, auch die harmlosen.
//
// „Prüfen" ist bewusst read-only: es meldet sich an, holt Kontenliste und Salden und
// schreibt die Bankparameter fort. Umsätze holt der Abruf in der Konten-Übersicht.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  Bankkonto,
  Bankprofil,
  Bankzugang,
  Formatwahl,
  Kontozuordnung,
  TanHerausforderung,
} from "../../../application";
import { fintsEinsatzbereit } from "../../fints";
import {
  abrufAdapterFuer,
  bankzugaenge,
  bankzugangLoeschen,
  bankzugangSpeichern,
  kontozuordnungSpeichern,
  kontozuordnungen,
} from "../../dienste";
import { kannVorfall } from "../../../application";
import { beiEnter } from "../bausteine/beiEnter";
import { Zeilenauswahl } from "../bausteine/Zeilenauswahl";
import { Zeilenlink } from "../bausteine/Zeilenlink";
import { HerkunftBereich } from "./HerkunftBereich";
import { Bankprofilkarte } from "./Bankprofilkarte";
import { TanDialog, type TanFrage } from "./TanDialog";
import { Button, Card, DataTable, FormField, Pill } from "../bausteine";
import { IconButton } from "../bausteine/IconButton";
import { Modal } from "../bausteine/Modal";
import { useGeld } from "../bausteine/einstellungenKontext";

interface KontoZeile extends Bankkonto {
  saldo?: number;
}

/** Was eine Prüfung ergeben hat — gehört zu genau einem Zugang. */
interface Pruefung {
  zugangId: string;
  konten: KontoZeile[];
  hinweise: readonly string[];
  bankNachrichten: readonly string[];
  tanVerfahren?: string;
  profil: Bankprofil;
}

export function BankzugaengeScreen({
  kontoNamen,
}: {
  /** Kontobezeichnungen je Id — der Screen daneben hat sie schon geladen. */
  kontoNamen?: ReadonlyMap<string, string>;
} = {}) {
  const { t } = useTranslation();
  const geld = useGeld();
  const [zugaenge, setZugaenge] = useState<Bankzugang[]>([]);
  const [zuordnungen, setZuordnungen] = useState<Kontozuordnung[]>([]);
  /**
   * Welcher Zugang seine Konten zeigt.
   *
   * Die Spalte daneben nennt nur die ANZAHL — die beantwortet „habe ich hier schon etwas
   * zugeordnet", aber nicht „welches Konto ist das eigentlich". Genau die Frage stellt
   * sich, wenn ein Abruf nichts bringt.
   */
  const [kontenOffen, setKontenOffen] = useState<string | null>(null);
  /**
   * Welches Konto seine eingelesenen Zeilen zeigt — die dritte Stufe.
   *
   * Zugang aufklappen, darin ein Konto aufklappen, darunter steht, was hereinkam. Alles
   * auf derselben Seite: wer der Frage nachgeht, warum ein Abruf nichts brachte, will die
   * Kette sehen und nicht dreimal die Ansicht wechseln.
   */
  const [zeilenVon, setZeilenVon] = useState<string | null>(null);
  const [pin, setPin] = useState<{ zugang: Bankzugang } | null>(null);
  const [pinText, setPinText] = useState("");
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [pruefung, setPruefung] = useState<Pruefung | null>(null);
  /**
   * Welcher Zugang gerade sein gespeichertes Profil zeigt.
   *
   * Getrennt von `pruefung`, weil das der Punkt der Sache ist: das Profil steht auch
   * ohne Anmeldung zur Verfügung. Wer nachsehen will, warum ein Abruf nur 30 Tage holt,
   * soll dafür nicht seine PIN eintippen müssen.
   */
  const [angesehen, setAngesehen] = useState<string | null>(null);
  const [tanGespeichert, setTanGespeichert] = useState(false);
  const [tanFrage, setTanFrage] = useState<TanFrage | null>(null);

  async function laden() {
    // In EINEM Effekt und zusammen gesetzt: gestaffelte Zustaende liessen die Kontenliste
    // kurz gegen eine leere Zuordnung rechnen (ui/CLAUDE.md).
    const [z, zo] = await Promise.all([bankzugaenge(), kontozuordnungen()]);
    setZugaenge(z);
    setZuordnungen(zo);
  }

  useEffect(() => {
    laden().catch(() => setZugaenge([]));
  }, []);

  function frageTan(h: TanHerausforderung): Promise<string | undefined> {
    return new Promise((antworten) => setTanFrage({ herausforderung: h, antworten }));
  }

  async function pruefen(zugang: Bankzugang, geheim: string) {
    setBusy(true);
    setFehler(null);
    try {
      // Welcher Weg: steht am Zugang. Fest verdrahtetes FinTS pruefte hier sonst einen
      // Zugang, der gar nicht darueber laeuft — und meldete einen Fehler der falschen Bank.
      const sitzung = await abrufAdapterFuer(zugang.art).anmelden(zugang, geheim, frageTan);
      // Das Profil geht mit — es ist aus denselben Parametern abgeleitet und wäre sonst
      // genau dann veraltet, wenn sich etwas geändert hat.
      await bankzugangSpeichern({
        ...zugang,
        bankparameter: sitzung.bankparameter(),
        profil: JSON.stringify(sitzung.profil),
      });

      const zeilen: KontoZeile[] = [];
      for (const k of sitzung.konten) {
        let saldo: number | undefined;
        try {
          saldo = (await sitzung.saldo(k))?.betrag;
        } catch {
          saldo = undefined; // Ein abgelehnter Saldo kippt die Anzeige nicht.
        }
        zeilen.push({ ...k, saldo });
      }

      setPruefung({
        zugangId: zugang.id,
        konten: zeilen,
        hinweise: sitzung.hinweise,
        bankNachrichten: sitzung.bankNachrichten,
        tanVerfahren: sitzung.tanVerfahren,
        profil: sitzung.profil,
      });
      setPin(null);
      setPinText("");
      await laden();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Das gespeicherte Profil eines Zugangs.
   *
   * Kaputtes JSON gibt `null` statt einer Ausnahme: das Profil ist eine Bequemlichkeit,
   * und ein Screen, der wegen einer unlesbaren Nebensache gar nichts mehr zeigt, ist
   * schlechter als einer ohne diese Karte.
   */
  function profilVon(z: Bankzugang): Bankprofil | null {
    if (!z.profil) return null;
    try {
      return JSON.parse(z.profil) as Bankprofil;
    } catch {
      return null;
    }
  }

  async function tanVerfahrenWaehlen(z: Bankzugang, id: number) {
    await bankzugangSpeichern({ ...z, tanVerfahrenId: id });
    setTanGespeichert(true);
    await laden();
  }

  async function loeschen(id: string) {
    await bankzugangLoeschen(id);
    if (pruefung?.zugangId === id) setPruefung(null);
    await laden();
  }

  /**
   * Welche Formate für dieses Konto zur Wahl stehen.
   *
   * Nicht jede Bank kann beides — die Vorfälle stehen im Bankprofil. Ein Format
   * anzubieten, das die Bank nicht beherrscht, führt zu einer Festlegung, die JEDEN
   * weiteren Abruf leer laufen lässt: bei einer Wahl gibt es keinen Rückfall.
   *
   * Was nicht geht, wird trotzdem GEZEIGT, nur gesperrt. Eine bestehende Wahl darf nicht
   * stumm verschwinden, weil die Bank ihr Profil geändert hat — sonst steht in der
   * Datenbank etwas anderes als auf dem Bildschirm. Und die aktuelle Wahl bleibt immer
   * wählbar, auch wenn sie inzwischen unmöglich aussieht.
   */
  function formatmoeglichkeiten(profil: Bankprofil | undefined, aktuell: Formatwahl) {
    const kann = (segment: string) => !profil || kannVorfall(profil, segment);
    return [
      { wert: "automatisch" as const, gesperrt: false },
      { wert: "CAMT" as const, gesperrt: !kann("HKCAZ") && aktuell !== "CAMT" },
      { wert: "MT940" as const, gesperrt: !kann("HKKAZ") && aktuell !== "MT940" },
    ];
  }

  const kontenSpalten = [
    { key: "bezeichnung", label: t("bankabruf.spalteKonto") },
    { key: "iban", label: t("bankabruf.spalteIban"), render: (r: KontoZeile) => r.iban ?? "—" },
    { key: "inhaber", label: t("bankabruf.spalteInhaber"), render: (r: KontoZeile) => r.inhaber ?? "—" },
    {
      key: "saldo",
      label: t("bankabruf.spalteSaldo"),
      align: "right" as const,
      render: (r: KontoZeile) => (r.saldo === undefined ? "—" : geld.format(r.saldo)),
    },
    {
      // Das Umsatzformat je Konto. Steht hier und nicht am Zugang: dieselbe Bank kann
      // sich je Konto unterschiedlich verhalten, und eine Festlegung, die alle Konten
      // mitzieht, ist beim Nachjustieren im Weg.
      key: "format",
      label: t("bankzugaenge.format.spalte"),
      sortable: false,
      render: (r: KontoZeile) => {
        const zuordnung = zuordnungen.find((z) => z.schluessel === r.schluessel);
        if (!zuordnung) return "—";
        const wahl = zuordnung.formatwahl ?? "automatisch";
        return (
          <Zeilenauswahl
            label={t("bankzugaenge.format.spalte")}
            wert={wahl}
            hinweis={t(`bankzugaenge.format.hinweis.${wahl}`)}
            moeglichkeiten={formatmoeglichkeiten(pruefung?.profil, wahl).map((m) => ({
              ...m,
              text: t(`bankzugaenge.format.${m.wert}`) + (m.gesperrt ? ` — ${t("bankzugaenge.format.kannBankNicht")}` : ""),
              hinweis: t(`bankzugaenge.format.hinweis.${m.wert}`),
            }))}
            onChange={async (neueWahl) => {
              await kontozuordnungSpeichern({ ...zuordnung, formatwahl: neueWahl });
              await laden();
            }}
          />
        );
      },
    },
    {
      key: "kann",
      label: t("bankabruf.spalteKann"),
      sortable: false,
      render: (r: KontoZeile) => (
        <span style={{ display: "flex", gap: "var(--sp-1)", flexWrap: "wrap" }}>
          {r.kannSaldo && <Pill variant="ok">{t("bankabruf.kannSaldo")}</Pill>}
          {r.kannUmsaetze && <Pill variant="ok">{t("bankabruf.kannUmsaetze")}</Pill>}
          {zuordnungen.some((z) => z.schluessel === r.schluessel) && (
            <Pill variant="ok">{t("bankzugaenge.verknuepft")}</Pill>
          )}
        </span>
      ),
    },
  ];

  return (
    <>
      {!fintsEinsatzbereit && (
        <Card>
          <div className="err">{t("bankabruf.keineProduktId")}</div>
        </Card>
      )}

      <Card title={t("bankzugaenge.titel")} subtitle={t("bankzugaenge.untertitel")}>
        {zugaenge.length === 0 ? (
          <div className="muted">{t("bankzugaenge.leer")}</div>
        ) : (
          <DataTable
            columns={[
              {
                key: "bezeichnung",
                label: t("bankzugaenge.spalteBank"),
                render: (z: Bankzugang) => (
                  <Zeilenlink
                    onKlick={() => setKontenOffen(kontenOffen === z.id ? null : z.id)}
                    titel={t("bankzugaenge.zeigeKonten", { bank: z.bezeichnung })}
                  >
                    {z.bezeichnung}
                  </Zeilenlink>
                ),
              },
              { key: "blz", label: t("bankabruf.feldBlz") },
              { key: "benutzer", label: t("bankabruf.feldBenutzer") },
              {
                key: "konten",
                label: t("bankzugaenge.spalteKonten"),
                align: "right" as const,
                render: (z: Bankzugang) => zuordnungen.filter((x) => x.zugangId === z.id).length,
              },
              {
                key: "abruf",
                label: t("bankzugaenge.spalteLetzterAbruf"),
                render: (z: Bankzugang) => {
                  const stände = zuordnungen
                    .filter((x) => x.zugangId === z.id)
                    .map((x) => x.letzterAbrufBis)
                    .filter(Boolean) as string[];
                  // Der älteste Stand ist der ehrliche: bis dahin ist ALLES geholt.
                  return stände.length > 0 ? stände.sort()[0] : "—";
                },
              },
              {
                key: "_profil",
                label: "",
                align: "right" as const,
                render: (z: Bankzugang) =>
                  z.profil ? (
                    <button
                      className="linkbtn"
                      onClick={() => {
                        setAngesehen(angesehen === z.id ? null : z.id);
                        setTanGespeichert(false);
                      }}
                    >
                      {t("bankabruf.profilTitel")}
                    </button>
                  ) : (
                    <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>
                      {t("bankabruf.profilNochKeins")}
                    </span>
                  ),
              },
              {
                key: "_p",
                label: "",
                align: "right" as const,
                render: (z: Bankzugang) => (
                  <IconButton
                    icon="details"
                    label={t("bankzugaenge.pruefen")}
                    onClick={() => { setPin({ zugang: z }); setPinText(""); setFehler(null); }}
                  />
                ),
              },
              {
                key: "_x",
                label: "",
                align: "right" as const,
                render: (z: Bankzugang) => (
                  <IconButton icon="loeschen" ton="gefahr" label={t("einstellungen.loeschen")} onClick={() => void loeschen(z.id)} />
                ),
              },
            ]}
            rows={zugaenge}
          />
        )}
        {fehler && !pin && <div className="err" style={{ marginTop: "var(--sp-3)" }}>{fehler}</div>}
      </Card>

      {/* Welche Konten an einem Zugang hängen — und von dort weiter zu dem, was
          hereingekommen ist. Die Spalte in der Tabelle nennt nur die ANZAHL; die
          beantwortet „habe ich hier schon etwas zugeordnet", aber nicht „welches Konto ist
          das eigentlich". Genau die Frage stellt sich, wenn ein Abruf nichts bringt. */}
      {kontenOffen && (
        <Card
          style={{ marginTop: "var(--gap-card)" }}
          title={t("bankzugaenge.kontenDesZugangs", {
            bank: zugaenge.find((z) => z.id === kontenOffen)?.bezeichnung ?? "",
          })}
        >
          {zuordnungen.filter((z) => z.zugangId === kontenOffen).length === 0 ? (
            <div className="muted">{t("bankzugaenge.keineKonten")}</div>
          ) : (
            <DataTable
              columns={[
                {
                  key: "konto",
                  label: t("bankzugaenge.spalteKonto"),
                  render: (z: Kontozuordnung) => {
                    const name = kontoNamen?.get(z.zahlungskontoId) ?? z.zahlungskontoId;
                    return (
                      <Zeilenlink
                        onKlick={() =>
                          setZeilenVon(zeilenVon === z.zahlungskontoId ? null : z.zahlungskontoId)
                        }
                        titel={t("konten.herkunft.zeigeZeilen", { konto: name })}
                      >
                        {name}
                      </Zeilenlink>
                    );
                  },
                },
                { key: "schluessel", label: t("bankzugaenge.spalteSchluessel") },
                {
                  key: "abruf",
                  label: t("bankzugaenge.spalteLetzterAbruf"),
                  render: (z: Kontozuordnung) => z.letzterAbrufBis ?? "—",
                },
              ]}
              rows={zuordnungen.filter((z) => z.zugangId === kontenOffen)}
            />
          )}

        </Card>
      )}

      {/* Und darunter — als EIGENE Tabelle neben der Kontenliste, nicht in ihr — die
          IMPORTE dieses Kontos über DIESEN Zugang. Erst der Klick auf einen Import zeigt,
          was er gebracht hat.
          Die Zeilen aus Dateien bleiben hier aussen vor: sie gehören zum selben Konto,
          aber nicht zu diesem Abrufweg. Wer sie alle sehen will, findet sie im Register
          „Herkunft" oder unter der Kontenliste. */}
      {kontenOffen && zeilenVon && (
        <div style={{ marginTop: "var(--gap-card)" }}>
          <HerkunftBereich key={zeilenVon} kontoId={zeilenVon} zugangId={kontenOffen} />
        </div>
      )}

      {pruefung && (
        <Card
          style={{ marginTop: "var(--gap-card)" }}
          title={t("bankabruf.kontenTitel")}
          subtitle={t("bankabruf.kontenHinweis", { verfahren: pruefung.tanVerfahren ?? "—" })}
        >
          <DataTable columns={kontenSpalten} rows={pruefung.konten} />

          {pruefung.konten.some((k) => k.hinweis) && (
            <ul className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: "var(--sp-3)" }}>
              {pruefung.konten.filter((k) => k.hinweis).map((k) => (
                <li key={k.schluessel}>{k.hinweis}</li>
              ))}
            </ul>
          )}

          {pruefung.bankNachrichten.length > 0 && (
            <div style={{ marginTop: "var(--sp-3)" }}>
              <div className="nlbl">{t("bankabruf.bankNachrichten")}</div>
              <ul className="muted" style={{ fontSize: "var(--fs-xs)" }}>
                {pruefung.bankNachrichten.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          )}

          <details style={{ marginTop: "var(--sp-3)" }}>
            <summary className="muted" style={{ fontSize: "var(--fs-xs)", cursor: "pointer" }}>
              {t("bankabruf.rueckmeldungen")}
            </summary>
            <ul className="muted" style={{ fontSize: "var(--fs-xs)" }}>
              {pruefung.hinweise.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
          </details>
        </Card>
      )}

      {/* Frisch geprüft: das Profil der laufenden Sitzung. Sonst das gespeicherte. */}
      {(() => {
        const zugangDerKarte = pruefung
          ? zugaenge.find((z) => z.id === pruefung.zugangId)
          : zugaenge.find((z) => z.id === angesehen);
        if (!zugangDerKarte) return null;
        const profil = pruefung ? pruefung.profil : profilVon(zugangDerKarte);
        if (!profil) return null;
        return (
          <Bankprofilkarte
            zugang={zugangDerKarte}
            profil={profil}
            gespeichert={tanGespeichert}
            onTanVerfahren={(id) => void tanVerfahrenWaehlen(zugangDerKarte, id)}
          />
        );
      })()}

      {pin && (
        <Modal
          title={t("bankzugaenge.pruefenTitel", { bank: pin.zugang.bezeichnung })}
          subtitle={t("bankzugaenge.pruefenUntertitel")}
          onClose={() => setPin(null)}
          footer={
            <>
              <Button variant="primary" onClick={() => void pruefen(pin.zugang, pinText)}>
                {busy ? t("konten.abruf.laeuft") : t("bankzugaenge.pruefen")}
              </Button>
              <button className="linkbtn" onClick={() => setPin(null)}>
                {t("einstellungen.abbrechen")}
              </button>
              {fehler && <span className="err">{fehler}</span>}
            </>
          }
        >
          <FormField label={t("bankabruf.feldPin")} required hint={t("bankabruf.feldPinHinweis")}>
            <input
              className="field"
              type="password"
              value={pinText}
              onChange={(e) => setPinText(e.target.value)}
              onKeyDown={beiEnter(() => void pruefen(pin.zugang, pinText), !!pinText.trim() && !busy)}
              autoComplete="off"
              autoFocus
            />
          </FormField>
        </Modal>
      )}

      {tanFrage && <TanDialog frage={tanFrage} onFertig={() => setTanFrage(null)} />}
    </>
  );
}
