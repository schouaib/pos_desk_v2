use sha2::{Sha256, Digest};
use ed25519_dalek::{VerifyingKey, Verifier, Signature};
#[cfg(target_os = "linux")]
use std::fs;
use std::process::Command;
use tauri::Manager;
use obfstr::obfstr;

// ─── Platform-specific hardware fingerprint (macOS) ─────────────────

#[cfg(target_os = "macos")]
fn get_hardware_uuid() -> String {
    Command::new(obfstr!("ioreg"))
        .args([obfstr!("-rd1"), obfstr!("-c"), obfstr!("IOPlatformExpertDevice")])
        .output()
        .ok()
        .and_then(|o| {
            let out = String::from_utf8_lossy(&o.stdout);
            out.lines()
                .find(|l| l.contains(obfstr!("IOPlatformUUID")))
                .and_then(|l| l.split('"').nth(3))
                .map(|s| s.to_string())
        })
        .unwrap_or_default()
}

#[cfg(target_os = "macos")]
fn get_mac_address() -> String {
    Command::new(obfstr!("ifconfig"))
        .arg(obfstr!("en0"))
        .output()
        .ok()
        .and_then(|o| {
            let out = String::from_utf8_lossy(&o.stdout);
            out.lines()
                .find(|l| l.contains(obfstr!("ether")))
                .and_then(|l| l.split_whitespace().nth(1))
                .map(|s| s.to_string())
        })
        .unwrap_or_default()
}

#[cfg(target_os = "macos")]
fn get_cpu_id() -> String {
    Command::new(obfstr!("sysctl"))
        .arg(obfstr!("-n"))
        .arg(obfstr!("machdep.cpu.brand_string"))
        .output()
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_default()
}

#[cfg(target_os = "macos")]
fn get_disk_uuid() -> String {
    Command::new(obfstr!("diskutil"))
        .args([obfstr!("info"), obfstr!("/")])
        .output()
        .ok()
        .and_then(|o| {
            let out = String::from_utf8_lossy(&o.stdout);
            out.lines()
                .find(|l| {
                    l.contains(obfstr!("Volume UUID"))
                        || l.contains(obfstr!("Disk / Partition UUID"))
                })
                .and_then(|l| l.split(':').nth(1))
                .map(|s| s.trim().to_string())
        })
        .unwrap_or_default()
}

// ─── Platform-specific hardware fingerprint (Windows) ───────────────
// Uses registry reads instead of wmic for instant results

#[cfg(target_os = "windows")]
fn get_hardware_uuid() -> String {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;
    RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey(obfstr!(r"SOFTWARE\Microsoft\Cryptography"))
        .and_then(|key| key.get_value::<String, _>(obfstr!("MachineGuid")))
        .unwrap_or_default()
}

#[cfg(target_os = "windows")]
fn get_mac_address() -> String {
    // Use BIOS serial number as stable identifier — registry NetworkCards
    // enumeration order is non-deterministic and changes across reboots,
    // which caused the machine ID (and thus activation) to become invalid.
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;
    RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey(obfstr!(r"HARDWARE\DESCRIPTION\System\BIOS"))
        .and_then(|key| key.get_value::<String, _>(obfstr!("BaseBoardProduct")))
        .unwrap_or_default()
}

#[cfg(target_os = "windows")]
fn get_cpu_id() -> String {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;
    RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey(obfstr!(r"HARDWARE\DESCRIPTION\System\CentralProcessor\0"))
        .and_then(|key| key.get_value::<String, _>(obfstr!("ProcessorNameString")))
        .unwrap_or_default()
}

#[cfg(target_os = "windows")]
fn get_disk_uuid() -> String {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;
    RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey(obfstr!(r"SOFTWARE\Microsoft\Windows NT\CurrentVersion"))
        .and_then(|key| key.get_value::<String, _>(obfstr!("ProductId")))
        .unwrap_or_default()
}

// ─── Platform-specific hardware fingerprint (Linux) ─────────────────

#[cfg(target_os = "linux")]
fn get_hardware_uuid() -> String {
    fs::read_to_string("/sys/class/dmi/id/product_uuid")
        .unwrap_or_default().trim().to_string()
}

#[cfg(target_os = "linux")]
fn get_mac_address() -> String {
    Command::new("ip").args(["link", "show"]).output().ok()
        .and_then(|o| {
            let out = String::from_utf8_lossy(&o.stdout);
            out.lines().find(|l| l.contains("link/ether"))
                .and_then(|l| l.split_whitespace().nth(1))
                .map(|s| s.to_string())
        })
        .unwrap_or_default()
}

#[cfg(target_os = "linux")]
fn get_cpu_id() -> String {
    fs::read_to_string("/proc/cpuinfo").unwrap_or_default()
        .lines().find(|l| l.starts_with("model name"))
        .and_then(|l| l.split(':').nth(1))
        .map(|s| s.trim().to_string())
        .unwrap_or_default()
}

#[cfg(target_os = "linux")]
fn get_disk_uuid() -> String {
    Command::new("lsblk").args(["-no", "UUID", "/dev/sda1"]).output().ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_default()
}

// ─── Machine ID (cached — computed once, reused) ────────────────────

static CACHED_MACHINE_ID: std::sync::OnceLock<String> = std::sync::OnceLock::new();

fn compute_machine_id() -> String {
    CACHED_MACHINE_ID.get_or_init(|| {
        let hw_uuid = get_hardware_uuid();
        let mac = get_mac_address();
        let cpu = get_cpu_id();
        let disk = get_disk_uuid();

        let raw = format!("{}|{}|{}|{}", hw_uuid, mac, cpu, disk);
        let mut hasher = Sha256::new();
        hasher.update(raw.as_bytes());
        let hash = hasher.finalize();
        let full = hex::encode(&hash[..16]);
        format!(
            "{}-{}-{}-{}",
            &full[0..8],
            &full[8..16],
            &full[16..24],
            &full[24..32]
        )
    }).clone()
}

// ─── Ed25519 signature verification ─────────────────────────────────

fn get_public_key() -> Result<VerifyingKey, String> {
    let pk_hex = obfstr!("3e3ce7e1af68e01eadbb9af7f45cee360efefa84deb7da65eb47049d0c26b283").to_string();
    let pub_bytes = hex::decode(&pk_hex)
        .map_err(|_| "Verification error".to_string())?;
    let key_array: [u8; 32] = pub_bytes
        .try_into()
        .map_err(|_| "Verification error".to_string())?;
    VerifyingKey::from_bytes(&key_array)
        .map_err(|_| "Verification error".to_string())
}

fn validate_key(machine_id: &str, key: &str) -> bool {
    let public_key = match get_public_key() {
        Ok(pk) => pk,
        Err(_) => return false,
    };
    let hex_str = key.trim().replace('-', "").to_lowercase();
    let sig_bytes = match hex::decode(&hex_str) {
        Ok(b) => b,
        Err(_) => return false,
    };
    let sig_array: [u8; 64] = match sig_bytes.try_into() {
        Ok(a) => a,
        Err(_) => return false,
    };
    let signature = Signature::from_bytes(&sig_array);
    public_key.verify(machine_id.as_bytes(), &signature).is_ok()
}

// ─── AES-256-GCM activation storage ─────────────────────────────────

fn derive_storage_key(machine_id: &str) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(format!("{}{}", obfstr!("kerty-admin-aes-"), machine_id).as_bytes());
    hasher.finalize().into()
}

fn encrypt_for_storage(key: &str, machine_id: &str) -> String {
    use aes_gcm::{Aes256Gcm, KeyInit, aead::Aead};
    use aes_gcm::Nonce;
    use rand::RngCore;

    let aes_key = derive_storage_key(machine_id);
    let cipher = Aes256Gcm::new_from_slice(&aes_key).unwrap();

    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher.encrypt(nonce, key.as_bytes()).unwrap();

    let mut combined = Vec::with_capacity(12 + ciphertext.len());
    combined.extend_from_slice(&nonce_bytes);
    combined.extend_from_slice(&ciphertext);
    hex::encode(combined)
}

fn decrypt_from_storage(stored: &str, machine_id: &str) -> Option<String> {
    use aes_gcm::{Aes256Gcm, KeyInit, aead::Aead};
    use aes_gcm::Nonce;

    let combined = hex::decode(stored.trim()).ok()?;
    if combined.len() < 13 { return None; }

    let (nonce_bytes, ciphertext) = combined.split_at(12);
    let aes_key = derive_storage_key(machine_id);
    let cipher = Aes256Gcm::new_from_slice(&aes_key).ok()?;
    let nonce = Nonce::from_slice(nonce_bytes);

    let plaintext = cipher.decrypt(nonce, ciphertext).ok()?;
    String::from_utf8(plaintext).ok()
}

fn write_secure_file(path: &std::path::Path, data: &[u8]) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        use std::io::Write;
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(path)
            .map_err(|e| e.to_string())?;
        file.write_all(data).map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(not(unix))]
    {
        std::fs::write(path, data).map_err(|e| e.to_string())
    }
}

// ─── Rate limiting ──────────────────────────────────────────────────

static ACTIVATION_ATTEMPTS: std::sync::Mutex<(u32, Option<std::time::Instant>)> =
    std::sync::Mutex::new((0, None));

const MAX_ATTEMPTS: u32 = 5;
const LOCKOUT_SECS: u64 = 60;

// ─── Tauri commands ─────────────────────────────────────────────────

#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
fn get_machine_id() -> String {
    compute_machine_id()
}

#[tauri::command]
fn activate(app: tauri::AppHandle, key: String) -> Result<bool, String> {
    {
        let mut state = ACTIVATION_ATTEMPTS.lock().map_err(|e| e.to_string())?;
        if let Some(locked_at) = state.1 {
            if locked_at.elapsed().as_secs() < LOCKOUT_SECS {
                return Err(obfstr!("Rate limited").to_string());
            } else {
                state.0 = 0;
                state.1 = None;
            }
        }
        state.0 += 1;
        if state.0 >= MAX_ATTEMPTS {
            state.1 = Some(std::time::Instant::now());
            return Err(obfstr!("Rate limited").to_string());
        }
    }

    let machine_id = compute_machine_id();
    if validate_key(&machine_id, &key) {
        if let Ok(mut state) = ACTIVATION_ATTEMPTS.lock() {
            state.0 = 0;
            state.1 = None;
        }

        let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
        std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
        let activation_file = data_dir.join(obfstr!("activation.key"));

        let encrypted = encrypt_for_storage(&key, &machine_id);
        write_secure_file(&activation_file, encrypted.as_bytes())?;

        Ok(true)
    } else {
        Ok(false)
    }
}

#[tauri::command]
fn check_activation(app: tauri::AppHandle) -> bool {
    let machine_id = compute_machine_id();
    let data_dir = match app.path().app_data_dir() {
        Ok(d) => d,
        Err(_) => return false,
    };
    let activation_file = data_dir.join(obfstr!("activation.key"));
    match std::fs::read_to_string(&activation_file) {
        Ok(stored) => {
            match decrypt_from_storage(&stored, &machine_id) {
                Some(key) => validate_key(&machine_id, &key),
                None => false,
            }
        }
        Err(_) => false,
    }
}

#[tauri::command]
fn get_stored_activation_key(app: tauri::AppHandle) -> Result<String, String> {
    let machine_id = compute_machine_id();
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let activation_file = data_dir.join(obfstr!("activation.key"));
    let stored = std::fs::read_to_string(&activation_file).map_err(|e| e.to_string())?;
    decrypt_from_storage(&stored, &machine_id).ok_or_else(|| "decrypt failed".to_string())
}

// ─── App entry ──────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_app_version,
            get_machine_id,
            activate,
            check_activation,
            get_stored_activation_key,
        ])
        .run(tauri::generate_context!())
        .expect("error");
}
