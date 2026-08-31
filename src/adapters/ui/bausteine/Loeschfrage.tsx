// Die Rückfrage vor dem Löschen — ein Mechanismus für alle Stellen, an denen etwas
// verschwindet.
//
// Bis 2026-08-27 löschte ein Klick auf den Mülleimer SOFORT: Konto, Kategorie, Person,
// Budget, Budget-Version, Rücklage, Vertrag, Bankzugang. Kein Zwischenschritt,
// kein Rückweg — und die Knöpfe sitzen in Tabellenzeilen, also genau dort, wo man mit der
// Maus unterwegs ist, um etwas anderes zu tun.
//
// **Warum eine Rückfrage und kein Rückgängig.** Ein „Rückgängig" wäre das bessere
// Angebot, aber es müsste jeder Löschweg selbst können: die Kaskaden hängen dran (ein
// Vertrag nimmt seine Zahlungsregel, seine Erkennungsregel und alle Zuordnungen mit) und
// es gibt für Stammdaten bewusst kein Änderungsprotokoll (siehe CLAUDE.md). Eine
// Rückfrage kostet einen Klick und deckt denselben Fall ab — den versehentlichen.
//
// **Was in der Frage steht, ist der eigentliche Punkt.** „Wirklich löschen?" ist eine
// Verzögerung und keine Information; wer sie liest, weiss danach nicht mehr als vorher
// und klickt sie weg. Deshalb nimmt `stellen` einen NAMEN (was genau geht weg) und einen
// Folgen-Satz (was noch mitgeht). Wo eine Kaskade bekannt ist, gehört sie dorthin.

import { useCallback, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "./Modal";
import { Button } from "./Button";

export interface Loeschauftrag {
  /** Was verschwindet — der Name, wie er in der Liste steht. */
  readonly name: string;
  /**
   * Was ausser dem Genannten noch mitgeht. Leer lassen, wenn nichts — ein erfundener
   * Folgensatz ist schlimmer als keiner.
   */
  readonly folgen?: string;
  readonly ausfuehren: () => Promise<void> | void;
}

export interface Loeschfrage {
  /** Die Frage stellen. Gelöscht wird erst nach dem Bestätigen. */
  readonly stellen: (auftrag: Loeschauftrag) => void;
  /** In den Screen einhängen — ohne das erscheint nichts. */
  readonly dialog: ReactNode;
}

/**
 * Der Zustand liegt beim SCREEN und nicht beim Knopf: eine Tabelle hat einen Mülleimer je
 * Zeile, und ein Dialog je Zeile wären hundert Dialoge im Baum. So ist es einer, und
 * welche Zeile ihn geöffnet hat, steht im Auftrag.
 */
export function useLoeschfrage(): Loeschfrage {
  const { t } = useTranslation();
  const [auftrag, setAuftrag] = useState<Loeschauftrag | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const stellen = useCallback((neu: Loeschauftrag) => {
    setFehler(null);
    setAuftrag(neu);
  }, []);

  const schliessen = useCallback(() => {
    if (laeuft) return;
    setAuftrag(null);
    setFehler(null);
  }, [laeuft]);

  async function bestaetigen() {
    if (!auftrag) return;
    setLaeuft(true);
    setFehler(null);
    try {
      await auftrag.ausfuehren();
      setAuftrag(null);
    } catch (e) {
      // Der Dialog bleibt STEHEN und zeigt den Fehler. Ein Löschen, das an einem
      // Fremdschlüssel scheitert (ein Konto mit Buchungen), sähe sonst aus wie ein
      // erfolgreiches: der Dialog geht zu, die Zeile bleibt, und niemand weiss, warum.
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setLaeuft(false);
    }
  }

  const dialog = auftrag ? (
    <Modal
      title={t("loeschen.titel")}
      subtitle={t("loeschen.untertitel", { name: auftrag.name })}
      onClose={schliessen}
      footer={
        <>
          {/* `primary` wie beim Sammellöschen im Buchungsdialog — dieselbe Frage soll
              gleich aussehen. Der Dialog geht ohnehin nur auf, wenn jemand den Mülleimer
              gedrückt hat; die vorbelegte Handlung IST hier das Löschen, und der
              harmlose Weg ist Abbrechen oder Esc. `Button` kennt kein `disabled` (er
              kommt aus dem Design-System, dort wird nichts erfunden) — während des
              Löschens verschwindet er deshalb, statt grau zu werden. */}
          {!laeuft && (
            <Button variant="primary" onClick={() => void bestaetigen()}>
              {t("loeschen.bestaetigen")}
            </Button>
          )}
          {laeuft && <span className="muted">{t("loeschen.laeuft")}</span>}
          <button className="linkbtn" onClick={schliessen} disabled={laeuft}>
            {t("loeschen.abbrechen")}
          </button>
          {fehler && <span className="err">{fehler}</span>}
        </>
      }
    >
      <p style={{ margin: 0 }}>{t("loeschen.frage", { name: auftrag.name })}</p>
      {auftrag.folgen && (
        <p className="muted" style={{ marginTop: "var(--sp-3)", marginBottom: 0 }}>
          {auftrag.folgen}
        </p>
      )}
    </Modal>
  ) : null;

  return { stellen, dialog };
}
