; CiPOSdz NSIS Installer Hooks
; This file is referenced by tauri.conf.json → bundle.windows.nsis.installerHooks

!macro NSIS_HOOK_PREINSTALL
  ; Pre-install hook — runs before installation begins
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; Post-install hook — runs after installation completes
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; Pre-uninstall hook — runs before uninstallation begins
  ; Kill any running CiPOSdz processes before uninstall
  nsExec::ExecToLog 'taskkill /F /IM "CiPOSdz.exe" /T'
  nsExec::ExecToLog 'taskkill /F /IM "mongod.exe" /T'
  nsExec::ExecToLog 'taskkill /F /IM "server.exe" /T'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; Post-uninstall hook — runs after uninstallation completes
!macroend
