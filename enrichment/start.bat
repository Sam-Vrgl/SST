@echo off
echo =======================================
echo    CSV Merger ^& Enricher
echo =======================================

:: Check if bun is installed
where bun >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Bun is not installed or not in your PATH.
    echo Please install Bun from https://bun.sh and re-run this file.
    pause
    exit /b
)

echo.
echo Installing dependencies...
call bun install

echo.
echo Starting server...
call bun run start.ts
pause
