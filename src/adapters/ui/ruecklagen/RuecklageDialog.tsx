// Eine Rücklage anlegen oder bearbeiten — EIN Dialog für beide Sorten (seit Paket 4 des
// Umbaus, ADR-0006).
//
// Bis dahin gab es zwei: diesen für die Rücklage von Hand und den `BudgetDialog` für die
// „Rücklage über die Kategorie" (das aufbauende Budget). Seit Migration 81 sind beide
// dieselbe Sache, und was sie unterscheidet, ist eine Wahl hier: die Sorte —
// „läuft weiter" oder „wird abgeschlossen".
//
// Was an den Feldern Entscheidung ist:
//
//   • **Die Kategorie ist Pflicht** — beim Anlegen und beim Speichern. Eine Rücklage ohne
//     Kategorie aus der Zeit davor bleibt gültig, bis jemand sie hier bearbeitet; dann
//     fehlt sie, und der Dialog sagt das, bevor er speichert (der Use-Case prüft es auch).
//   • **Die Sorte steht beim Bearbeiten fest** und wird nur angezeigt: ein Wechsel änderte
//     vergangene Monate (`ruecklagenPflege`).
//   • **Die Rate ist eine Reihe mit „gilt ab"**, wie der Budgetbetrag: beim Bearbeiten gilt
//     eine geänderte Rate ab dem laufenden Monat, eine ältere Version lässt sich antippen
//     und korrigieren oder entfernen (nie die letzte).
//
// Bis 2026-11-10 lag sein Zustand im `RuecklagenScreen`; als eigene Komponente mit eigenem
// Zustand beginnt jeder Dialog frisch — der Screen sagt nur, für welche Rücklage.
//
// Er lag bis 2026-11-16 in `bausteine/`, weil ihn auch der Bereich Budgets öffnete: ein
// Vorschlag der Art „Rücklage" legte von dort eine an. Seit der Vorschlag im Bereich
// Rücklagen steht, öffnet ihn nur noch dieser — und ein Baustein, den ein Bereich
// benutzt, ist ein Teil dieses Bereichs (`../bausteine/CLAUDE.md`).

import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  hatZiel,
  minorZuMajor,
  monatsRuecklage,
  waehlbareKonten,
  type Kategorie,
  type Kategoriebelegung,
  type Ruecklage,
  type Ruecklagenart,
  type Zahlungskonto,
} from "../../../application";
import { ruecklageAktualisieren, ruecklageAnlegen, ruecklageRateLoeschen } from "../../dienste";
import { Button, FormField } from "../bausteine";
import { Auswahl } from "../bausteine/Auswahl";
import { CategoryPicker } from "../bausteine/CategoryPicker";
import { Datumsfeld } from "../bausteine/Datumsfeld";
import { IconButton, IconLeiste } from "../bausteine/IconButton";
import { Modal } from "../bausteine/Modal";
import { fehlerNachricht, useGeld } from "../bausteine/einstellungenKontext";
import { useLoeschfrage } from "../bausteine/Loeschfrage";

/** Die beiden Formen einer Rücklage — die Wahl im Dialog, nicht im Datenmodell. */
type Form = "ziel" | "rate";

/** Was ein übernommener Rücklagenvorschlag beim Anlegen vorbelegt. */
export interface RuecklageVorbelegung {
  readonly kategorieId: string;
  readonly bezeichnung: string;
  /** Die Rate im Monat, Minor Units. */
  readonly rate: number;
  readonly art: Ruecklagenart;
}

export function RuecklageDialog({
  ruecklage,
  vorbelegung,
  heute,
  konten,
  kategorien,
  kategoriebelegung,
  onClose,
  onGespeichert,
  onGeaendert,
}: {
  /** `null` legt eine neue an. */
  ruecklage: Ruecklage | null;
  vorbelegung?: RuecklageVorbelegung;
  heute: string;
  konten: readonly Zahlungskonto[];
  kategorien: readonly Kategorie[];
  /** Was an jeder Kategorie schon hängt — für die beiden Hinweise unter dem Feld. */
  kategoriebelegung?: Kategoriebelegung;
  onClose: () => void;
  onGespeichert: () => void | Promise<void>;
  /** Nach dem Entfernen einer Version der Rate: neu laden, ohne den Dialog zu schliessen. */
  onGeaendert?: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const geld = useGeld();
  const loeschfrage = useLoeschfrage();
  const r = ruecklage;
  const laufend = heute.slice(0, 7);
  const [art, setArt] = useState<Ruecklagenart>(r?.art ?? vorbelegung?.art ?? "abschliessend");
  const [form, setForm] = useState<Form>(r ? (hatZiel(r) ? "ziel" : "rate") : vorbelegung ? "rate" : "ziel");
  const [bezeichnung, setBezeichnung] = useState(r?.bezeichnung ?? vorbelegung?.bezeichnung ?? "");
  const [ziel, setZiel] = useState(r?.ziel == null ? "" : String(minorZuMajor(r.ziel, geld.waehrung)));
  const [fristMonate, setFristMonate] = useState(r?.fristMonate == null ? "" : String(r.fristMonate));
  // Die freie Rate steht seit Migration 80 in der Reihe; `monatsRuecklage` nimmt die, die zuletzt gilt.
  const [rate, setRate] = useState(
    r && !hatZiel(r) ? String(minorZuMajor(monatsRuecklage(r), geld.waehrung))
      : vorbelegung ? String(minorZuMajor(vorbelegung.rate, geld.waehrung)) : "",
  );
  const [beginn, setBeginn] = useState(r?.beginn ?? heute);
  const [kontoId, setKontoId] = useState(r?.kontoId ?? "");
  const [kategorieId, setKategorieId] = useState(r?.kategorieId ?? vorbelegung?.kategorieId ?? "");
  /** Ab welchem Monat die eingetippte Rate gilt — beim Bearbeiten der laufende. */
  const [rateAb, setRateAb] = useState(laufend);
  const [fehler, setFehler] = useState<string | null>(null);
  const reihe = r?.raten ?? [];
  // Die beiden Hinweise zur Kategorie: eine andere Rücklage daran heisst, dass Buchungen
  // dort künftig warten; ein monatliches Budget daran nimmt eine neu gewählte Kategorie
  // nicht an (der Altfall bleibt, wie er ist — das Budget gewinnt).
  const andere = (kategorieId && kategoriebelegung?.ruecklagen.get(kategorieId)?.filter((x) => x.id !== r?.id)) || [];
  const mitBudget = !!kategorieId && kategorieId !== r?.kategorieId && !!kategoriebelegung?.monatlich.has(kategorieId);

  /** Eine bestehende Version der Rate zum Korrigieren ins Feld holen. */
  function versionBearbeiten(abMonat: string, betrag: number) {
    setRateAb(abMonat);
    setRate(String(minorZuMajor(betrag, geld.waehrung)));
    setFehler(null);
  }

  async function versionLoeschen(abMonat: string) {
    if (!r) return;
    setFehler(null);
    try {
      await ruecklageRateLoeschen(r.id, abMonat);
      await onGeaendert?.();
      if (rateAb === abMonat) setRateAb(laufend);
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    }
  }

  async function speichern() {
    setFehler(null);
    // Nur die Felder DER GEWÄHLTEN FORM gehen mit. Sonst schickte ein Formularwechsel
    // beides los, und der Use-Case wiese es als Widerspruch ab — mit einer Meldung über
    // ein Feld, das gerade gar nicht zu sehen ist.
    const eingabe = {
      bezeichnung,
      ziel: form === "ziel" ? (geld.parse(ziel) ?? 0) : undefined,
      fristMonate: form === "ziel" ? Number(fristMonate) || 0 : undefined,
      rate: form === "rate" ? (geld.parse(rate) ?? 0) : undefined,
      rateAb: r && form === "rate" ? rateAb : undefined,
      beginn,
      kontoId: kontoId || undefined,
      kategorieId: kategorieId || undefined,
      art,
    };
    try {
      if (r) await ruecklageAktualisieren(r.id, eingabe, heute);
      else await ruecklageAnlegen(eingabe);
      await onGespeichert();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    }
  }

  return (
    <Modal
      title={r ? t("ruecklagen.modalBearbeiten") : t("ruecklagen.modalAnlegen")}
      subtitle={t("ruecklagen.modalUntertitel")}
      onClose={onClose}
      footer={<><Button variant="primary" onClick={speichern}>{t("ruecklagen.speichern")}</Button><Button variant="link" onClick={onClose}>{t("ruecklagen.abbrechen")}</Button>{fehler && <span className="err">{fehler}</span>}</>}
    >
      <div className="form-grid">
        <FormField label={t("ruecklagen.feldBezeichnung")} required>
          <input className="field" value={bezeichnung} onChange={(e) => setBezeichnung(e.target.value)} placeholder={t("ruecklagen.feldBezeichnungPlatzhalter")} />
        </FormField>

        {/* Über die Kategorie findet die Rücklage ihre Ausgaben von selbst — deshalb
            Pflicht. Fehlt sie bei einer bestehenden (aus der Zeit davor), sagt es der
            Hinweis, bevor das Speichern es sagt. */}
        <FormField label={t("ruecklagen.feldKategorie")} required hint={t("ruecklagen.feldKategorieHinweis")}>
          <CategoryPicker kategorien={[...kategorien]} value={kategorieId} onChange={setKategorieId} placeholder={t("ruecklagen.kategorieWaehlen")} />
          {r && !r.kategorieId && !kategorieId && (
            <div className="hinweis" style={{ marginTop: 6 }}>{t("ruecklagen.kategorieNachtragen")}</div>
          )}
          {andere.length > 0 && (
            <div className="hinweis" style={{ marginTop: 6 }}>
              {t("ruecklagen.kategorieSchonBelegt", { namen: andere.map((x) => x.bezeichnung).join(", ") })}
            </div>
          )}
          {mitBudget && (
            <div className="hinweis" style={{ marginTop: 6 }}>{t("ruecklagen.kategorieHatBudget")}</div>
          )}
        </FormField>

        {/* Die Sorte: beim Anlegen eine Wahl, beim Bearbeiten nur noch Auskunft. */}
        <FormField label={t("ruecklagen.feldSorte")} hint={t(`ruecklagen.sorteHinweis.${art}`)}>
          {r ? (
            <div className="field" aria-label={t("ruecklagen.feldSorte")} style={{ border: "none", paddingLeft: 0 }}>
              {t(`ruecklagen.sorte.${art}`)}
            </div>
          ) : (
            <Auswahl
              ariaLabel={t("ruecklagen.feldSorte")}
              wert={art}
              aufAenderung={(v) => setArt(v as Ruecklagenart)}
              optionen={[
                { wert: "abschliessend", text: t("ruecklagen.sorte.abschliessend") },
                { wert: "fortlaufend", text: t("ruecklagen.sorte.fortlaufend") },
              ]}
            />
          )}
        </FormField>

        {/* Die Form ist eine Wahl mit zwei sichtbaren Möglichkeiten und kein
            Kästchen: „hat ein Ziel" beantwortet die Frage nur in einer Richtung,
            und die andere Form müsste man erraten. */}
        <FormField label={t("ruecklagen.feldForm")} hint={t(`ruecklagen.formHinweis.${form}`)}>
          <Auswahl
            ariaLabel={t("ruecklagen.feldForm")}
            wert={form}
            aufAenderung={(v) => setForm(v as Form)}
            optionen={[
              { wert: "ziel", text: t("ruecklagen.form.ziel") },
              { wert: "rate", text: t("ruecklagen.form.rate") },
            ]}
          />
        </FormField>

        {form === "ziel" ? (
          <>
            <FormField label={`${t("ruecklagen.feldZiel")} ${geld.symbol}`} required hint={t("ruecklagen.feldZielHinweis")}>
              <input className="field" inputMode="decimal" value={ziel} onChange={(e) => setZiel(e.target.value)} placeholder={geld.format(0)} />
            </FormField>
            <FormField label={t("ruecklagen.feldFrist")} required hint={t("ruecklagen.feldFristHinweis")}>
              <input className="field" inputMode="numeric" value={fristMonate} onChange={(e) => setFristMonate(e.target.value)} placeholder="96" />
            </FormField>
          </>
        ) : (
          <FormField
            label={`${t("ruecklagen.feldRate")} ${geld.symbol}`}
            required
            hint={r && reihe.length > 0 ? t("ruecklagen.rateGiltAbHinweis", { monat: rateAb }) : t("ruecklagen.feldRateHinweis")}
          >
            <input className="field" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder={geld.format(0)} />
          </FormField>
        )}

        {/* Die Reihe der bisherigen Raten — nur beim Bearbeiten einer freien Rücklage,
            dieselbe Form wie beim Budgetbetrag: „was habe ich zuletzt geplant, und wo
            greift meine Eingabe hinein?" */}
        {r && form === "rate" && reihe.length > 0 && (
          <div style={{ gridColumn: "1 / -1" }}>
            <div style={{ fontSize: "var(--fs-2xs)", fontWeight: "var(--fw-bold)", textTransform: "uppercase", letterSpacing: ".04em", color: "var(--ink-3)", marginBottom: "var(--sp-2)" }}>
              {t("ruecklagen.ratenTitel")}
            </div>
            {reihe.map((v) => (
              <div
                key={v.abMonat}
                style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", padding: "5px 8px", borderRadius: "var(--r-md)", background: v.abMonat === rateAb ? "var(--accent-soft)" : "transparent", fontSize: "var(--fs-ui)" }}
              >
                <span className="num" style={{ color: "var(--ink-3)", fontWeight: "var(--fw-bold)", flex: "0 0 auto" }}>
                  {t("ruecklagen.rateAb", { monat: v.abMonat })}
                </span>
                <span className="num" style={{ marginLeft: "auto", fontWeight: "var(--fw-semi)" }}>{geld.formatMitSymbol(v.betrag)}</span>
                <IconLeiste>
                  <IconButton icon="bearbeiten" label={t("ruecklagen.rateAendern", { monat: v.abMonat })} onClick={() => versionBearbeiten(v.abMonat, v.betrag)} />
                  {reihe.length > 1 && (
                    <IconButton icon="loeschen" ton="gefahr" label={t("ruecklagen.rateEntfernen", { monat: v.abMonat })} onClick={() => loeschfrage.stellen({
                        name: t("ruecklagen.rateName", { monat: v.abMonat }),
                        folgen: t("ruecklagen.rateLoeschenFolgen"),
                        ausfuehren: () => versionLoeschen(v.abMonat),
                      })} />
                  )}
                </IconLeiste>
              </div>
            ))}
            {rateAb !== laufend && (
              <Button variant="link" type="button" onClick={() => setRateAb(laufend)}>
                {t("ruecklagen.rateWiederAbLaufend", { monat: laufend })}
              </Button>
            )}
          </div>
        )}

        <FormField label={t("ruecklagen.feldBeginn")}>
          <Datumsfeld ariaLabel={t("ruecklagen.feldBeginn")} wert={beginn} aufAenderung={setBeginn} />
        </FormField>
        <FormField label={t("ruecklagen.feldKonto")} hint={t("ruecklagen.feldKontoHinweis")}>
          <Auswahl
            ariaLabel={t("ruecklagen.feldKonto")}
            wert={kontoId}
            aufAenderung={setKontoId}
            optionen={[{ wert: "", text: t("ruecklagen.kontoKeins") }, ...waehlbareKonten(konten, kontoId).map((k) => ({ wert: k.id, text: k.bezeichnung }))]}
          />
        </FormField>
      </div>
      {loeschfrage.dialog}
    </Modal>
  );
}
