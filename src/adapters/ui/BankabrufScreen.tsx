// Bankabruf — Zugang hinterlegen, anmelden, Konten sehen.
//
// Der Zuschnitt folgt dem, was der Spike gezeigt hat, nicht dem, was FinTS theoretisch
// kann: Die Fähigkeitsmatrix der Bank steht IN der Oberfläche, statt dass ein Knopf
// kommentarlos nichts tut. Konten, die die Bibliothek nicht sicher ansprechen kann
// (mehrfach vergebene Kontonummer), erscheinen benannt statt als leere Liste.
//
// Die PIN steht nur in diesem State. Sie wird nicht gespeichert, nicht geloggt und nach
// dem Verlassen des Screens ist sie weg.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Bankkonto, Bankzugang, Abrufsitzung, TanHerausforderung } from "../../application/fints/abrufPort";
import { fintsAbruf, fintsEinsatzbereit } from "../fints";
import { sqliteBankzugangRepository } from "../persistence/sqliteBankzugangRepositories";
import { Button, Card, DataTable, FormField, Pill } from "./ds";
import { BankSuche } from "./BankSuche";
import { Modal } from "./Modal";
import { PageHead } from "./PageHead";
import { useGeld } from "./einstellungenKontext";

interface KontoZeile extends Bankkonto {
  saldo?: number;
  saldoDatum?: string;
}

/** Offene TAN-Rückfrage: die Herausforderung plus der Weg, die Antwort zurückzugeben. */
interface TanDialog {
  herausforderung: TanHerausforderung;
  antworten: (tan: string | undefined) => void;
}

function leererZugang(): Bankzugang {
  return { id: crypto.randomUUID(), bezeichnung: "", url: "", blz: "", benutzer: "" };
}

export function BankabrufScreen() {
  const { t } = useTranslation();
  const geld = useGeld();

  const [zugaenge, setZugaenge] = useState<Bankzugang[]>([]);
  const [form, setForm] = useState<Bankzugang>(leererZugang);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [sitzung, setSitzung] = useState<Abrufsitzung | null>(null);
  const [konten, setKonten] = useState<KontoZeile[]>([]);
  const [tanDialog, setTanDialog] = useState<TanDialog | null>(null);
  const [tanEingabe, setTanEingabe] = useState("");

  useEffect(() => {
    sqliteBankzugangRepository
      .alle()
      .then((z) => {
        setZugaenge(z);
        if (z[0]) setForm(z[0]);
      })
      .catch(() => setZugaenge([])); // reiner Browser-Modus ohne SQLite
  }, []);

  function setze<K extends keyof Bankzugang>(feld: K, wert: Bankzugang[K]) {
    setForm((f) => ({ ...f, [feld]: wert }));
  }

  /**
   * Wird vom Adapter gerufen, wenn die Bank eine Freigabe verlangt. Beim Lesen ist das
   * die Ausnahme (PSD2), nicht der Normalfall — bei comdirect kommt sie erst, wenn der
   * Zeitraum über 90 Tage zurückreicht.
   */
  function frageTan(h: TanHerausforderung): Promise<string | undefined> {
    return new Promise((resolve) => {
      setTanEingabe("");
      setTanDialog({
        herausforderung: h,
        antworten: (tan) => {
          setTanDialog(null);
          resolve(tan);
        },
      });
    });
  }

  async function anmelden() {
    setBusy(true);
    setFehler(null);
    setSitzung(null);
    setKonten([]);
    try {
      const s = await fintsAbruf.anmelden(form, pin, frageTan);
      setSitzung(s);

      // Bankparameter aufbewahren: ohne sie synchronisiert die nächste Anmeldung von
      // vorn. Der Zugang wird dabei gleich mit angelegt bzw. aktualisiert.
      const gespeichert: Bankzugang = { ...form, bankparameter: s.bankparameter() };
      await sqliteBankzugangRepository.speichern(gespeichert);
      setForm(gespeichert);
      setZugaenge(await sqliteBankzugangRepository.alle());

      // Salden einzeln und nacheinander: die Sitzung ist ein Dialog, kein Endpunkt, der
      // parallele Anfragen verträgt.
      const zeilen: KontoZeile[] = [];
      for (const k of s.konten) {
        let saldo: Awaited<ReturnType<typeof s.saldo>> = null;
        try {
          saldo = await s.saldo(k);
        } catch {
          saldo = null; // Ein abgelehnter Saldo kippt nicht die ganze Anzeige.
        }
        zeilen.push({ ...k, saldo: saldo?.betrag, saldoDatum: saldo?.datum });
      }
      setKonten(zeilen);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function zugangLoeschen(id: string) {
    await sqliteBankzugangRepository.loeschen(id);
    const rest = await sqliteBankzugangRepository.alle();
    setZugaenge(rest);
    setForm(rest[0] ?? leererZugang());
    setSitzung(null);
    setKonten([]);
  }

  const spalten = [
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
      key: "kann",
      label: t("bankabruf.spalteKann"),
      sortable: false,
      render: (r: KontoZeile) => (
        <span style={{ display: "flex", gap: "var(--sp-1)", flexWrap: "wrap" }}>
          {r.kannSaldo && <Pill variant="ok">{t("bankabruf.kannSaldo")}</Pill>}
          {r.kannUmsaetze && <Pill variant="ok">{t("bankabruf.kannUmsaetze")}</Pill>}
          {!r.adressierbar && <Pill variant="warn">{t("bankabruf.nichtAdressierbar")}</Pill>}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHead title={t("bankabruf.titel")} subtitle={t("bankabruf.untertitel")} />

      {!fintsEinsatzbereit && (
        <Card>
          <div className="err">{t("bankabruf.keineProduktId")}</div>
        </Card>
      )}

      <Card title={t("bankabruf.zugangTitel")} subtitle={t("bankabruf.zugangHinweis")}>
        {zugaenge.length > 1 && (
          <FormField label={t("bankabruf.feldGespeicherte")}>
            <select
              className="field"
              value={form.id}
              onChange={(e) => setForm(zugaenge.find((z) => z.id === e.target.value) ?? leererZugang())}
            >
              {zugaenge.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.bezeichnung}
                </option>
              ))}
            </select>
          </FormField>
        )}

        {/* Bank wählen füllt BLZ, Adresse und (falls noch leer) die Bezeichnung. Beides
            bleibt danach von Hand änderbar — die Liste ist eine Abkürzung, keine Fessel. */}
        <BankSuche
          onWaehlen={(b) =>
            setForm((f) => ({ ...f, blz: b.blz, url: b.url, bezeichnung: f.bezeichnung || b.name }))
          }
        />

        <div className="form-grid">
          <FormField label={t("bankabruf.feldBezeichnung")} required>
            <input className="field" value={form.bezeichnung} onChange={(e) => setze("bezeichnung", e.target.value)} />
          </FormField>
          <FormField label={t("bankabruf.feldBlz")} required>
            <input className="field" inputMode="numeric" value={form.blz} onChange={(e) => setze("blz", e.target.value)} />
          </FormField>
          <FormField label={t("bankabruf.feldUrl")} required hint={t("bankabruf.feldUrlHinweis")}>
            <input className="field" value={form.url} onChange={(e) => setze("url", e.target.value)} placeholder={t("bankabruf.feldUrlPlatzhalter")} />
          </FormField>
          <FormField label={t("bankabruf.feldBenutzer")} required hint={t("bankabruf.feldBenutzerHinweis")}>
            <input className="field" value={form.benutzer} onChange={(e) => setze("benutzer", e.target.value)} />
          </FormField>
          <FormField label={t("bankabruf.feldKundenId")} hint={t("bankabruf.feldKundenIdHinweis")}>
            <input className="field" value={form.kundenId ?? ""} onChange={(e) => setze("kundenId", e.target.value || undefined)} />
          </FormField>
          <FormField label={t("bankabruf.feldPin")} required hint={t("bankabruf.feldPinHinweis")}>
            <input className="field" type="password" value={pin} onChange={(e) => setPin(e.target.value)} autoComplete="off" />
          </FormField>
        </div>

        <div style={{ display: "flex", gap: "var(--sp-2)", alignItems: "center", marginTop: "var(--sp-3)" }}>
          <Button variant="primary" onClick={() => void anmelden()}>
            {busy ? t("bankabruf.laeuft") : t("bankabruf.anmelden")}
          </Button>
          {form.bankparameter && (
            <Button variant="ghost" onClick={() => void zugangLoeschen(form.id)}>
              {t("bankabruf.zugangLoeschen")}
            </Button>
          )}
          {fehler && <span className="err">{fehler}</span>}
        </div>
      </Card>

      {sitzung && (
        <Card
          title={t("bankabruf.kontenTitel")}
          subtitle={t("bankabruf.kontenHinweis", {
            verfahren: sitzung.tanVerfahren ?? "—",
            tage: sitzung.speicherzeitraumTage ?? "?",
          })}
        >
          <DataTable columns={spalten} rows={konten} />

          {konten.some((k) => k.hinweis) && (
            <ul className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: "var(--sp-3)" }}>
              {konten.filter((k) => k.hinweis).map((k) => (
                <li key={k.schluessel}>{k.hinweis}</li>
              ))}
            </ul>
          )}

          {sitzung.bankNachrichten.length > 0 && (
            <div style={{ marginTop: "var(--sp-3)" }}>
              <div className="nlbl">{t("bankabruf.bankNachrichten")}</div>
              <ul className="muted" style={{ fontSize: "var(--fs-xs)" }}>
                {sitzung.bankNachrichten.map((n, i) => (
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
              {sitzung.hinweise.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
          </details>
        </Card>
      )}

      {tanDialog && (
        <Modal
          title={t("bankabruf.tanTitel")}
          subtitle={tanDialog.herausforderung.decoupled ? t("bankabruf.tanDecoupled") : undefined}
          onClose={() => tanDialog.antworten(undefined)}
          footer={
            !tanDialog.herausforderung.decoupled && (
              <Button variant="primary" onClick={() => tanDialog.antworten(tanEingabe)}>
                {t("bankabruf.tanBestaetigen")}
              </Button>
            )
          }
        >
          {tanDialog.herausforderung.text && <p>{tanDialog.herausforderung.text}</p>}
          {/* photoTAN: das Bild kommt inline in der Herausforderung mit. Ohne Anzeige
              gibt es nichts abzuscannen — bei comdirect ist es das einzige Verfahren. */}
          {tanDialog.herausforderung.bild && (
            <img
              alt={t("bankabruf.tanBild")}
              style={{ maxWidth: "100%", imageRendering: "pixelated" }}
              src={URL.createObjectURL(
                new Blob([tanDialog.herausforderung.bild.daten as BlobPart], {
                  type: tanDialog.herausforderung.bild.mimeType,
                }),
              )}
            />
          )}
          {!tanDialog.herausforderung.decoupled && (
            <FormField label={t("bankabruf.tanFeld")} required>
              <input className="field" value={tanEingabe} onChange={(e) => setTanEingabe(e.target.value)} autoFocus />
            </FormField>
          )}
        </Modal>
      )}
    </>
  );
}
