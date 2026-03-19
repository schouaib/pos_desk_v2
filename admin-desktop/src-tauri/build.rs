fn main() {
    // Target Windows 7 SP1 as minimum supported version
    #[cfg(target_os = "windows")]
    {
        // NTDDI_WIN7 = 0x06010000, _WIN32_WINNT_WIN7 = 0x0601
        println!("cargo:rustc-env=WINAPI_FAMILY=WINAPI_FAMILY_DESKTOP_APP");
    }
    tauri_build::build()
}
