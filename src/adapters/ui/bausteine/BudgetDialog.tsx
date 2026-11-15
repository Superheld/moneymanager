// Ein Budget anlegen oder bearbeiten — aus dem Bereich Budgets (monatlich) und aus dem
// Bereich Rücklagen (aufbauend).
//
// Bis 2026-11-15 stand der Dialog im Budgets-Screen und trug ein Feld „Art". Seit die
// aufbauenden Budgets im Bereich Rücklagen stehen, entscheidet der BEREICH über die Art:
// wer unter Budgets anlegt, legt ein monatliches an, wer unter Rücklagen „über die
// Kategorie" anlegt, ein aufbauendes. Ein Feld, mit dem man ein Budget in den anderen
// Bereich schöbe, wäre ein Weg, es aus den Augen zu verlieren. Beim Bearbeiten bleibt die
// Art, die das Budget hat.
//
// Der Dialog hält seinen eigenen Zustand (wie `RuecklageDialog`); der Screen merkt sich
// nur, WAS bearbeitet wird, und reicht den aktuellen Stand herein — nach dem Entfernen
// einer Version lädt er neu, und die Liste der Beträge muss dem folgen.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { minorZuMajor, waehlbareKonten, type Budgetart, type Budgetstand, type Kategorie, type Zahlungskonto } from "../../../application";
import { budgetAnlegen as budgetSpeichern, budgetBetragLoeschen } from "../../dienste";
import { Button, FormField } from ".";
import { Auswahl } from "./Auswahl";
import { CategoryPicker } from "./CategoryPicker";
import { Datumsfeld } from "./Datumsfeld";
import { IconButton, IconLeiste } from "./IconButton";
import { Modal } from "./Modal";
import { useGeld, fehlerNachricht } from "./einstellungenKontext";
import { useLoeschfrage } from "./Loeschfrage";
import { budgetText } from "./budgetTexte";

/** Was ein Vorschlag beim Anlegen vorbelegt. */
export interface BudgetVorbelegung {
  readonly kategorieId: string;
  readonly betrag: number;
}

export function BudgetDialog({
  art: neueArt,
  stand,
  vorbelegung,
  heute,
  kategorien,
  konten,
  onClose,
  onGespeichert,
  onGeaendert,
}: {
  /** Die Art eines NEUEN Budgets — beim Bearbeiten gilt die des Budgets. */
  art: Budgetart;
  /** Das bearbeitete Budget im aktuellen Stand; `null` beim Anlegen. */
  stand: Budgetstand | null;
  vorbelegung?: BudgetVorbelegung;
  heute: string;
  kategorien: readonly Kategorie[];
  konten: readonly Zahlungskonto[];
  onClose: () => void;
  onGespeichert: () => Promise<void> | void;
  /** Nach dem Entfernen einer Version: neu laden, ohne den Dialog zu schliessen. */
  onGeaendert: () => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const geld = useGeld();
  const loeschfrage = useLoeschfrage();
  const budget = stand?.budget;
  const editId = budget?.id ?? null;
  const art: Budgetart = budget?.art ?? neueArt;
  const laufend = heute.slice(0, 7);

  const [kategorieId, setKategorieId] = useState(budget?.kategorieId ?? vorbelegung?.kategorieId ?? "");
  // Ein Konto ist Pflicht — der erste Eintrag ist eine Vorbelegung, keine Aussage.
  const [kontoId, setKontoId] = useState(budget?.kontoId ?? konten[0]?.id ?? "");
  // Beim Bearbeiten der Betrag DIESES Monats, nicht „der Betrag" — es gibt eine Reihe
  // davon, und was im Feld steht, ist der Ausgangspunkt für die nächste Version.
  const [betragText, setBetragText] = useState(
    stand ? String(minorZuMajor(stand.proMonat, geld.waehrung))
      : vorbelegung ? String(minorZuMajor(vorbelegung.betrag, geld.waehrung)) : "",
  );
  const [start, setStart] = useState(budget?.start ?? heute);
  /**
   * Der Monat, für den der eingetippte Betrag gilt.
   *
   * Beim Anlegen der Startmonat, beim Bearbeiten der LAUFENDE: ein geänderter Rahmen gilt
   * ab jetzt, die Monate davor behalten ihre Planung. Über die Liste im Dialog lässt er
   * sich auf einen früheren Monat umstellen — dann wird dort korrigiert statt eine neue
   * Version anzulegen.
   */
  const [zielMonat, setZielMonat] = useState(laufend);
  const [fehler, setFehler] = useState<string | null>(null);

  /** Eine bestehende Version zum Korrigieren ins Feld holen. */
  function versionBearbeiten(abMonat: string, betrag: number) {
    setZielMonat(abMonat);
    setBetragText(String(minorZuMajor(betrag, geld.waehrung)));
    setFehler(null);
  }

  async function versionLoeschen(abMonat: string) {
    if (!editId) return;
    setFehler(null);
    try {
      await budgetBetragLoeschen(editId, abMonat);
      await onGeaendert();
      // Stand der gelöschte Monat gerade im Feld, zeigt es sonst auf etwas, das es nicht
      // mehr gibt — zurück auf den laufenden Monat.
      if (zielMonat === abMonat) setZielMonat(laufend);
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    }
  }

  async function speichern() {
    setFehler(null);
    try {
      await budgetSpeichern(
        // `abMonat`: beim Anlegen der Monat aus „gilt ab", beim Bearbeiten der
        // laufende (bzw. die angetippte Version). Ein geänderter Rahmen gilt ab jetzt —
        // die Monate davor behalten ihre Planung.
        {
          kategorieId, kontoId, betragProMonat: geld.parse(betragText) ?? 0, art, start,
          abMonat: editId ? zielMonat : start.slice(0, 7),
        },
        editId ?? undefined,
      );
      await onGespeichert();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    }
  }

  return (
    <Modal
      title={editId ? t(budgetText(art, "modalBearbeiten")) : t(budgetText(art, "anlegen"))}
      subtitle={t(budgetText(art, "modalUntertitel"))}
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" onClick={speichern}>
            {t("budgets.speichern")}
          </Button>
          <Button variant="link" onClick={onClose}>
            {t("budgets.abbrechen")}
          </Button>
          {fehler && <span className="err">{fehler}</span>}
        </>
      }
    >
      <div className="form-grid">
        <FormField label={t("budgets.feldKategorie")} required hint={t("budgets.feldKategorieHinweis")}>
          <CategoryPicker kategorien={[...kategorien]} value={kategorieId} onChange={setKategorieId} />
        </FormField>

        <FormField label={t("budgets.feldKonto")} required hint={t(budgetText(art, "feldKontoHinweis"))}>
          <Auswahl
            ariaLabel={t("budgets.feldKonto")}
            wert={kontoId}
            aufAenderung={setKontoId}
            platzhalter={t("budgets.kontoWaehlen")}
            optionen={[{ wert: "", text: t("budgets.kontoWaehlen") }, ...waehlbareKonten(konten, kontoId).map((k) => ({ wert: k.id, text: k.bezeichnung }))]}
          />
        </FormField>

        <FormField
          label={`${t("budgets.feldBetrag")} ${geld.symbol}`}
          required
          hint={editId ? t("budgets.giltAbHinweis", { monat: zielMonat }) : t("budgets.feldBetragHinweis")}
        >
          <input className="field" inputMode="decimal" value={betragText} onChange={(e) => setBetragText(e.target.value)} placeholder={geld.format(0)} />
        </FormField>

        {/* Die Reihe der bisherigen Beträge — nur beim Bearbeiten, beim Anlegen gibt
            es sie noch nicht. Sie steht hier und nicht auf dem Screen, weil sie die
            Frage beantwortet, die man genau hier hat: „was habe ich zuletzt geplant,
            und wo greift meine Eingabe hinein?" */}
        {budget && (
          <div style={{ gridColumn: "1 / -1" }}>
            <div style={{ fontSize: "var(--fs-2xs)", fontWeight: "var(--fw-bold)", textTransform: "uppercase", letterSpacing: ".04em", color: "var(--ink-3)", marginBottom: "var(--sp-2)" }}>
              {t("budgets.versionenTitel")}
            </div>
            {budget.betraege.map((v) => {
              const aktiv = v.abMonat === zielMonat;
              return (
                <div
                  key={v.abMonat}
                  style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", padding: "5px 8px", borderRadius: "var(--r-md)", background: aktiv ? "var(--accent-soft)" : "transparent", fontSize: "var(--fs-ui)" }}
                >
                  <span className="num" style={{ color: "var(--ink-3)", fontWeight: "var(--fw-bold)", flex: "0 0 auto" }}>
                    {t("budgets.versionAb", { monat: v.abMonat })}
                  </span>
                  <span className="num" style={{ marginLeft: "auto", fontWeight: "var(--fw-semi)" }}>
                    {geld.formatMitSymbol(v.betrag)}
                  </span>
                  <IconLeiste>
                    <IconButton icon="bearbeiten" label={t("budgets.versionAendern", { monat: v.abMonat })} onClick={() => versionBearbeiten(v.abMonat, v.betrag)} />
                    {/* Die letzte Version bleibt: ein Budget ohne Betrag wäre eine
                        Kategorie mit einem Etikett. Der Use-Case weist es ohnehin ab —
                        der Knopf verschwindet, damit man nicht erst dagegen läuft. */}
                    {budget.betraege.length > 1 && (
                      <IconButton icon="loeschen" ton="gefahr" label={t("budgets.versionLoeschen", { monat: v.abMonat })} onClick={() => loeschfrage.stellen({
                          name: t("budgets.versionName", { monat: v.abMonat }),
                          folgen: t("budgets.versionLoeschenFolgen"),
                          ausfuehren: () => versionLoeschen(v.abMonat),
                        })} />
                    )}
                  </IconLeiste>
                </div>
              );
            })}
            {/* Zurück auf „ab jetzt", wenn gerade eine alte Version im Feld steht. */}
            {!budget.betraege.some((v) => v.abMonat === zielMonat) ? null : zielMonat !== laufend && (
              <Button variant="link" type="button" onClick={() => setZielMonat(laufend)}>
                {t("budgets.wiederAbLaufend", { monat: laufend })}
              </Button>
            )}
          </div>
        )}

        {/* Beim ANLEGEN für beide Arten, und das ist der Punkt: das Feld sagt, ab
            welchem Monat der erste Betrag gilt. Ohne es landete er zwangsläufig im
            laufenden Monat, und wer ein Budget für etwas anlegt, das seit dem Frühjahr
            läuft, sähe jeden Monat davor mit Rahmen 0 — die Auswertung zeigte dann
            lauter Überziehungen, die nie welche waren. Rückwirkend ERFUNDEN wird
            dabei nichts: der Monat ist eine Angabe und keine Annahme.

            EIN Feld für beide Arten, nicht zwei: beim Aufbauenden setzt derselbe
            Monat zugleich den Sammelanker. Zwei Felder für einen Zeitpunkt wären zwei
            Wahrheiten, und die erste Abweichung fiele niemandem auf.

            Beim BEARBEITEN bleibt es der Anker und damit nur beim Aufbauenden: ab
            wann ein GEÄNDERTER Betrag gilt, sagt dort die Betragsreihe darüber. */}
        {(!editId || art === "aufbauend") && (
          <FormField
            label={editId ? t("budgets.feldStart") : t("budgets.feldGiltAb")}
            hint={editId ? t("budgets.feldStartHinweis") : t(`budgets.feldGiltAbHinweis.${art}`)}
          >
            <Datumsfeld
              ariaLabel={editId ? t("budgets.feldStart") : t("budgets.feldGiltAb")}
              wert={start}
              aufAenderung={setStart}
            />
          </FormField>
        )}
      </div>
      {loeschfrage.dialog}
    </Modal>
  );
}
