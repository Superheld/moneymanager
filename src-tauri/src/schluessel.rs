// Der Datenschluessel und was ihn schuetzt.
//
// **Die Kernentscheidung: die Passphrase IST NICHT der Schluessel, sie wickelt ihn ein.**
// Die Datenbank wird mit einem gewuerfelten Datenschluessel verschluesselt; dieser
// Schluessel wird seinerseits mit einem aus der Passphrase abgeleiteten Schluessel
// verschluesselt und liegt so neben der Datenbank.
//
// Der Umweg kostet eine Datei und loest zwei Dinge, die sonst gar nicht gingen:
//
//   • **Passphrase aendern** heisst dann, den Datenschluessel neu einzuwickeln — Sekunden.
//     Waere die Passphrase der Schluessel, muesste der ganze Bestand neu verschluesselt
//     werden, jedes Mal.
//   • **Ein Wiederherstellungscode** ist ueberhaupt erst moeglich: er IST der
//     Datenschluessel in lesbarer Form. Aus einer vergessenen Passphrase laesst sich
//     nichts zurueckgewinnen — aus dem Code schon.
//
// **Nichts davon ist selbst gebaut.** Argon2id und XChaCha20-Poly1305 kommen aus dem
// RustCrypto-Projekt. Bei Krypto ist die eigene Konstruktion immer die schlechtere; was
// hier steht, ist die Verdrahtung, nicht das Verfahren.

// Noch nicht verdrahtet: die Oberflaeche zum Einrichten und Entsperren ist die naechste
// Scheibe. Bis dahin sieht der Nicht-Test-Build hier lauter Ungenutztes — und eine
// Warnung, die man wegzuschauen lernt, nimmt die naechste echte mit.
#![allow(dead_code)]

use argon2::{Algorithm, Argon2, Params, Version};
use chacha20poly1305::aead::{Aead, KeyInit};
use chacha20poly1305::{XChaCha20Poly1305, XNonce};
use data_encoding::{BASE32_NOPAD, BASE64};
use rand::Rng;
use serde::{Deserialize, Serialize};
use zeroize::{Zeroize, ZeroizeOnDrop};

/// 32 Byte — die Schluessellaenge, die SQLCipher als Rohschluessel erwartet.
pub const SCHLUESSEL_BYTES: usize = 32;
const SALZ_BYTES: usize = 16;
const NONCE_BYTES: usize = 24;

/// **Argon2id, absichtlich teuer.**
///
/// 64 MiB Speicher und drei Durchgaenge kosten auf einem heutigen Rechner ungefaehr eine
/// halbe Sekunde. Beim Entsperren ist das kaum spuerbar; fuer jemanden, der Passphrasen
/// durchprobiert, ist es der Unterschied zwischen Millionen Versuchen pro Sekunde und
/// zweien. Der Speicherbedarf ist dabei der wichtigere Teil: er nimmt Spezialhardware
/// ihren Vorteil.
///
/// Die Werte stehen in der Huelle mit drin. Wer sie spaeter hebt, kann alte Huellen
/// weiterhin oeffnen — ohne das waere jede Aenderung ein Datenverlust.
const M_KIB: u32 = 65_536;
const T_DURCHGAENGE: u32 = 3;
const P_SPUREN: u32 = 4;

/// Ein Schluessel, der beim Wegwerfen ueberschrieben wird.
///
/// Das ist kein Schutz gegen jemanden, der den Speicher des laufenden Prozesses liest —
/// dagegen hilft hier nichts. Es verhindert, dass der Schluessel nach dem Sperren noch
/// im Heap steht und in einen Absturzbericht oder eine Auslagerungsdatei geraet.
#[derive(Clone, Zeroize, ZeroizeOnDrop)]
pub struct Datenschluessel([u8; SCHLUESSEL_BYTES]);

/// **Von Hand und absichtlich nichtssagend.** Ein abgeleitetes `Debug` schriebe den
/// Schluessel in jede Fehlermeldung, jedes `dbg!` und jeden Absturzbericht — und niemand
/// bemerkt es, weil es genau dann passiert, wenn ohnehin schon etwas schiefgeht.
impl std::fmt::Debug for Datenschluessel {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("Datenschluessel(<verborgen>)")
    }
}

impl Datenschluessel {
    /// Ein frischer, gewuerfelter Schluessel.
    pub fn wuerfeln() -> Self {
        let mut bytes = [0u8; SCHLUESSEL_BYTES];
        rand::rng().fill_bytes(&mut bytes);
        Self(bytes)
    }

    /// Der fertige Wert fuer `PRAGMA key` — als ROHSCHLUESSEL, nicht als Passwort.
    ///
    /// **Die Form ist `"x\'<hex>\'"`, mit DOPPELTEN Anfuehrungszeichen aussen**, und beide
    /// Ebenen sind noetig:
    ///
    ///   • `x\'…\'` sagt SQLCipher, dass dies der Schluessel SELBST ist. Ohne diese
    ///     Klammerung faende SQLCipher ein Passwort vor und jagte es noch einmal durch
    ///     seine eigene Ableitung — dann haengt die Sicherheit an SQLCiphers KDF statt an
    ///     Argon2id, und der Wiederherstellungscode passte nicht mehr zu dem, was die
    ///     Datei tatsaechlich verschluesselt.
    ///   • Die doppelten Anfuehrungszeichen aussen, weil `PRAGMA` KEINEN Blob-Ausdruck
    ///     annimmt, sondern eine Zeichenkette. `PRAGMA key = x\'ab…\'` ist schlicht ein
    ///     Syntaxfehler — gemessen, nicht vermutet; genau daran ist der erste Anlauf
    ///     gescheitert.
    ///
    /// Zu escapen gibt es hier nichts: der Inhalt ist Hex.
    pub fn als_pragma(&self) -> String {
        let mut hex = String::with_capacity(SCHLUESSEL_BYTES * 2);
        for b in self.0 {
            hex.push_str(&format!("{b:02x}"));
        }
        format!("\"x\'{hex}\'\"")
    }

    /// Der Wiederherstellungscode: derselbe Schluessel, nur lesbar.
    ///
    /// Base32 ohne Fuellzeichen, in Gruppen zu vier. Base32 und nicht Base64, weil
    /// jemand das hier abschreiben soll: es kennt keine Gross-/Kleinschreibung als
    /// Unterschied und keine Zeichen, die auf Papier verwechselbar sind.
    pub fn als_wiederherstellungscode(&self) -> String {
        let roh = BASE32_NOPAD.encode(&self.0);
        roh.as_bytes()
            .chunks(4)
            .map(|c| String::from_utf8_lossy(c).to_string())
            .collect::<Vec<_>>()
            .join("-")
    }

    /// Zurueck aus dem Code. Tolerant gegenueber allem, was beim Abschreiben passiert:
    /// Kleinschreibung, fehlende oder zusaetzliche Trennstriche, Leerzeichen.
    pub fn aus_wiederherstellungscode(code: &str) -> Result<Self, SchluesselFehler> {
        let sauber: String = code
            .chars()
            .filter(|c| c.is_ascii_alphanumeric())
            .map(|c| c.to_ascii_uppercase())
            .collect();
        let bytes = BASE32_NOPAD
            .decode(sauber.as_bytes())
            .map_err(|_| SchluesselFehler::CodeUnlesbar)?;
        let bytes: [u8; SCHLUESSEL_BYTES] =
            bytes.try_into().map_err(|_| SchluesselFehler::CodeUnlesbar)?;
        Ok(Self(bytes))
    }

    #[cfg(test)]
    fn bytes(&self) -> [u8; SCHLUESSEL_BYTES] {
        self.0
    }
}

/// Was neben der Datenbank liegt: der eingewickelte Datenschluessel samt allem, was zum
/// Auswickeln noetig ist — ausser der Passphrase.
///
/// **Hier steht nichts Geheimes.** Salz und Nonce sind oeffentlich, so ist es gedacht;
/// der Geheimtext ist ohne die Passphrase nichts wert. Die Datei darf mitgesichert
/// werden, und sie MUSS es sogar: eine Sicherung ohne sie ist nicht zu oeffnen.
#[derive(Serialize, Deserialize, Clone)]
pub struct Huelle {
    /// Damit ein spaeteres Verfahren die alten Huellen noch erkennt.
    pub fassung: u32,
    pub kdf: KdfAngaben,
    /// Base64.
    pub nonce: String,
    /// Base64.
    pub geheimtext: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct KdfAngaben {
    pub art: String,
    pub m_kib: u32,
    pub t_durchgaenge: u32,
    pub p_spuren: u32,
    /// Base64.
    pub salz: String,
}

#[derive(Debug, PartialEq, Eq)]
pub enum SchluesselFehler {
    /// Die Passphrase passt nicht — oder die Huelle wurde veraendert. Die beiden Faelle
    /// sind bewusst NICHT unterscheidbar: was unterscheidbar ist, ist ein Orakel.
    PassphraseFalsch,
    /// Die Huelle stammt aus einer Fassung, die dieser Stand nicht kennt.
    FassungUnbekannt(u32),
    /// Der abgeschriebene Code ergibt keinen Schluessel.
    CodeUnlesbar,
    /// Etwas an der Huelle ist kaputt (kein Base64, falsche Laenge).
    HuelleKaputt,
}

impl std::fmt::Display for SchluesselFehler {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::PassphraseFalsch => write!(f, "Passphrase falsch"),
            Self::FassungUnbekannt(v) => write!(f, "Unbekannte Huellen-Fassung {v}"),
            Self::CodeUnlesbar => write!(f, "Wiederherstellungscode unlesbar"),
            Self::HuelleKaputt => write!(f, "Die Schluesseldatei ist beschaedigt"),
        }
    }
}

const FASSUNG: u32 = 1;

fn kek(passphrase: &str, salz: &[u8], p: &KdfAngaben) -> Result<[u8; 32], SchluesselFehler> {
    let params = Params::new(p.m_kib, p.t_durchgaenge, p.p_spuren, Some(32))
        .map_err(|_| SchluesselFehler::HuelleKaputt)?;
    let argon = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut ausgabe = [0u8; 32];
    argon
        .hash_password_into(passphrase.as_bytes(), salz, &mut ausgabe)
        .map_err(|_| SchluesselFehler::HuelleKaputt)?;
    Ok(ausgabe)
}

/// Den Datenschluessel mit einer Passphrase einwickeln.
pub fn einwickeln(dk: &Datenschluessel, passphrase: &str) -> Result<Huelle, SchluesselFehler> {
    let mut salz = [0u8; SALZ_BYTES];
    let mut nonce = [0u8; NONCE_BYTES];
    rand::rng().fill_bytes(&mut salz);
    rand::rng().fill_bytes(&mut nonce);

    let angaben = KdfAngaben {
        art: "argon2id".into(),
        m_kib: M_KIB,
        t_durchgaenge: T_DURCHGAENGE,
        p_spuren: P_SPUREN,
        salz: BASE64.encode(&salz),
    };

    let mut schluessel = kek(passphrase, &salz, &angaben)?;
    let aead = XChaCha20Poly1305::new((&schluessel).into());
    let geheimtext = aead
        .encrypt(XNonce::from_slice(&nonce), dk.0.as_slice())
        .map_err(|_| SchluesselFehler::HuelleKaputt)?;
    schluessel.zeroize();

    Ok(Huelle {
        fassung: FASSUNG,
        kdf: angaben,
        nonce: BASE64.encode(&nonce),
        geheimtext: BASE64.encode(&geheimtext),
    })
}

/// Und zurueck. Der einzige Weg dorthin ausser dem Wiederherstellungscode.
pub fn auswickeln(huelle: &Huelle, passphrase: &str) -> Result<Datenschluessel, SchluesselFehler> {
    if huelle.fassung != FASSUNG {
        return Err(SchluesselFehler::FassungUnbekannt(huelle.fassung));
    }
    let salz = BASE64
        .decode(huelle.kdf.salz.as_bytes())
        .map_err(|_| SchluesselFehler::HuelleKaputt)?;
    let nonce = BASE64
        .decode(huelle.nonce.as_bytes())
        .map_err(|_| SchluesselFehler::HuelleKaputt)?;
    let geheimtext = BASE64
        .decode(huelle.geheimtext.as_bytes())
        .map_err(|_| SchluesselFehler::HuelleKaputt)?;
    if nonce.len() != NONCE_BYTES {
        return Err(SchluesselFehler::HuelleKaputt);
    }

    let mut schluessel = kek(passphrase, &salz, &huelle.kdf)?;
    let aead = XChaCha20Poly1305::new((&schluessel).into());
    let klartext = aead
        .decrypt(XNonce::from_slice(&nonce), geheimtext.as_slice())
        // Ab hier ist nicht mehr unterscheidbar, ob die Passphrase falsch war oder jemand
        // an der Datei gedreht hat. Das ist Absicht: Poly1305 prueft beides in einem, und
        // zwei verschiedene Meldungen waeren ein Orakel.
        .map_err(|_| SchluesselFehler::PassphraseFalsch);
    schluessel.zeroize();

    let bytes: [u8; SCHLUESSEL_BYTES] =
        klartext?.try_into().map_err(|_| SchluesselFehler::HuelleKaputt)?;
    Ok(Datenschluessel(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Absichtlich schwache Testparameter. Die echten kosten eine halbe Sekunde je
    /// Aufruf — bei einem Dutzend Tests waeren das Sekunden bei jedem Testlauf, und ein
    /// langsamer Testlauf wird seltener gefahren.
    fn schnelle_huelle(dk: &Datenschluessel, passphrase: &str) -> Huelle {
        let mut h = einwickeln(dk, passphrase).expect("einwickeln");
        // Die Parameter stehen IN der Huelle — deshalb genuegt es, sie dort zu senken und
        // neu einzuwickeln. Genau diese Eigenschaft macht spaeter auch ein Heben moeglich.
        h.kdf.m_kib = 8;
        h.kdf.t_durchgaenge = 1;
        h.kdf.p_spuren = 1;
        let salz = BASE64.decode(h.kdf.salz.as_bytes()).unwrap();
        let mut k = kek(passphrase, &salz, &h.kdf).unwrap();
        let aead = XChaCha20Poly1305::new((&k).into());
        let nonce = BASE64.decode(h.nonce.as_bytes()).unwrap();
        h.geheimtext = BASE64.encode(
            &aead.encrypt(XNonce::from_slice(&nonce), dk.bytes().as_slice()).unwrap(),
        );
        k.zeroize();
        h
    }

    #[test]
    fn ein_gewuerfelter_schluessel_ist_nicht_leer_und_nicht_zweimal_gleich() {
        let a = Datenschluessel::wuerfeln();
        let b = Datenschluessel::wuerfeln();
        assert_ne!(a.bytes(), [0u8; SCHLUESSEL_BYTES]);
        assert_ne!(a.bytes(), b.bytes());
    }

    #[test]
    fn das_pragma_traegt_die_rohschluessel_form() {
        let dk = Datenschluessel::wuerfeln();
        let p = dk.als_pragma();
        // Beide Ebenen: doppelte Anfuehrungszeichen aussen (PRAGMA nimmt eine
        // Zeichenkette, keinen Blob-Ausdruck), `x'…'` innen (Rohschluessel statt
        // Passwort). Faellt eine davon weg, verschluesselt nicht der Schluessel die
        // Datei, den wir gesichert haben — oder das Statement ist gar kein SQL.
        assert!(p.starts_with("\"x'") && p.ends_with("'\""), "{p}");
        let hex = &p[3..p.len() - 2];
        assert_eq!(hex.len(), SCHLUESSEL_BYTES * 2);
        assert!(hex.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn einwickeln_und_auswickeln_ergibt_denselben_schluessel() {
        let dk = Datenschluessel::wuerfeln();
        let h = schnelle_huelle(&dk, "ein sehr langes Kennwort");
        let zurueck = auswickeln(&h, "ein sehr langes Kennwort").expect("auswickeln");
        assert_eq!(zurueck.bytes(), dk.bytes());
    }

    #[test]
    fn mit_falscher_passphrase_geht_nichts() {
        let dk = Datenschluessel::wuerfeln();
        let h = schnelle_huelle(&dk, "richtig");
        assert_eq!(auswickeln(&h, "falsch").unwrap_err(), SchluesselFehler::PassphraseFalsch);
    }

    #[test]
    fn eine_veraenderte_huelle_faellt_auf() {
        let dk = Datenschluessel::wuerfeln();
        let mut h = schnelle_huelle(&dk, "kennwort");

        let mut roh = BASE64.decode(h.geheimtext.as_bytes()).unwrap();
        roh[0] ^= 0xff;
        h.geheimtext = BASE64.encode(&roh);

        // Dieselbe Meldung wie bei falscher Passphrase — zwei verschiedene waeren ein
        // Orakel dafuer, ob die Passphrase stimmt.
        assert_eq!(auswickeln(&h, "kennwort").unwrap_err(), SchluesselFehler::PassphraseFalsch);
    }

    #[test]
    fn zwei_huellen_derselben_passphrase_sehen_verschieden_aus() {
        let dk = Datenschluessel::wuerfeln();
        let a = einwickeln(&dk, "gleich").expect("a");
        let b = einwickeln(&dk, "gleich").expect("b");
        // Frisches Salz und frische Nonce je Huelle. Waeren sie fest, verriete ein
        // Vergleich zweier Huellen, ob dieselbe Passphrase dahintersteht.
        assert_ne!(a.kdf.salz, b.kdf.salz);
        assert_ne!(a.nonce, b.nonce);
        assert_ne!(a.geheimtext, b.geheimtext);
    }

    #[test]
    fn eine_unbekannte_fassung_wird_abgewiesen_statt_geraten() {
        let dk = Datenschluessel::wuerfeln();
        let mut h = schnelle_huelle(&dk, "kennwort");
        h.fassung = 99;
        assert_eq!(auswickeln(&h, "kennwort").unwrap_err(), SchluesselFehler::FassungUnbekannt(99));
    }

    #[test]
    fn der_wiederherstellungscode_fuehrt_zurueck() {
        let dk = Datenschluessel::wuerfeln();
        let code = dk.als_wiederherstellungscode();
        let zurueck = Datenschluessel::aus_wiederherstellungscode(&code).expect("zurueck");
        assert_eq!(zurueck.bytes(), dk.bytes());
    }

    #[test]
    fn der_code_vertraegt_alles_was_beim_abschreiben_passiert() {
        let dk = Datenschluessel::wuerfeln();
        let code = dk.als_wiederherstellungscode();

        for variante in [
            code.to_lowercase(),
            code.replace('-', ""),
            code.replace('-', " "),
            format!("  {code}  "),
            code.replace('-', "--"),
        ] {
            let zurueck = Datenschluessel::aus_wiederherstellungscode(&variante)
                .unwrap_or_else(|_| panic!("abgewiesen: {variante}"));
            assert_eq!(zurueck.bytes(), dk.bytes(), "{variante}");
        }
    }

    #[test]
    fn ein_code_mit_fehlern_wird_abgewiesen_statt_stillschweigend_falsch() {
        // Zu kurz — daraus einen Schluessel zu machen hiesse, einen falschen Bestand
        // aufzuschliessen und die Schuld beim Nutzer zu suchen.
        assert_eq!(
            Datenschluessel::aus_wiederherstellungscode("ABCD-EFGH").unwrap_err(),
            SchluesselFehler::CodeUnlesbar
        );
        assert_eq!(
            Datenschluessel::aus_wiederherstellungscode("").unwrap_err(),
            SchluesselFehler::CodeUnlesbar
        );
    }

    #[test]
    fn der_code_ist_lesbar_gruppiert() {
        let code = Datenschluessel::wuerfeln().als_wiederherstellungscode();
        assert!(code.contains('-'));
        for gruppe in code.split('-') {
            assert!(gruppe.len() <= 4, "{gruppe}");
            assert!(gruppe.chars().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit()));
        }
    }
}
