// Einen Wert oder eine Restschuld zu einem Stichtag eintragen.
//
// EIN Dialog für beides: Stichtag und Betrag, sonst nichts. Was sich unterscheidet, sind
// die Wörter („Wert" beim Vermögenswert, „Restschuld" bei der Schuld) und der Aufruf
// dahinter.
//
// Der Stichtag ist mit heute vorbelegt und fast immer falsch — die Mitteilung, aus der
// man abschreibt, nennt ihren eigenen. Vorbelegt ist er trotzdem: ein leeres Datumsfeld
// liest sich als „optional".

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { restschuldEintragen, wertEintragen } from "../../dienste";
import { Button, FormField } from "../bausteine";
import { Datumsfeld } from "../bausteine/Datumsfeld";
import { Modal } from "../bausteine/Modal";
import { fehlerNachricht, useGeld } from "../bausteine/einstellungenKontext";

export function BeobachtungDialog({
  art,
  id,
  name,
  heute,
  onClose,
  onGespeichert,
}: {
  /** Wofür eingetragen wird — daran hängen Wörter und Aufruf. */
  art: "wert" | "restschuld";
  /** Der Vermögenswert bzw. die Schuld. */
  id: string;
  name: string;
  heute: string;
  onClose: () => void;
  onGespeichert: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const geld = useGeld();
  const [stichtag, setStichtag] = useState(heute);
  const [betrag, setBetrag] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);

  const istWert = art === "wert";

  async function speichern() {
    setFehler(null);
    // Unlesbares geht als NaN weiter: der Use-Case weist es mit der Meldung ab, die zu
    // diesem Feld gehört. Hier eine Null daraus zu machen trüge „nichts wert" ein.
    const eingabe = { stichtag, betrag: geld.parse(betrag) ?? Number.NaN };
    try {
      if (istWert) await wertEintragen(id, eingabe, heute);
      else await restschuldEintragen(id, eingabe, heute);
      await onGespeichert();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    }
  }

  const feld = istWert ? t("vermoegen.feldWert") : t("vermoegen.feldRestschuld");

  return (
    <Modal
      title={istWert ? t("vermoegen.wertEintragen") : t("vermoegen.restschuldEintragen")}
      subtitle={name}
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" onClick={speichern}>{t("vermoegen.speichern")}</Button>
          <Button variant="link" onClick={onClose}>{t("vermoegen.abbrechen")}</Button>
          {fehler && <span className="err">{fehler}</span>}
        </>
      }
    >
      <div className="form-grid">
        <FormField label={t("vermoegen.feldStichtag")} required>
          <Datumsfeld ariaLabel={t("vermoegen.feldStichtag")} wert={stichtag} aufAenderung={setStichtag} heute={heute} />
        </FormField>
        <FormField
          label={`${feld} ${geld.symbol}`}
          required
          hint={istWert ? t("vermoegen.feldWertHinweis") : t("vermoegen.feldRestschuldHinweis")}
        >
          <input
            className="field"
            autoFocus
            inputMode="decimal"
            value={betrag}
            onChange={(e) => setBetrag(e.target.value)}
            placeholder={geld.format(0)}
          />
        </FormField>
      </div>
    </Modal>
  );
}
