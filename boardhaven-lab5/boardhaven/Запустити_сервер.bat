@echo off
chcp 65001 > nul
title BoardHaven — Лабораторна робота № 5 (Node.js + Express + SQLite)
cd /d "%~dp0"

echo ====================================================================
echo   BoardHaven — Лабораторна робота № 5
echo   Express + SQLite + REST API
echo ====================================================================
echo.

:: Перевірка чи є node у PATH або у папці користувача
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" (
        set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"
    ) else (
        echo [ПОМИЛКА] Node.js не знайдено! Встановіть Node.js 22 або новіший.
        pause
        exit /b 1
    )
)

echo Запуск сервера на http://localhost:3000 ...
start "" http://localhost:3000
echo Для зупинки сервера натисніть Ctrl+C у цьому вікні.
echo.

node server.js
pause
