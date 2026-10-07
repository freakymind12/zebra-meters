@echo off
setlocal EnableExtensions
title ZebraMeter - Delete Scheduler
cd /d "%~dp0"

REM ============================================================
REM  ZebraMeter - Delete Scheduler (launcher double-click)
REM  ------------------------------------------------------------
REM  Menjalankan delete-scheduler.ps1 yang menghapus Windows
REM  Task Scheduler "ZebraMeter Collector" (buatan
REM  create-scheduler.ps1).
REM
REM  delete-scheduler.ps1 memerlukan hak Administrator, maka
REM  launcher ini otomatis membuka dirinya kembali dengan hak
REM  Administrator (elevasi UAC) bila belum berjalan sebagai admin.
REM
REM  Usage: double-click file ini, lalu klik YES pada dialog UAC.
REM
REM  Related: create-scheduler.bat -> membuat task
REM ============================================================

REM ------------------------------------------------------------
REM  CEK FILE SCRIPT (fail fast sebelum minta elevasi)
REM ------------------------------------------------------------

if not exist "%~dp0delete-scheduler.ps1" (
    echo.
    echo  [ERROR] delete-scheduler.ps1 tidak ditemukan di folder:
    echo          %~dp0
    echo.
    pause
    exit /b 2
)

REM ------------------------------------------------------------
REM  CEK HAK ADMINISTRATOR
REM  fltmc hanya berhasil dijalankan oleh token Administrator.
REM ------------------------------------------------------------

fltmc >nul 2>&1
if not errorlevel 1 goto :RUN

echo.
echo  Hak Administrator diperlukan untuk menghapus task.
echo  Membuka prompt UAC - silakan klik YES / Ya.
echo.

powershell -NoProfile -Command "try { Start-Process -FilePath '%~f0' -Verb RunAs -WorkingDirectory '%~dp0' -ErrorAction Stop } catch { Write-Host 'UAC dibatalkan - launcher batal dijalankan.'; exit 1 }"
if errorlevel 1 (
    echo.
    echo  [ERROR] Elevasi ke Administrator gagal atau dibatalkan.
    echo.
    pause
    exit /b 1
)
exit /b 0

REM ------------------------------------------------------------
REM  JALANKAN SCRIPT (sudah berjalan sebagai Administrator)
REM ------------------------------------------------------------

:RUN
echo ============================================================
echo  ZebraMeter - Delete Task Scheduler
echo  Task     : ZebraMeter Collector
echo ============================================================
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0delete-scheduler.ps1"
set "RC=%ERRORLEVEL%"

echo.
echo ============================================================
if "%RC%"=="0" (
    echo  Status: SUKSES - exit code 0
) else (
    echo  Status: GAGAL - exit code %RC%
    echo  Cek pesan ERROR di atas dan file log.
)
echo ============================================================
echo.
pause
exit /b %RC%
