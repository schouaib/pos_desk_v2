use obfstr::obfstr;
use sha2::{Sha256, Digest};
use hmac::{Hmac, Mac};
use ed25519_dalek::{VerifyingKey, Verifier, Signature};
use std::env;
use std::fs;
use std::process::Command;
use std::net::UdpSocket;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use tauri::Manager;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandChild;

type HmacSha256 = Hmac<Sha256>;

// ─── Custom MongoDB port (non-default for security) ─────────────────
const MONGO_PORT: &str = "27099";

// ─── Tamper flag — once set, app refuses to function ────────────────
static TAMPERED: AtomicBool = AtomicBool::new(false);
// Monotonic counter — each integrity check increments; if it stops, something was patched
static INTEGRITY_COUNTER: AtomicU64 = AtomicU64::new(0);

fn mark_tampered() {
    TAMPERED.store(true, Ordering::SeqCst);
}

fn is_tampered() -> bool {
    TAMPERED.load(Ordering::SeqCst)
}

// ═══════════════════════════════════════════════════════════════════════
//  LAYER 1: Anti-Debug Detection
// ═══════════════════════════════════════════════════════════════════════

#[cfg(target_os = "macos")]
fn detect_debugger() -> bool {
    use std::mem;
    // Check sysctl for P_TRACED flag (most reliable on macOS)
    #[repr(C)]
    #[allow(non_camel_case_types)]
    struct kinfo_proc {
        _opaque: [u8; 648],
    }
    extern "C" {
        fn sysctl(
            name: *const i32, namelen: u32,
            oldp: *mut u8, oldlenp: *mut usize,
            newp: *const u8, newlen: usize,
        ) -> i32;
    }
    let mut info: kinfo_proc = unsafe { mem::zeroed() };
    let mut size = mem::size_of::<kinfo_proc>();
    let mib: [i32; 4] = [1 /* CTL_KERN */, 14 /* KERN_PROC */, 1 /* KERN_PROC_PID */, std::process::id() as i32];
    let ret = unsafe {
        sysctl(mib.as_ptr(), 4, &mut info as *mut _ as *mut u8, &mut size, std::ptr::null(), 0)
    };
    if ret == 0 {
        // p_flag is at offset 32 in kp_proc, P_TRACED = 0x00000800
        let p_flag = unsafe { *(((&info as *const _ as *const u8).add(32)) as *const u32) };
        if p_flag & 0x800 != 0 {
            return true;
        }
    }

    // Check for common debugger environment variables
    for var in [obfstr!("DYLD_INSERT_LIBRARIES"), obfstr!("MallocStackLogging")] {
        if env::var(var).is_ok() {
            return true;
        }
    }

    // Check parent process — if it's lldb/gdb, we're being debugged
    if let Ok(output) = Command::new("ps").args(["-p", &format!("{}", unsafe { libc::getppid() }), "-o", "comm="]).output() {
        let parent = String::from_utf8_lossy(&output.stdout).trim().to_lowercase().to_string();
        for dbg in [obfstr!("lldb"), obfstr!("gdb"), obfstr!("ida"), obfstr!("frida"), obfstr!("radare"), obfstr!("ghidra")] {
            if parent.contains(dbg) {
                return true;
            }
        }
    }

    false
}

#[cfg(target_os = "windows")]
fn detect_debugger() -> bool {
    // IsDebuggerPresent — kernel32
    extern "system" {
        fn IsDebuggerPresent() -> i32;
        fn CheckRemoteDebuggerPresent(process: isize, debugger_present: *mut i32) -> i32;
    }
    unsafe {
        if IsDebuggerPresent() != 0 {
            return true;
        }
        let mut remote: i32 = 0;
        CheckRemoteDebuggerPresent(-1isize /* current process */, &mut remote);
        if remote != 0 {
            return true;
        }
    }

    // Check for debugger processes
    if let Ok(output) = Command::new("tasklist")
        .args(["/NH", "/FO", "CSV"])
        .creation_flags(0x08000000)
        .output()
    {
        let list = String::from_utf8_lossy(&output.stdout).to_lowercase();
        for name in [
            obfstr!("x64dbg"), obfstr!("x32dbg"), obfstr!("ollydbg"),
            obfstr!("ida64"), obfstr!("ida.exe"), obfstr!("idag"),
            obfstr!("ghidra"), obfstr!("frida"), obfstr!("cheatengine"),
            obfstr!("httpdebuggerpro"), obfstr!("fiddler"),
            obfstr!("wireshark"), obfstr!("processhacker"),
        ] {
            if list.contains(name) {
                return true;
            }
        }
    }
    false
}

#[cfg(target_os = "linux")]
fn detect_debugger() -> bool {
    // Check TracerPid in /proc/self/status
    if let Ok(status) = fs::read_to_string("/proc/self/status") {
        for line in status.lines() {
            if line.starts_with("TracerPid:") {
                if let Some(pid) = line.split(':').nth(1) {
                    if pid.trim() != "0" {
                        return true;
                    }
                }
            }
        }
    }
    // Check LD_PRELOAD (common hooking technique)
    if env::var(obfstr!("LD_PRELOAD")).is_ok() {
        return true;
    }
    false
}

// ═══════════════════════════════════════════════════════════════════════
//  LAYER 2: Environment Integrity (detect sandbox/hook/VM when suspicious)
// ═══════════════════════════════════════════════════════════════════════

fn check_environment_integrity() -> bool {
    // Verify our own binary hasn't been replaced with a debugger wrapper
    let exe = match env::current_exe() {
        Ok(p) => p,
        Err(_) => return false,
    };
    if !exe.exists() {
        return false;
    }

    // Check that critical system commands exist (anti-sandbox)
    #[cfg(target_os = "macos")]
    {
        for cmd in ["/usr/sbin/ioreg", "/sbin/ifconfig", "/usr/sbin/sysctl"] {
            if !std::path::Path::new(cmd).exists() {
                return false; // sandbox or stripped environment
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        // Check for known analysis sandbox artifacts
        let suspicious_files = [
            obfstr!(r"C:\windows\system32\drivers\VBoxMouse.sys"),
            obfstr!(r"C:\windows\system32\drivers\vmhgfs.sys"),
        ];
        let mut vm_count = 0;
        for f in &suspicious_files {
            if std::path::Path::new(f).exists() {
                vm_count += 1;
            }
        }
        // If BOTH VM artifacts found AND a debugger is detected, likely analysis environment
        if vm_count >= 2 && detect_debugger() {
            return false;
        }
    }

    true
}

// ═══════════════════════════════════════════════════════════════════════
//  LAYER 3: Timing-Based Integrity (detect breakpoints & patches)
// ═══════════════════════════════════════════════════════════════════════

/// Run a timed verification — if the function takes too long, someone is stepping through
fn timed_verify<F: FnOnce() -> bool>(f: F, max_ms: u128) -> bool {
    let start = std::time::Instant::now();
    let result = f();
    let elapsed = start.elapsed().as_millis();
    // If verification took way too long, likely being debugged/stepped
    if elapsed > max_ms {
        mark_tampered();
        return false;
    }
    result
}

// ═══════════════════════════════════════════════════════════════════════
//  LAYER 4: Binary Self-Integrity Check
// ═══════════════════════════════════════════════════════════════════════

/// Compute a hash of our own binary — changes if binary is patched
fn compute_binary_hash() -> Option<[u8; 32]> {
    let exe_path = env::current_exe().ok()?;
    let data = fs::read(&exe_path).ok()?;
    let mut hasher = Sha256::new();
    hasher.update(&data);
    Some(hasher.finalize().into())
}

static ORIGINAL_BINARY_HASH: std::sync::OnceLock<Option<[u8; 32]>> = std::sync::OnceLock::new();

fn init_binary_hash() {
    ORIGINAL_BINARY_HASH.get_or_init(|| compute_binary_hash());
}

fn verify_binary_integrity() -> bool {
    let original = match ORIGINAL_BINARY_HASH.get() {
        Some(Some(h)) => h,
        _ => return true, // First run, hash not yet computed
    };
    match compute_binary_hash() {
        Some(current) => {
            if &current != original {
                mark_tampered();
                false
            } else {
                true
            }
        }
        None => {
            // Can't read own binary — suspicious
            mark_tampered();
            false
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════
//  Hardware Fingerprint (platform-specific)
// ═══════════════════════════════════════════════════════════════════════

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

// ─── Windows ─────────────────────────────────────────────────────────

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

// ─── Linux ───────────────────────────────────────────────────────────

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
fn get_machine_id() -> Result<String, String> {
    guard_tamper()?;
    Ok(compute_machine_id())
}

// Keep old fingerprint for backward compat with server activation
#[tauri::command]
fn get_fingerprint() -> Result<String, String> {
    guard_tamper()?;
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
    Ok(hex::encode(&result[..16]))
}

// ═══════════════════════════════════════════════════════════════════════
//  Ed25519 Offline Activation (hardened)
// ═══════════════════════════════════════════════════════════════════════

/// Public keys from admin-keygen — can ONLY verify, never generate keys.
/// Split into computed form to resist static string extraction.
fn get_public_keys() -> Vec<VerifyingKey> {
    // Keys are XOR-masked at compile time via obfstr, then decoded at runtime
    let pk_hexes = [
        obfstr!("3e3ce7e1af68e01eadbb9af7f45cee360efefa84deb7da65eb47049d0c26b283").to_string(),
        obfstr!("f14c96fad2e14455c9994d1b7d4b1d96b6623afd50fa79d2938f6254594726a8").to_string(),
    ];
    pk_hexes.iter().filter_map(|pk_hex| {
        let pub_bytes = hex::decode(pk_hex).ok()?;
        let key_array: [u8; 32] = pub_bytes.try_into().ok()?;
        VerifyingKey::from_bytes(&key_array).ok()
    }).collect()
}

/// Core signature verification — called from multiple scattered locations
fn validate_key_offline(machine_id: &str, key: &str) -> bool {
    // Pre-check: if tampered, always fail
    if is_tampered() {
        return false;
    }
    // Increment integrity counter
    INTEGRITY_COUNTER.fetch_add(1, Ordering::SeqCst);

    let public_keys = get_public_keys();
    if public_keys.is_empty() {
        return false;
    }
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

    // Timed verification — if someone is single-stepping, this takes too long
    timed_verify(|| {
        public_keys.iter().any(|pk| pk.verify(machine_id.as_bytes(), &signature).is_ok())
    }, 500) // Should take <10ms normally; 500ms generous limit
}

/// Secondary verification using HMAC — a different code path that must agree
/// This forces an attacker to patch TWO independent verification functions
fn validate_key_secondary(machine_id: &str, key: &str) -> bool {
    if is_tampered() {
        return false;
    }
    // Re-derive public keys independently (not sharing the get_public_keys result)
    let pk1 = obfstr!("3e3ce7e1af68e01eadbb9af7f45cee360efefa84deb7da65eb47049d0c26b283").to_string();
    let pub_bytes = match hex::decode(&pk1) {
        Ok(b) => b,
        Err(_) => return false,
    };
    let key_array: [u8; 32] = match pub_bytes.try_into() {
        Ok(a) => a,
        Err(_) => return false,
    };
    let vk = match VerifyingKey::from_bytes(&key_array) {
        Ok(k) => k,
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
    vk.verify(machine_id.as_bytes(), &signature).is_ok()
}

// ═══════════════════════════════════════════════════════════════════════
//  LAYER 5: Strengthened Key Derivation (HMAC-SHA256 instead of plain SHA256)
// ═══════════════════════════════════════════════════════════════════════

fn derive_storage_key(machine_id: &str) -> [u8; 32] {
    // HMAC-SHA256 with a compile-time obfuscated key + machine_id as message
    let hmac_key = format!(
        "{}{}{}",
        obfstr!("cP0s-"),
        obfstr!("aEs256-"),
        obfstr!("sToRaGe")
    );
    let mut mac = HmacSha256::new_from_slice(hmac_key.as_bytes())
        .expect("HMAC accepts any key length");
    mac.update(machine_id.as_bytes());
    // Mix in a second factor: hash of the binary path
    if let Ok(exe) = env::current_exe() {
        mac.update(exe.to_string_lossy().as_bytes());
    }
    mac.finalize().into_bytes().into()
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

// ═══════════════════════════════════════════════════════════════════════
//  LAYER 6: Tamper Guard — all commands pass through this
// ═══════════════════════════════════════════════════════════════════════

fn guard_tamper() -> Result<(), String> {
    if is_tampered() {
        return Err(obfstr!("integrity check failed").to_string());
    }
    Ok(())
}

/// Full integrity sweep — called periodically and before sensitive operations
fn run_integrity_checks() {
    // Check 1: Anti-debug
    if detect_debugger() {
        mark_tampered();
        return;
    }
    // Check 2: Environment
    if !check_environment_integrity() {
        mark_tampered();
        return;
    }
    // Check 3: Binary integrity
    if !verify_binary_integrity() {
        mark_tampered();
        return;
    }
    // Check 4: Integrity counter should be monotonically increasing
    // (if someone NOPs out the increment, counter stays 0 after first check)
    INTEGRITY_COUNTER.fetch_add(1, Ordering::SeqCst);
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
    guard_tamper()?;

    // Run integrity checks before activation
    run_integrity_checks();
    guard_tamper()?;

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

    // Primary verification
    let primary_ok = validate_key_offline(&machine_id, &key);
    // Secondary verification (independent code path)
    let secondary_ok = validate_key_secondary(&machine_id, &key);

    // BOTH must agree — if an attacker patches only one, it still fails
    if primary_ok && secondary_ok {
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
    // Tamper check (silent — returns false, doesn't error)
    if is_tampered() {
        return false;
    }

    // Periodic integrity sweep
    run_integrity_checks();
    if is_tampered() {
        return false;
    }

    let machine_id = compute_machine_id();
    let data_dir = match app.path().app_data_dir() {
        Ok(d) => d,
        Err(_) => return false,
    };
    let activation_file = data_dir.join(obfstr!("activation.key"));
    match std::fs::read_to_string(&activation_file) {
        Ok(stored) => {
            match decrypt_from_storage(&stored, &machine_id) {
                Some(key) => {
                    // Dual verification
                    let p = validate_key_offline(&machine_id, &key);
                    let s = validate_key_secondary(&machine_id, &key);
                    p && s
                }
                None => false,
            }
        }
        Err(_) => false,
    }
}

#[tauri::command]
fn get_stored_activation_key(app: tauri::AppHandle) -> Result<String, String> {
    guard_tamper()?;
    run_integrity_checks();
    guard_tamper()?;

    let machine_id = compute_machine_id();
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let activation_file = data_dir.join(obfstr!("activation.key"));
    let stored = std::fs::read_to_string(&activation_file).map_err(|e| e.to_string())?;
    decrypt_from_storage(&stored, &machine_id).ok_or_else(|| "decrypt failed".to_string())
}

// ─── MongoDB credentials & JWT secret (auto-generated per installation) ──

#[derive(serde::Deserialize, serde::Serialize, Clone)]
struct MongoCredentials {
    admin_user: String,
    admin_pass: String,
    app_user: String,
    app_pass: String,
    jwt_secret: String,
    initialized: bool,
}

fn generate_random_string(len: usize) -> String {
    use rand::Rng;
    const CHARSET: &[u8] = b"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let mut rng = rand::thread_rng();
    (0..len).map(|_| CHARSET[rng.gen_range(0..CHARSET.len())] as char).collect()
}

fn get_credentials_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    Ok(data_dir.join("mongo_credentials.json"))
}

fn load_or_create_credentials(app: &tauri::AppHandle) -> Result<MongoCredentials, String> {
    let cred_path = get_credentials_path(app)?;
    if cred_path.exists() {
        let content = fs::read_to_string(&cred_path).map_err(|e| e.to_string())?;
        let creds: MongoCredentials = serde_json::from_str(&content).map_err(|e| e.to_string())?;
        return Ok(creds);
    }

    // Generate new credentials
    let creds = MongoCredentials {
        admin_user: "posAdmin".to_string(),
        admin_pass: generate_random_string(32),
        app_user: "posApp".to_string(),
        app_pass: generate_random_string(32),
        jwt_secret: generate_random_string(64),
        initialized: false,
    };

    let json = serde_json::to_string_pretty(&creds).map_err(|e| e.to_string())?;
    write_secure_file(&cred_path, json.as_bytes())?;
    Ok(creds)
}

fn mark_credentials_initialized(app: &tauri::AppHandle) -> Result<(), String> {
    let cred_path = get_credentials_path(app)?;
    let content = fs::read_to_string(&cred_path).map_err(|e| e.to_string())?;
    let mut creds: MongoCredentials = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    creds.initialized = true;
    let json = serde_json::to_string_pretty(&creds).map_err(|e| e.to_string())?;
    write_secure_file(&cred_path, json.as_bytes())?;
    Ok(())
}

/// Signal file that tells the Go server to create MongoDB auth users.
fn write_mongo_init_signal(app: &tauri::AppHandle, creds: &MongoCredentials) -> Result<(), String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let signal_path = data_dir.join("mongo_init_pending.json");
    let json = serde_json::to_string_pretty(creds).map_err(|e| e.to_string())?;
    write_secure_file(&signal_path, json.as_bytes())?;
    Ok(())
}

// ─── Server management ──────────────────────────────────────────────

fn get_db_path(app: &tauri::AppHandle) -> Result<String, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = data_dir.join("db");
    fs::create_dir_all(&db_path).map_err(|e| format!("Failed to create db directory: {}", e))?;
    let path_str = db_path.to_string_lossy().replace('\\', "/");
    Ok(path_str)
}

/// Clean up stale mongod.lock before starting mongod.
fn cleanup_stale_lock(db_path: &str) {
    let lock_path = std::path::Path::new(db_path).join("mongod.lock");
    if lock_path.exists() {
        if let Ok(content) = fs::read_to_string(&lock_path) {
            let pid_str = content.trim();
            if pid_str.is_empty() {
                return;
            }
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                const CREATE_NO_WINDOW_TASK: u32 = 0x08000000;
                let still_running = std::process::Command::new("tasklist")
                    .args(["/FI", &format!("PID eq {}", pid_str), "/NH"])
                    .creation_flags(CREATE_NO_WINDOW_TASK)
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

fn get_mongod_log_path(app: &tauri::AppHandle) -> Result<String, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let log_path = data_dir.join("mongod.log");
    Ok(log_path.to_string_lossy().replace('\\', "/"))
}

#[tauri::command]
fn start_server(app: tauri::AppHandle) -> Result<String, String> {
    guard_tamper()?;

    if let Some(state) = app.try_state::<Processes>() {
        let guard = state.0.lock().map_err(|e| e.to_string())?;
        if guard.server.is_some() {
            return Ok("already_running".to_string());
        }
    }

    let db_path = get_db_path(&app)?;
    let log_path = get_mongod_log_path(&app)?;
    let creds = load_or_create_credentials(&app)?;
    let needs_init = !creds.initialized;

    cleanup_stale_lock(&db_path);

    let mut mongod_args = vec![
        "--dbpath".to_string(), db_path.clone(),
        "--port".to_string(), MONGO_PORT.to_string(),
        "--bind_ip".to_string(), "127.0.0.1".to_string(),
        "--wiredTigerCacheSizeGB".to_string(), "0.45".to_string(),
        "--logpath".to_string(), log_path.clone(),
        "--logappend".to_string(),
    ];
    if !needs_init {
        mongod_args.push("--auth".to_string());
    }

    let mongod = app.shell()
        .sidecar("mongod")
        .map_err(|e| format!("mongod binary not found: {}", e))?
        .args(&mongod_args)
        .spawn()
        .map_err(|e| format!("failed to start mongod: {}", e))?;

    if let Some(state) = app.try_state::<Processes>() {
        let mut guard = state.0.lock().map_err(|e| e.to_string())?;
        guard.mongod = Some(mongod.1);
    }

    std::thread::spawn({
        let app = app.clone();
        let creds = creds.clone();
        move || {
            let addr = format!("127.0.0.1:{}", MONGO_PORT);
            for _ in 0..40 {
                if std::net::TcpStream::connect_timeout(
                    &addr.parse().unwrap(),
                    std::time::Duration::from_millis(200),
                ).is_ok() {
                    break;
                }
                std::thread::sleep(std::time::Duration::from_millis(250));
            }

            if needs_init {
                log::info!("First launch: Go server will initialize MongoDB auth users...");
                let _ = write_mongo_init_signal(&app, &creds);
            }

            let mongo_uri = if !needs_init {
                format!(
                    "mongodb://{}:{}@127.0.0.1:{}/saas_pos?authSource=saas_pos",
                    creds.app_user, creds.app_pass, MONGO_PORT
                )
            } else {
                format!("mongodb://127.0.0.1:{}", MONGO_PORT)
            };

            if let Ok(server) = app.shell()
                .sidecar("server")
                .and_then(|cmd| cmd
                    .env("MONGO_URI", &mongo_uri)
                    .env("MONGO_DB", "saas_pos")
                    .env("JWT_SECRET", &creds.jwt_secret)
                    .env("APP_HOST", "127.0.0.1")
                    .spawn()
                )
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

#[tauri::command]
fn get_mongod_log(app: tauri::AppHandle) -> Result<String, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let log_path = data_dir.join("mongod.log");
    let content = std::fs::read_to_string(&log_path).unwrap_or_default();
    let lines: Vec<&str> = content.lines().collect();
    let start = if lines.len() > 50 { lines.len() - 50 } else { 0 };
    Ok(lines[start..].join("\n"))
}

/// Get MongoDB credentials — PROTECTED: requires valid activation
#[tauri::command]
fn get_db_credentials(app: tauri::AppHandle) -> Result<String, String> {
    guard_tamper()?;
    // Verify activation before exposing credentials
    if !check_activation(app.clone()) {
        return Err(obfstr!("activation required").to_string());
    }
    let creds = load_or_create_credentials(&app)?;
    let info = serde_json::json!({
        "port": MONGO_PORT,
        "admin_user": creds.admin_user,
        "admin_pass": creds.admin_pass,
        "app_user": creds.app_user,
        "app_pass": creds.app_pass,
        "auth_enabled": creds.initialized,
        "db_name": "saas_pos",
    });
    serde_json::to_string(&info).map_err(|e| e.to_string())
}

#[tauri::command]
fn stop_server(_app: tauri::AppHandle) -> Result<String, String> {
    Ok("stopped".to_string())
}

struct ProcessState {
    mongod: Option<CommandChild>,
    server: Option<CommandChild>,
}

struct Processes(std::sync::Mutex<ProcessState>);

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
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", "Get-Printer | Select-Object -ExpandProperty Name"])
        .creation_flags(CREATE_NO_WINDOW)
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
        .creation_flags(CREATE_NO_WINDOW)
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

#[tauri::command]
fn print_html(webview: tauri::Webview, html: String) -> Result<(), String> {
    let current_url = webview.url().map_err(|e| e.to_string())?;
    let tmp = std::env::temp_dir().join(format!("ciposdz_print_{}.html", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis()));
    std::fs::write(&tmp, &html).map_err(|e| format!("Failed to write temp file: {}", e))?;
    let file_url = tauri::Url::from_file_path(&tmp).map_err(|_| "Invalid path".to_string())?;
    webview.navigate(file_url).map_err(|e| e.to_string())?;
    let webview_clone = webview.clone();
    let url_clone = current_url.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(500));
        let _ = webview_clone.print();
        std::thread::sleep(std::time::Duration::from_millis(1000));
        let _ = webview_clone.navigate(url_clone);
        let _ = std::fs::remove_file(&tmp);
    });
    Ok(())
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

// ═══════════════════════════════════════════════════════════════════════
//  App Entry — with startup integrity checks
// ═══════════════════════════════════════════════════════════════════════

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // ─── STARTUP INTEGRITY ───────────────────────────────────────────
    // Record binary hash before anything can modify it
    init_binary_hash();

    // Initial anti-debug check
    if detect_debugger() {
        mark_tampered();
    }

    // Environment check
    if !check_environment_integrity() {
        mark_tampered();
    }

    // ─── Background integrity monitor ────────────────────────────────
    // Runs every 30 seconds in a background thread
    std::thread::spawn(|| {
        loop {
            std::thread::sleep(std::time::Duration::from_secs(30));
            run_integrity_checks();
        }
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
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
            get_db_credentials,
            list_printers,
            print_raw,
            print_html,
        ])
        .build(tauri::generate_context!())
        .expect("error")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(state) = app.try_state::<Processes>() {
                    if let Ok(mut guard) = state.0.lock() {
                        let _ = guard.server.take();
                        let _ = guard.mongod.take();
                    }
                }
            }
        });
}
