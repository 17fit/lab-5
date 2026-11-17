@echo off
chcp 65001 > nul
title BoardHaven — Тестування (Лабораторна робота № 5)
cd /d "%~dp0"

where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" (
        set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"
    )
)

echo ====================================================================
echo   Запуск модульних тестів (node --test)
echo ====================================================================
echo.
node --test
echo.
echo ====================================================================
pause
