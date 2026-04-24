@echo off
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo .venv\Scripts\python.exe를 찾지 못했습니다.
  echo 먼저 build_exe.bat 또는 requirements 설치를 완료해 주세요.
  pause
  exit /b 1
)

".venv\Scripts\python.exe" migrate_purchase_ledger_to_turso.py %*
if errorlevel 1 (
  echo.
  echo Turso 이관 작업이 실패했습니다.
  pause
  exit /b 1
)

echo.
echo Turso 이관 작업이 완료되었습니다.
pause
