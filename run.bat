@echo off
setlocal

REM SearchEverywhere - Dev Run Script (Windows)
REM 1) Kills any lingering app processes to avoid Windows file locks
REM 2) Starts Tauri dev (will auto-run `npm run dev` for Vite frontend)

cd /d "%~dp0"

REM Kill possible running executables (ignore errors)
for %%P in (SearchEvery.exe, search-everywhere-tauri.exe) do (
  taskkill /F /IM %%P >nul 2>&1
)

REM Start Tauri dev
npx tauri dev

exit /b %ERRORLEVEL%