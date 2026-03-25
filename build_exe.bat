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

if exist "build" (
  rmdir /s /q "build"
  if exist "build" (
    echo Failed to remove the build folder.
    echo Close PlantLabelHelper and try again.
    pause
    exit /b 1
  )
)

if exist "dist" (
  rmdir /s /q "dist"
  if exist "dist" (
    echo Failed to remove the dist folder.
    echo Close PlantLabelHelper and try again.
    pause
    exit /b 1
  )
)

".venv\Scripts\python.exe" -m ensurepip --upgrade
".venv\Scripts\python.exe" -m pip install --upgrade pip
".venv\Scripts\python.exe" -m pip install -r requirements.txt
".venv\Scripts\python.exe" -m pip install pyinstaller
".venv\Scripts\python.exe" -m PyInstaller plant_label_helper.spec --noconfirm --clean
if errorlevel 1 (
  echo PyInstaller build failed.
  pause
  exit /b 1
)

echo.
echo dist\PlantLabelHelper\PlantLabelHelper.exe was created.
pause
