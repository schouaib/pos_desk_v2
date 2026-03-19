use obfstr::obfstr;
use sha2::{Sha256, Digest};
use ed25519_dalek::{VerifyingKey, Verifier, Signature};
use std::env;
use std::fs;
use std::net::UdpSocket;
use std::process::Command;
use tauri::Manager;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandChild;

// ─── Strong hardware fingerprint ─────────────────────────────────────

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
        .unwrap_or_default()
        .trim()
        .to_string()
}

#[cfg(target_os = "linux")]
fn get_mac_address() -> String {
    Command::new("ip")
        .args(["link", "show"])
        .output()
        .ok()
        .and_then(|o| {
            let out = String::from_utf8_lossy(&o.stdout);
            out.lines()
                .find(|l| l.contains("link/ether"))
                .and_then(|l| l.split_whitespace().nth(1))
                .map(|s| s.to_string())
        })
        .unwrap_or_default()
}

#[cfg(target_os = "linux")]
fn get_cpu_id() -> String {
    fs::read_to_string("/proc/cpuinfo")
        .unwrap_or_default()
        .lines()
        .find(|l| l.starts_with("model name"))
        .and_then(|l| l.split(':').nth(1))
        .map(|s| s.trim().to_string())
        .unwrap_or_default()
}

#[cfg(target_os = "linux")]
fn get_disk_uuid() -> String {
    Command::new("lsblk")
        .args(["-no", "UUID", "/dev/sda1"])
        .output()
        .ok()
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

#[tauri::command]
fn get_machine_id() -> String {
    compute_machine_id()
}

// Keep old fingerprint for backward compat with server activation
#[tauri::command]
fn get_fingerprint() -> String {
    let hostname = hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_default();
    let arch = env::consts::ARCH.to_string();
    let os = env::consts::OS.to_string();
    let hw_uuid = get_hardware_uuid();
    let mac = get_mac_address();
    let disk = get_disk_uuid();

    let info = format!("{}|{}|{}|{}|{}|{}", hostname, os, arch, hw_uuid, mac, disk);
    let mut hasher = Sha256::new();
    hasher.update(info.as_bytes());
    let result = hasher.finalize();
    hex::encode(&result[..16])
}

// ─── Ed25519 offline activation (same as admin-desktop) ─────────────

/// Public key from admin-keygen — can ONLY verify, never generate keys.
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

fn validate_key_offline(machine_id: &str, key: &str) -> bool {
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
    hasher.update(format!("{}{}", obfstr!("kerty-pos-aes-"), machine_id).as_bytes());
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

    // Store as: nonce (12 bytes) || ciphertext+tag
    let mut combined = Vec::with_capacity(12 + ciphertext.len());
    combined.extend_from_slice(&nonce_bytes);
    combined.extend_from_slice(&ciphertext);
    hex::encode(combined)
}

fn decrypt_from_storage(stored: &str, machine_id: &str) -> Option<String> {
    use aes_gcm::{Aes256Gcm, KeyInit, aead::Aead};
    use aes_gcm::Nonce;

    let combined = hex::decode(stored.trim()).ok()?;
    if combined.len() < 13 { return None; } // nonce (12) + at least 1 byte

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
fn get_lan_ip() -> String {
    if let Ok(socket) = UdpSocket::bind("0.0.0.0:0") {
        if socket.connect("8.8.8.8:80").is_ok() {
            if let Ok(addr) = socket.local_addr() {
                return addr.ip().to_string();
            }
        }
    }
    "127.0.0.1".to_string()
}

#[tauri::command]
fn activate(app: tauri::AppHandle, key: String) -> Result<bool, String> {
    // Rate limiting
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
    if validate_key_offline(&machine_id, &key) {
        // Reset attempts on success
        if let Ok(mut state) = ACTIVATION_ATTEMPTS.lock() {
            state.0 = 0;
            state.1 = None;
        }

        // Save encrypted activation key
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
                Some(key) => validate_key_offline(&machine_id, &key),
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

// ─── Server management ──────────────────────────────────────────────

fn get_db_path(app: &tauri::AppHandle) -> Result<String, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = data_dir.join("db");
    fs::create_dir_all(&db_path).map_err(|e| format!("Failed to create db directory: {}", e))?;

    // Use forward slashes — mongod on Windows handles them fine and avoids escaping issues
    let path_str = db_path.to_string_lossy().replace('\\', "/");
    Ok(path_str)
}

/// Clean up stale mongod.lock before starting mongod.
/// If the app was force-closed or crashed, mongod.lock may still exist and block startup.
fn cleanup_stale_lock(db_path: &str) {
    let lock_path = std::path::Path::new(db_path).join("mongod.lock");
    if lock_path.exists() {
        // Try to read the lock file — if it contains a PID, check if that process is still running
        if let Ok(content) = fs::read_to_string(&lock_path) {
            let pid_str = content.trim();
            if pid_str.is_empty() {
                return; // Empty lock file means clean shutdown, nothing to do
            }
            // Check if the process is still alive
            #[cfg(target_os = "windows")]
            {
                let still_running = std::process::Command::new("tasklist")
                    .args(["/FI", &format!("PID eq {}", pid_str), "/NH"])
                    .output()
                    .map(|o| {
                        let out = String::from_utf8_lossy(&o.stdout);
                        out.contains(pid_str) && out.to_lowercase().contains("mongod")
                    })
                    .unwrap_or(false);

                if !still_running {
                    log::info!("Removing stale mongod.lock (PID {} is no longer running)", pid_str);
                    let _ = fs::remove_file(&lock_path);
                }
            }
            #[cfg(not(target_os = "windows"))]
            {
                if let Ok(pid) = pid_str.parse::<i32>() {
                    // Signal 0 checks if process exists without sending a signal
                    let still_running = unsafe { libc::kill(pid, 0) == 0 };
                    if !still_running {
                        log::info!("Removing stale mongod.lock (PID {} is no longer running)", pid);
                        let _ = fs::remove_file(&lock_path);
                    }
                }
            }
        }
    }
}

/// Get the log path for mongod (helps debug startup failures)
fn get_mongod_log_path(app: &tauri::AppHandle) -> Result<String, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let log_path = data_dir.join("mongod.log");
    Ok(log_path.to_string_lossy().replace('\\', "/"))
}

#[tauri::command]
fn start_server(app: tauri::AppHandle) -> Result<String, String> {
    if let Some(state) = app.try_state::<Processes>() {
        let guard = state.0.lock().map_err(|e| e.to_string())?;
        if guard.server.is_some() {
            return Ok("already_running".to_string());
        }
    }

    let db_path = get_db_path(&app)?;
    let log_path = get_mongod_log_path(&app)?;

    // Clean up stale lock file from previous unclean shutdown
    cleanup_stale_lock(&db_path);

    let mongod = app.shell()
        .sidecar("mongod")
        .map_err(|e| format!("mongod binary not found: {}", e))?
        .args([
            "--dbpath", &db_path,
            "--port", "27017",
            "--bind_ip", "127.0.0.1",
            "--wiredTigerCacheSizeGB", "0.45",
            "--logpath", &log_path,
            "--logappend",
        ])
        .spawn()
        .map_err(|e| format!("failed to start mongod: {}", e))?;

    // Save mongod process immediately
    if let Some(state) = app.try_state::<Processes>() {
        let mut guard = state.0.lock().map_err(|e| e.to_string())?;
        guard.mongod = Some(mongod.1);
    }

    // Start Go server in background after mongod has time to init — doesn't block UI
    std::thread::spawn({
        let app = app.clone();
        move || {
            std::thread::sleep(std::time::Duration::from_secs(3));
            if let Ok(server) = app.shell()
                .sidecar("server")
                .and_then(|cmd| cmd.spawn())
            {
                if let Some(state) = app.try_state::<Processes>() {
                    if let Ok(mut guard) = state.0.lock() {
                        guard.server = Some(server.1);
                    }
                }
            }
        }
    });

    Ok("started".to_string())
}

/// Read mongod log for debugging startup failures
#[tauri::command]
fn get_mongod_log(app: tauri::AppHandle) -> Result<String, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let log_path = data_dir.join("mongod.log");
    let content = std::fs::read_to_string(&log_path).unwrap_or_default();
    // Return last 50 lines
    let lines: Vec<&str> = content.lines().collect();
    let start = if lines.len() > 50 { lines.len() - 50 } else { 0 };
    Ok(lines[start..].join("\n"))
}

#[tauri::command]
fn stop_server(app: tauri::AppHandle) -> Result<String, String> {
    if let Some(state) = app.try_state::<Processes>() {
        let mut guard = state.0.lock().map_err(|e| e.to_string())?;
        if let Some(child) = guard.server.take() {
            let _ = child.kill();
        }
        if let Some(child) = guard.mongod.take() {
            let _ = child.kill();
        }
    }
    Ok("stopped".to_string())
}

struct ProcessState {
    mongod: Option<CommandChild>,
    server: Option<CommandChild>,
}

struct Processes(std::sync::Mutex<ProcessState>);

// ─── App entry ──────────────────────────────────────────────────────

// ─── Native printer support ─────────────────────────────────────────

#[derive(serde::Serialize)]
struct PrinterList {
    printers: Vec<String>,
    default: Option<String>,
}

#[tauri::command]
fn list_printers() -> Result<PrinterList, String> {
    list_printers_impl()
}

#[cfg(not(target_os = "windows"))]
fn list_printers_impl() -> Result<PrinterList, String> {
    let output = std::process::Command::new("lpstat")
        .arg("-p")
        .output()
        .map_err(|e| format!("Failed to run lpstat: {}", e))?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let printers: Vec<String> = stdout
        .lines()
        .filter_map(|line| {
            if line.starts_with("printer ") {
                line.split_whitespace().nth(1).map(|s| s.to_string())
            } else {
                None
            }
        })
        .collect();

    let default_output = std::process::Command::new("lpstat")
        .arg("-d")
        .output()
        .ok();
    let default = default_output.and_then(|o| {
        let s = String::from_utf8_lossy(&o.stdout);
        s.lines()
            .find_map(|l| l.split(": ").nth(1).map(|s| s.trim().to_string()))
    });

    Ok(PrinterList { printers, default })
}

#[cfg(target_os = "windows")]
fn list_printers_impl() -> Result<PrinterList, String> {
    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", "Get-Printer | Select-Object -ExpandProperty Name"])
        .output()
        .map_err(|e| format!("Failed to list printers: {}", e))?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let printers: Vec<String> = stdout
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect();

    let def_output = std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            "(Get-CimInstance -ClassName Win32_Printer | Where-Object {$_.Default}).Name",
        ])
        .output()
        .ok();
    let default = def_output.and_then(|o| {
        let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
        if s.is_empty() { None } else { Some(s) }
    });

    Ok(PrinterList { printers, default })
}

#[tauri::command]
fn print_raw(printer: String, data: Vec<u8>) -> Result<(), String> {
    print_raw_impl(&printer, &data)
}

#[cfg(not(target_os = "windows"))]
fn print_raw_impl(printer: &str, data: &[u8]) -> Result<(), String> {
    use std::io::Write;
    use std::process::Stdio;

    let mut child = std::process::Command::new("lp")
        .args(["-d", printer, "-o", "raw"])
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start lp: {}", e))?;

    child
        .stdin
        .take()
        .unwrap()
        .write_all(data)
        .map_err(|e| format!("Failed to write to lp: {}", e))?;

    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("lp failed: {}", stderr));
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn print_raw_impl(printer: &str, data: &[u8]) -> Result<(), String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use std::ptr;

    #[repr(C)]
    struct DocInfo1W {
        document_name: *const u16,
        output_file: *const u16,
        datatype: *const u16,
    }

    #[link(name = "winspool")]
    extern "system" {
        fn OpenPrinterW(name: *const u16, handle: *mut isize, default: *const u8) -> i32;
        fn StartDocPrinterW(handle: isize, level: u32, doc_info: *const DocInfo1W) -> u32;
        fn StartPagePrinter(handle: isize) -> i32;
        fn WritePrinter(handle: isize, buf: *const u8, count: u32, written: *mut u32) -> i32;
        fn EndPagePrinter(handle: isize) -> i32;
        fn EndDocPrinter(handle: isize) -> i32;
        fn ClosePrinter(handle: isize) -> i32;
    }

    fn to_wide(s: &str) -> Vec<u16> {
        OsStr::new(s)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect()
    }

    unsafe {
        let printer_w = to_wide(printer);
        let mut handle: isize = 0;
        if OpenPrinterW(printer_w.as_ptr(), &mut handle, ptr::null()) == 0 {
            return Err(format!("Cannot open printer '{}'", printer));
        }

        let doc_name = to_wide("POS Receipt");
        let datatype = to_wide("RAW");
        let doc_info = DocInfo1W {
            document_name: doc_name.as_ptr(),
            output_file: ptr::null(),
            datatype: datatype.as_ptr(),
        };

        if StartDocPrinterW(handle, 1, &doc_info) == 0 {
            ClosePrinter(handle);
            return Err("StartDocPrinter failed".to_string());
        }

        if StartPagePrinter(handle) == 0 {
            EndDocPrinter(handle);
            ClosePrinter(handle);
            return Err("StartPagePrinter failed".to_string());
        }

        let mut written: u32 = 0;
        let ok = WritePrinter(handle, data.as_ptr(), data.len() as u32, &mut written);

        EndPagePrinter(handle);
        EndDocPrinter(handle);
        ClosePrinter(handle);

        if ok == 0 {
            return Err("WritePrinter failed".to_string());
        }
        Ok(())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_shell::init())
        .manage(Processes(std::sync::Mutex::new(ProcessState {
            mongod: None,
            server: None,
        })))
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
            get_fingerprint,
            get_machine_id,
            get_app_version,
            get_lan_ip,
            activate,
            check_activation,
            get_stored_activation_key,
            start_server,
            stop_server,
            get_mongod_log,
            list_printers,
            print_raw,
        ])
        .build(tauri::generate_context!())
        .expect("error")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(state) = app.try_state::<Processes>() {
                    if let Ok(mut guard) = state.0.lock() {
                        if let Some(child) = guard.server.take() {
                            let _ = child.kill();
                        }
                        if let Some(child) = guard.mongod.take() {
                            let _ = child.kill();
                        }
                    }
                }
            }
        });
}
