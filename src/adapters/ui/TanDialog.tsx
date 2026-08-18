// TAN-Rückfrage der Bank.
//
// Beim Lesen ist sie die Ausnahme, nicht der Normalfall: comdirect antwortet mit
// `3076 Starke Kundenauthentifizierung nicht notwendig`, solange der Zeitraum in den
// letzten 90 Tagen liegt. Ein Erstimport über Monate zieht sehr wohl eine TAN — der
// Dialog muss also da sein, auch wenn er selten aufgeht.
//
// Zwei Formen, die die Bibliothek unterscheidet:
//  • **photoTAN/chipTAN-QR** — das Bild kommt INLINE in der Herausforderung mit. Ohne
//    Anzeige gibt es nichts abzuscannen; bei comdirect ist es das einzige Verfahren.
//  • **decoupled** — die Freigabe geschieht in der Banking-App, es wird nichts eingetippt.
//    Dann wartet der Adapter und fragt die Bank in ihren eigenen Abständen nach; hier
//    steht nur, dass gewartet wird.

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TanHerausforderung } from "../../application/fints/abrufPort";
import { Button, FormField } from "./ds";
import { Modal } from "./Modal";

/** Eine offene Rückfrage: was die Bank will, und der Weg, die Antwort zurückzugeben. */
export interface TanFrage {
  readonly herausforderung: TanHerausforderung;
  readonly antworten: (tan: string | undefined) => void;
}

export function TanDialog({ frage, onFertig }: { frage: TanFrage; onFertig: () => void }) {
  const { t } = useTranslation();
  const [tan, setTan] = useState("");
  const { bild, text, decoupled } = frage.herausforderung;

  // Objekt-URL statt Data-URI: das Bild ist ein Uint8Array, und der Browser gibt die
  // URL nur wieder frei, wenn man es ihm sagt.
  const bildUrl = useMemo(
    () => (bild ? URL.createObjectURL(new Blob([bild.daten as BlobPart], { type: bild.mimeType })) : null),
    [bild],
  );
  useEffect(() => () => { if (bildUrl) URL.revokeObjectURL(bildUrl); }, [bildUrl]);

  function beantworten(wert: string | undefined) {
    frage.antworten(wert);
    onFertig();
  }

  return (
    <Modal
      title={t("bankabruf.tanTitel")}
      subtitle={decoupled ? t("bankabruf.tanDecoupled") : undefined}
      onClose={() => beantworten(undefined)}
      // Bei decoupled gibt es nichts zu bestätigen — der Adapter fragt die Bank selbst.
      footer={
        decoupled ? undefined : (
          <Button variant="primary" onClick={() => beantworten(tan)}>
            {t("bankabruf.tanBestaetigen")}
          </Button>
        )
      }
      z={60}
    >
      {text && <p>{text}</p>}
      {bildUrl && <img alt={t("bankabruf.tanBild")} style={{ maxWidth: "100%", imageRendering: "pixelated" }} src={bildUrl} />}
      {!decoupled && (
        <FormField label={t("bankabruf.tanFeld")} required>
          <input className="field" value={tan} onChange={(e) => setTan(e.target.value)} autoFocus />
        </FormField>
      )}
    </Modal>
  );
}
