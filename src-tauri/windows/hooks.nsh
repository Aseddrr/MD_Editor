!macro NSIS_HOOK_PREUNINSTALL
  nsExec::ExecToStack `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -Command "if (-not [IO.File]::Exists('$INSTDIR\lightmark.exe')) { exit 0 }; try { [IO.File]::Open('$INSTDIR\lightmark.exe', 'Open', 'ReadWrite', 'None').Dispose(); exit 0 } catch { exit 42 }"`
  Pop $0
  Pop $1
  StrCmp $0 "42" 0 lightmark_not_running
  MessageBox MB_OK|MB_ICONEXCLAMATION "LightMark 正在运行。请先关闭程序，然后重新执行卸载。" /SD IDOK
  Abort
  lightmark_not_running:
!macroend
