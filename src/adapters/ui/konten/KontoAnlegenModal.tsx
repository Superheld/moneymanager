// Konto anlegen — ein Dialog für beide Fälle.
//
// Ein Konto ist entweder mit der Bank verbunden oder nicht, und das ist beim Anlegen die
// erste Frage, nicht eine Einstellung hinterher. Deshalb steht sie oben im selben Dialog:
//
//  • **offline** — Bargeld, ein Konto ohne FinTS-Zugang, ein Konto, das nur per Datei
//    versorgt wird. Alles von Hand.
//  • **online** — Bank wählen, anmelden, und die Konten, die die Bank meldet, entweder
//    neu anlegen oder mit einem vorhandenen verknüpfen. Die Verbindung bleibt bestehen;
//    der Abruf hängt später an genau dieser Zuordnung.
//
// Der Anfangsbestand ist an dieser Stelle die Falle, und zwar in beiden Zweigen: der
// reale Kontostand der App ist `Anfangsbestand + Summe der Ist-Buchungen`. Wer hier den
// heutigen Saldo der Bank einträgt und danach die letzten Wochen importiert, zählt diese
// Wochen doppelt. Deshalb wird der Bank-Saldo NICHT übernommen, sondern nur angezeigt —
// zusammen mit dem Satz, was der Anfangsbestand tatsächlich ist.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { KONTOTYPEN, type Bankkonto, type Bankzugang, type Kontotyp, type Person, type TanHerausforderung, type Zahlungskonto, type Zugangsart } from "../../../application";
import { typAusName } from "../../../application/import";
import { fintsEinsatzbereit } from "../../fints";
import { HANSEATIC_BASIS_URL } from "../../hanseatic";
import type { Bankeintrag } from "../../fints/bankenliste";
import {
  abrufAdapterFuer,
  bankzugangSpeichern,
  kontoAnlegen,
  kontozuordnungSpeichern,
  umsaetze,
} from "../../dienste";
import { BankSuche } from "./BankSuche";
import { TanDialog, type TanFrage } from "./TanDialog";
import { Button, FormField, Pill } from "../bausteine";
import { beiEnter } from "../bausteine/beiEnter";
import { Auswahl } from "../bausteine/Auswahl";
import { Modal } from "../bausteine/Modal";
import { fehlerNachricht, useExperimente, useGeld } from "../bausteine/einstellungenKontext";

type Art = "offline" | "online";

/** Was mit einem von der Bank gemeldeten Konto geschehen soll. */
interface Wahl {
  ziel: "ignorieren" | "neu" | "vorhanden";
  kontoId?: string;
}

export function KontoAnlegenModal({
  personen,
  konten,
  onClose,
  onGespeichert,
}: {
  personen: readonly Person[];
  konten: readonly Zahlungskonto[];
  onClose: () => void;
  onGespeichert: () => void;
}) {
  const { t } = useTranslation();
  const geld = useGeld();
  const experimente = useExperimente();
  const [art, setArt] = useState<Art>("offline");
  const [fehler, setFehler] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // ── offline ────────────────────────────────────────────────────────────────────────
  const [bezeichnung, setBezeichnung] = useState("");
  const [typ, setTyp] = useState<Kontotyp>("Giro");
  const [iban, setIban] = useState("");
  const [inhaberIds, setInhaberIds] = useState<string[]>([]);
  const [saldoText, setSaldoText] = useState("");

  // ── online ─────────────────────────────────────────────────────────────────────────
  const [zugang, setZugang] = useState<Bankzugang>({
    id: crypto.randomUUID(),
    bezeichnung: "",
    art: "fints",
    url: "",
    blz: "",
    benutzer: "",
  });
  const [pin, setPin] = useState("");
  const [bankkonten, setBankkonten] = useState<Bankkonto[] | null>(null);
  const [salden, setSalden] = useState<Record<string, number>>({});
  const [wahlen, setWahlen] = useState<Record<string, Wahl>>({});
  const [tanFrage, setTanFrage] = useState<TanFrage | null>(null);

  function toggleInhaber(id: string) {
    setInhaberIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  function frageTan(h: TanHerausforderung): Promise<string | undefined> {
    return new Promise((antworten) => setTanFrage({ herausforderung: h, antworten }));
  }

  async function offlineSpeichern() {
    setBusy(true);
    setFehler(null);
    try {
      await kontoAnlegen({
        bezeichnung,
        typ,
        iban,
        inhaberIds,
        saldo: geld.parse(saldoText) ?? 0,
      });
      onGespeichert();
      onClose();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    } finally {
      setBusy(false);
    }
  }

  function bankGewaehlt(b: Bankeintrag) {
    setZugang((z) => ({ ...z, blz: b.blz, url: b.url, bezeichnung: z.bezeichnung || b.name }));
  }

  /**
   * Den Zugangsweg wechseln.
   *
   * Dabei werden die Felder mitgeraeumt, die zum anderen Weg gehoerten. Sie stehen zu
   * lassen waere schlimmer als es aussieht: eine Bankleitzahl aus einer FinTS-Suche
   * landete sonst an einem Zugang, der gar keine hat, und die Adresse zeigte auf einen
   * Endpunkt, den diese Bank nicht bedient.
   */
  function wegWaehlen(neuerWeg: Zugangsart) {
    setZugang((z) =>
      neuerWeg === "hanseatic"
        ? { ...z, art: neuerWeg, blz: "", kundenId: undefined, url: HANSEATIC_BASIS_URL }
        : { ...z, art: neuerWeg, token: undefined, url: "" },
    );
  }

  async function verbinden() {
    setBusy(true);
    setFehler(null);
    try {
      const sitzung = await abrufAdapterFuer(zugang.art).anmelden(zugang, pin, frageTan);
      const gespeichert = { ...zugang, bankparameter: sitzung.bankparameter() };
      await bankzugangSpeichern(gespeichert);
      setZugang(gespeichert);

      const stand: Record<string, number> = {};
      for (const k of sitzung.konten) {
        try {
          const s = await sitzung.saldo(k);
          if (s) stand[k.schluessel] = s.betrag;
        } catch {
          // Ein abgelehnter Saldo ist kein Grund, die Kontenliste nicht zu zeigen.
        }
      }
      setSalden(stand);
      setBankkonten([...sitzung.konten]);

      // Vorschlag: was die Bank abrufbar meldet und dessen IBAN schon ein Konto der App
      // trägt, wird verknüpft; alles andere Übrige neu angelegt. Nicht abrufbares bleibt
      // außen vor — es ließe sich ohnehin nicht abholen.
      const vorschlag: Record<string, Wahl> = {};
      for (const k of sitzung.konten) {
        const treffer = k.iban
          ? konten.find((z) => (z.iban ?? "").replace(/\s+/g, "").toUpperCase() === k.iban!.toUpperCase())
          : undefined;
        vorschlag[k.schluessel] = !k.kannUmsaetze
          ? { ziel: "ignorieren" }
          : treffer
            ? { ziel: "vorhanden", kontoId: treffer.id }
            : { ziel: "neu" };
      }
      setWahlen(vorschlag);
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    } finally {
      setBusy(false);
    }
  }

  async function onlineUebernehmen() {
    setBusy(true);
    setFehler(null);
    try {
      const bekannteBuchungen = await umsaetze().catch(() => []);
      for (const k of bankkonten ?? []) {
        const wahl = wahlen[k.schluessel];
        if (!wahl || wahl.ziel === "ignorieren") continue;

        const kontoId =
          wahl.ziel === "vorhanden" && wahl.kontoId
            ? wahl.kontoId
            : (
                await kontoAnlegen({
                  bezeichnung: k.bezeichnung,
                  typ: typAusName(k.bezeichnung),
                  iban: k.iban,
                  inhaberIds: [],
                  // Bewusst 0 und nicht der Bank-Saldo: siehe Kopf dieser Datei.
                  saldo: 0,
                })
              ).id;

        // Wo der Abruf ANFÄNGT, entscheidet sich hier — und das ist die wirksamste
        // Maßnahme gegen Dubletten: Wird ein Konto verknüpft, das schon Buchungen aus
        // einer Datei trägt, beginnt der erste Abruf am letzten bekannten Buchungstag
        // statt 30 Tage davor. Ohne das holt er einen Monat, der längst im Bestand
        // liegt — am echten Bestand waren das 51 von 60 Zeilen.
        //
        // Der Rückgriff des Abrufs (sieben Tage) läuft trotzdem darüber: die Bank trägt
        // nach und verschiebt Buchungstage, und was dabei doppelt hereinkommt, fängt der
        // Dublettenfinder ab. Lieber ein paar erkannte Wiedergänger als eine verlorene
        // Nachzügler-Buchung.
        const letzterTag = bekannteBuchungen
          .filter((u) => u.zahlungskontoId === kontoId)
          .map((u) => u.buchungstag)
          .sort()
          .pop();

        await kontozuordnungSpeichern({
          zugangId: zugang.id,
          schluessel: k.schluessel,
          zahlungskontoId: kontoId,
          letzterAbrufBis: letzterTag,
        });
      }
      onGespeichert();
      onClose();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    } finally {
      setBusy(false);
    }
  }

  const fussOffline = (
    <>
      <Button variant="primary" onClick={() => void offlineSpeichern()}>
        {t("einstellungen.speichern")}
      </Button>
      <button className="linkbtn" onClick={onClose}>
        {t("einstellungen.abbrechen")}
      </button>
      {fehler && <span className="err">{fehler}</span>}
    </>
  );

  const fussOnline = (
    <>
      {bankkonten === null ? (
        <Button variant="primary" onClick={() => void verbinden()}>
          {busy ? t("konten.anlegen.verbindet") : t("konten.anlegen.verbinden")}
        </Button>
      ) : (
        <Button variant="primary" onClick={() => void onlineUebernehmen()}>
          {t("konten.anlegen.uebernehmen")}
        </Button>
      )}
      <button className="linkbtn" onClick={onClose}>
        {t("einstellungen.abbrechen")}
      </button>
      {fehler && <span className="err">{fehler}</span>}
    </>
  );

  return (
    <>
      <Modal
        title={t("konten.anlegen.titel")}
        subtitle={t("konten.anlegen.untertitel")}
        onClose={onClose}
        footer={art === "offline" ? fussOffline : fussOnline}
      >
        <FormField label={t("konten.anlegen.feldArt")} hint={t("konten.anlegen.feldArtHinweis")}>
          <Auswahl
            ariaLabel={t("konten.anlegen.feldArt")}
            wert={art}
            aufAenderung={(v) => {
              setArt(v as Art);
              setFehler(null);
            }}
            optionen={[
              { wert: "offline", text: t("konten.anlegen.artOffline") },
              { wert: "online", text: t("konten.anlegen.artOnline") },
            ]}
          />
        </FormField>

        {art === "offline" && (
          <div className="form-grid">
            <FormField label={t("einstellungen.konto.feldBezeichnung")} required>
              <input className="field" value={bezeichnung} onChange={(e) => setBezeichnung(e.target.value)} />
            </FormField>
            <FormField label={t("einstellungen.konto.feldTyp")}>
              <Auswahl
                wert={typ}
                aufAenderung={(v) => setTyp(v as Kontotyp)}
                optionen={KONTOTYPEN.map((k) => ({ wert: k, text: t(`einstellungen.konto.typ.${k}`) }))}
                ariaLabel={t("einstellungen.konto.feldTyp")}
              />
            </FormField>
            <FormField label={t("einstellungen.konto.feldIban")} hint={t("einstellungen.konto.feldIbanHinweis")}>
              <input className="field" value={iban} onChange={(e) => setIban(e.target.value)} />
            </FormField>
            <FormField
              label={`${t("einstellungen.konto.feldKontostand")} ${geld.symbol}`}
              hint={t("konten.anlegen.saldoHinweis")}
            >
              <input className="field" inputMode="decimal" value={saldoText} onChange={(e) => setSaldoText(e.target.value)} />
            </FormField>
            {personen.length > 0 && (
              <FormField label={t("einstellungen.konto.feldInhaber")}>
                <span style={{ display: "flex", gap: "var(--sp-3)", flexWrap: "wrap" }}>
                  {personen.map((p) => (
                    <label key={p.id} style={{ display: "flex", gap: "var(--sp-1)", alignItems: "center" }}>
                      <input type="checkbox" checked={inhaberIds.includes(p.id)} onChange={() => toggleInhaber(p.id)} />
                      {p.name}
                    </label>
                  ))}
                </span>
              </FormField>
            )}
          </div>
        )}

        {art === "online" && zugang.art === "fints" && !fintsEinsatzbereit && (
          <div className="err">{t("bankabruf.keineProduktId")}</div>
        )}

        {art === "online" && bankkonten === null && (
          <>
            {/* Die Wahl steht nur da, wenn es etwas zu waehlen gibt: ohne eingeschaltetes
                Experiment ist FinTS der einzige Weg, und eine Auswahl mit einem Eintrag
                waere eine Frage ohne Antwortmoeglichkeit. */}
            {experimente.hanseatic && (
              <FormField label={t("bankabruf.feldWeg")} hint={t("bankabruf.feldWegHinweis")}>
                <Auswahl
                  ariaLabel={t("bankabruf.feldWeg")}
                  wert={zugang.art}
                  aufAenderung={(v) => wegWaehlen(v as Zugangsart)}
                  optionen={[
                    { wert: "fints", text: t("bankabruf.wegFints") },
                    { wert: "hanseatic", text: t("bankabruf.wegHanseatic") },
                  ]}
                />
              </FormField>
            )}

            {zugang.art === "hanseatic" && <div className="hint">{t("bankabruf.hanseaticHinweis")}</div>}

            {/* Die Banksuche gilt der DK-Liste. Wer nicht am Verfahren teilnimmt, steht
                dort nicht — dann hilft sie nicht, sie verwirrt nur. */}
            {zugang.art === "fints" && <BankSuche onWaehlen={bankGewaehlt} />}
            <div className="form-grid">
              <FormField label={t("bankabruf.feldBezeichnung")} required>
                <input
                  className="field"
                  value={zugang.bezeichnung}
                  onChange={(e) => setZugang({ ...zugang, bezeichnung: e.target.value })}
                />
              </FormField>
              {zugang.art === "fints" && (
                <>
                  <FormField label={t("bankabruf.feldBlz")} required>
                    <input className="field" value={zugang.blz} onChange={(e) => setZugang({ ...zugang, blz: e.target.value })} />
                  </FormField>
                  <FormField label={t("bankabruf.feldUrl")} required hint={t("bankabruf.feldUrlHinweis")}>
                    <input className="field" value={zugang.url} onChange={(e) => setZugang({ ...zugang, url: e.target.value })} />
                  </FormField>
                </>
              )}
              <FormField
                label={zugang.art === "hanseatic" ? t("bankabruf.feldAnmeldekennung") : t("bankabruf.feldBenutzer")}
                required
                hint={
                  zugang.art === "hanseatic"
                    ? t("bankabruf.feldAnmeldekennungHinweis")
                    : t("bankabruf.feldBenutzerHinweis")
                }
              >
                <input
                  className="field"
                  value={zugang.benutzer}
                  onChange={(e) => setZugang({ ...zugang, benutzer: e.target.value })}
                />
              </FormField>
              {zugang.art === "fints" && (
                <FormField label={t("bankabruf.feldKundenId")} hint={t("bankabruf.feldKundenIdHinweis")}>
                  <input
                    className="field"
                    value={zugang.kundenId ?? ""}
                    onChange={(e) => setZugang({ ...zugang, kundenId: e.target.value || undefined })}
                  />
                </FormField>
              )}
              {zugang.art === "hanseatic" && (
                <FormField label={t("bankabruf.feldToken")} required hint={t("bankabruf.feldTokenHinweis")}>
                  <input
                    className="field"
                    value={zugang.token ?? ""}
                    onChange={(e) => setZugang({ ...zugang, token: e.target.value || undefined })}
                    autoComplete="off"
                  />
                </FormField>
              )}
              <FormField
                label={zugang.art === "hanseatic" ? t("bankabruf.feldPasswort") : t("bankabruf.feldPin")}
                required
                hint={
                  zugang.art === "hanseatic"
                    ? t("bankabruf.feldPasswortHinweis")
                    : t("bankabruf.feldPinHinweis")
                }
              >
                <input
                  className="field"
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  onKeyDown={beiEnter(() => void verbinden(), !!pin.trim() && !busy)}
                  autoComplete="off"
                />
              </FormField>
            </div>
          </>
        )}

        {art === "online" && bankkonten !== null && (
          <>
            <div className="muted" style={{ fontSize: "var(--fs-xs)", marginBottom: "var(--sp-3)" }}>
              {t("konten.anlegen.zuordnenHinweis")}
            </div>
            {bankkonten.map((k) => {
              const wahl = wahlen[k.schluessel] ?? { ziel: "ignorieren" as const };
              return (
                <div key={k.schluessel} style={{ borderTop: "1px solid var(--line-soft)", padding: "var(--sp-3) 0" }}>
                  <div style={{ display: "flex", gap: "var(--sp-2)", alignItems: "baseline", flexWrap: "wrap" }}>
                    <strong>{k.bezeichnung}</strong>
                    <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>
                      {k.iban ?? k.nummer}
                    </span>
                    {salden[k.schluessel] !== undefined && (
                      <Pill variant="neutral">
                        {t("konten.anlegen.standBank", { betrag: geld.format(salden[k.schluessel]) })}
                      </Pill>
                    )}
                    {!k.kannUmsaetze && <Pill variant="warn">{t("bankabruf.nichtAdressierbar")}</Pill>}
                  </div>
                  {k.hinweis && (
                    <div className="muted" style={{ fontSize: "var(--fs-xs)", margin: "var(--sp-1) 0" }}>
                      {k.hinweis}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: "var(--sp-2)", marginTop: "var(--sp-2)", flexWrap: "wrap" }}>
                    <span style={{ maxWidth: 220, flex: "1 1 160px" }}>
                      <Auswahl
                        ariaLabel={t("konten.anlegen.zielFeld")}
                        wert={wahl.ziel}
                        aufAenderung={(v) =>
                          setWahlen({ ...wahlen, [k.schluessel]: { ...wahl, ziel: v as Wahl["ziel"] } })
                        }
                        optionen={[
                          { wert: "ignorieren", text: t("konten.anlegen.zielIgnorieren") },
                          { wert: "neu", text: t("konten.anlegen.zielNeu") },
                          { wert: "vorhanden", text: t("konten.anlegen.zielVorhanden") },
                        ]}
                      />
                    </span>
                    {wahl.ziel === "vorhanden" && (
                      <span style={{ maxWidth: 260, flex: "1 1 180px" }}>
                        <Auswahl
                          ariaLabel={t("konten.anlegen.zielVorhanden")}
                          wert={wahl.kontoId ?? ""}
                          aufAenderung={(v) => setWahlen({ ...wahlen, [k.schluessel]: { ...wahl, kontoId: v } })}
                          optionen={[{ wert: "", text: "—" }, ...konten.map((z) => ({ wert: z.id, text: z.bezeichnung }))]}
                        />
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: "var(--sp-3)" }}>
              {t("konten.anlegen.saldoHinweis")}
            </div>
          </>
        )}
      </Modal>

      {tanFrage && <TanDialog frage={tanFrage} onFertig={() => setTanFrage(null)} />}
    </>
  );
}
