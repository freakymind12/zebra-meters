@echo off
setlocal EnableExtensions
title ZebraMeter - Create Scheduler
cd /d "%~dp0"

REM ============================================================
REM  ZebraMeter - Create Scheduler (launcher double-click)
REM  ------------------------------------------------------------
REM  Menjalankan create-scheduler.ps1 yang membuat Windows
REM  Task Scheduler untuk collect-zebra.ps1 (interval 15 menit).
REM
REM  create-scheduler.ps1 memerlukan hak Administrator, maka
REM  launcher ini otomatis membuka dirinya kembali dengan hak
REM  Administrator (elevasi UAC) bila belum berjalan sebagai admin.
REM
REM  Usage: double-click file ini, lalu klik YES pada dialog UAC.
REM
REM  Related: delete-scheduler.bat -> menghapus task
REM ============================================================

REM ------------------------------------------------------------
REM  CEK FILE SCRIPT (fail fast sebelum minta elevasi)
REM ------------------------------------------------------------

if not exist "%~dp0create-scheduler.ps1" (
    echo.
    echo  [ERROR] create-scheduler.ps1 tidak ditemukan di folder:
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
echo  Hak Administrator diperlukan untuk membuat task.
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
echo  ZebraMeter - Create Task Scheduler
echo  Interval : 15 menit
echo  Akun     : SYSTEM (Highest privileges)
echo ============================================================
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0create-scheduler.ps1"
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
