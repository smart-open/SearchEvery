@echo off
setlocal

REM SearchEverywhere - One-click Build Script (Windows)
REM 1) Kills lingering processes to avoid file locks
REM 2) Builds the app with Tauri (produces MSI and NSIS installers)

cd /d "%~dp0"

REM Kill possible running executables (ignore errors)
for %%P in (SearchEvery.exe, search-everywhere-tauri.exe) do (
  taskkill /F /IM %%P >nul 2>&1
)

echo Building with Tauri...
npx tauri build
set EXITCODE=%ERRORLEVEL%
if not "%EXITCODE%"=="0" (
  echo Build failed with code %EXITCODE%
  exit /b %EXITCODE%
)

echo.
echo Build succeeded. Installers are located at:
echo   %cd%\src-tauri\target\release\bundle\msi
echo   %cd%\src-tauri\target\release\bundle\nsis

exit /b 0