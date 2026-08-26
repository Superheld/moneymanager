// Wer die Datenbank lesen darf — auf Dateisystemebene, nicht erst in der App.
//
// **Warum es das gibt.** Der Bestand entstand bisher mit den Standardrechten des
// Prozesses (`-rw-r--r--`): jeder zweite Account auf derselben Maschine konnte ihn
// öffnen. Solange es genau einen Nutzer auf genau einer Maschine gab, war das eine
// Fussnote. Veröffentlicht weiss niemand, wer sonst an dem Rechner sitzt — und eine
// Haushalts-App läuft fast per Definition auf einem geteilten Gerät.
//
// **Zwei Massnahmen, und die erste ist die wichtigere.** Ein `chmod` auf die vorhandene
// Datei allein greift zu kurz: SQLite legt `-wal` und `-shm` bei jedem Öffnen neu an,
// wenn sie fehlen, und sie entstünden wieder offen. Die `umask` setzt deshalb die
// Standardrechte des GANZEN Prozesses, bevor irgendetwas eine Datei anlegt; das `chmod`
// räumt nur noch auf, was vor dieser Änderung entstanden ist.
//
// **Auf Windows greift beides nicht.** Dort gibt es weder `umask` noch POSIX-Modi;
// den Fall deckt die Rechteverwaltung des Nutzerprofils ab. Das ist eine bewusste
// Lücke und kein Vergessen — deshalb steht sie hier und nicht nur im Ticket.

use std::path::Path;

/// Die Standardrechte des Prozesses einschränken. **Muss vor allem anderen laufen**,
/// insbesondere vor dem Start des SQL-Plugins — was vorher angelegt wird, entsteht offen.
#[cfg(unix)]
pub fn standardrechte_einschraenken() {
    // SAFETY: `umask` ändert nur den Rechte-Standard dieses Prozesses, greift auf keinen
    // Speicher zu und kann nicht fehlschlagen. Der zurückgegebene alte Wert interessiert
    // nicht — wir setzen ihn nie zurück.
    unsafe {
        libc::umask(0o077);
    }
}

#[cfg(not(unix))]
pub fn standardrechte_einschraenken() {}

/// Vorhandene Datenbankdateien im App-Datenverzeichnis auf 0600 ziehen.
///
/// Erfasst absichtlich alles mit `.db` im Namen, nicht nur die Endung: daneben liegen
/// `-wal` und `-shm`, und aus Migrationsproben stammen Kopien wie `…​.db.bak-<datum>`.
/// Genau die werden sonst vergessen — sie überleben jedes Zurücksetzen des Bestands.
///
/// Gibt zurück, wie viele Dateien geändert wurden. Ein Fehler an einer einzelnen Datei
/// bricht den Lauf **nicht** ab: die App muss auch dann starten, wenn eine fremde Datei
/// im Verzeichnis liegt, an der wir nichts ändern dürfen.
#[cfg(unix)]
pub fn bestand_absichern(verzeichnis: &Path) -> usize {
    use std::fs;
    use std::os::unix::fs::PermissionsExt;

    let Ok(eintraege) = fs::read_dir(verzeichnis) else {
        return 0;
    };

    let mut geaendert = 0;
    for eintrag in eintraege.flatten() {
        let pfad = eintrag.path();
        if !eintrag.file_name().to_string_lossy().contains(".db") {
            continue;
        }
        let Ok(meta) = fs::metadata(&pfad) else { continue };
        if !meta.is_file() || meta.permissions().mode() & 0o777 == 0o600 {
            continue;
        }
        if fs::set_permissions(&pfad, fs::Permissions::from_mode(0o600)).is_ok() {
            geaendert += 1;
        }
    }
    geaendert
}

#[cfg(not(unix))]
pub fn bestand_absichern(_verzeichnis: &Path) -> usize {
    0
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::fs;
    use std::os::unix::fs::PermissionsExt;

    /// Ein eigenes Verzeichnis je Testfall — die Tests laufen nebenläufig.
    fn testverzeichnis(name: &str) -> std::path::PathBuf {
        let pfad = std::env::temp_dir().join(format!("moneymanager-rechte-{name}"));
        let _ = fs::remove_dir_all(&pfad);
        fs::create_dir_all(&pfad).expect("Testverzeichnis anlegen");
        pfad
    }

    fn anlegen(verzeichnis: &Path, name: &str, modus: u32) -> std::path::PathBuf {
        let pfad = verzeichnis.join(name);
        fs::write(&pfad, b"x").expect("Testdatei schreiben");
        fs::set_permissions(&pfad, fs::Permissions::from_mode(modus)).expect("Modus setzen");
        pfad
    }

    fn modus(pfad: &Path) -> u32 {
        fs::metadata(pfad).expect("Metadaten").permissions().mode() & 0o777
    }

    #[test]
    fn zieht_datenbank_und_beidateien_auf_0600() {
        let dir = testverzeichnis("beidateien");
        let db = anlegen(&dir, "moneymanager.db", 0o644);
        let wal = anlegen(&dir, "moneymanager.db-wal", 0o644);
        let shm = anlegen(&dir, "moneymanager.db-shm", 0o644);

        assert_eq!(bestand_absichern(&dir), 3);
        assert_eq!(modus(&db), 0o600);
        assert_eq!(modus(&wal), 0o600);
        assert_eq!(modus(&shm), 0o600);
    }

    #[test]
    fn erfasst_auch_die_kopien_aus_migrationsproben() {
        let dir = testverzeichnis("kopien");
        let kopie = anlegen(&dir, "moneymanager.db.bak-20260101-120000", 0o644);
        let spielstand = anlegen(&dir, "moneymanager-dev.db", 0o644);

        assert_eq!(bestand_absichern(&dir), 2);
        assert_eq!(modus(&kopie), 0o600);
        assert_eq!(modus(&spielstand), 0o600);
    }

    #[test]
    fn laesst_fremde_dateien_in_ruhe() {
        let dir = testverzeichnis("fremd");
        let fremd = anlegen(&dir, "einstellungen.json", 0o644);

        assert_eq!(bestand_absichern(&dir), 0);
        assert_eq!(modus(&fremd), 0o644);
    }

    #[test]
    fn zaehlt_nur_was_es_tatsaechlich_geaendert_hat() {
        let dir = testverzeichnis("idempotent");
        anlegen(&dir, "moneymanager.db", 0o600);

        assert_eq!(bestand_absichern(&dir), 0, "schon eng — nichts zu tun");
    }

    #[test]
    fn ein_fehlendes_verzeichnis_ist_kein_fehler() {
        let dir = std::env::temp_dir().join("moneymanager-rechte-gibtsnicht");
        let _ = std::fs::remove_dir_all(&dir);

        assert_eq!(bestand_absichern(&dir), 0);
    }
}
