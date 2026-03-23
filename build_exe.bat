@echo off
cd /d "%~dp0"

where py >nul 2>nul
if errorlevel 1 (
  echo Python is not installed or py was not found.
  pause
  exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
  py -m venv .venv
)

".venv\Scripts\python.exe" -m ensurepip --upgrade
".venv\Scripts\python.exe" -m pip install --upgrade pip
".venv\Scripts\python.exe" -m pip install -r requirements.txt
".venv\Scripts\python.exe" -m pip install pyinstaller
".venv\Scripts\python.exe" -m PyInstaller plant_label_helper.spec --noconfirm

echo.
echo dist\PlantLabelHelper\PlantLabelHelper.exe was created.
pause
