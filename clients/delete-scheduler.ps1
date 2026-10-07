# ============================================================
# ZebraMeter - Task Scheduler Delete
# ------------------------------------------------------------
# Menghapus Windows Task Scheduler yang dibuat oleh
# create-scheduler.ps1 (task: "ZebraMeter Collector").
#
# Gunakan script ini untuk pembersihan ketika PC ini
# sudah tidak dipakai sebagai PC mesin printer.
#
# Requirements:
#   - Windows PowerShell
#   - Jalankan sebagai Administrator (WAJIB - di awal,
#     karena query task pun butuh token admin)
#   - Jika task tidak ada, script ini tetap exit 0
#     (aman dijalankan berulang / idempotent)
#
# Usage:
#   powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\delete-scheduler.ps1"
# ============================================================

$ErrorActionPreference = "Stop"

# ------------------------------------------------------------
# SETTINGS (HARUS sama dengan create-scheduler.ps1)
# ------------------------------------------------------------

$TaskName = "ZebraMeter Collector"

# ------------------------------------------------------------
# BASE DIRECTORY
# ------------------------------------------------------------

$BaseDirectory = Split-Path -Parent $MyInvocation.MyCommand.Definition

# ------------------------------------------------------------
# LOG (console + file log collector jika config tersedia)
# ------------------------------------------------------------

$LogFile = $null

function Write-Log {
    param (
        [string]$Message,
        [string]$Level = "INFO"
    )

    $Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $LogMessage = "[{0}] [{1}] {2}" -f $Timestamp, $Level, $Message

    Write-Host $LogMessage

    if ($null -ne $LogFile) {
        try {
            Add-Content -Path $LogFile -Value $LogMessage
        }
        catch {
            Write-Host "WARNING: Cannot write log file."
        }
    }
}


$ConfigFile = Join-Path $BaseDirectory "config.json"

if (Test-Path $ConfigFile) {
    try {
        $Config = Get-Content $ConfigFile -Raw | ConvertFrom-Json

        if ($Config.logging.enabled -eq $true) {
            $LogFile = Join-Path `
                $Config.logging.directory `
                $Config.logging.fileName
        }
    }
    catch {
        Write-Host "WARNING: Failed to parse config.json. File log disabled."
    }
}


function Test-Administrator {
    $Identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $Principal = New-Object Security.Principal.WindowsPrincipal(
        $Identity
    )

    return $Principal.IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator
    )
}


# ============================================================
# MAIN
# ============================================================

Write-Log "============================================================"
Write-Log "ZebraMeter Scheduler Delete started."
Write-Log "============================================================"

try {

    # --------------------------------------------------------
    # ADMIN CHECK (WAJIB - dijalankan paling awal)
    # --------------------------------------------------------
    # Task dibuat dengan principal SYSTEM → ACL task tidak
    # terbaca oleh token non-admin. Cek existence tanpa admin
    # bisa menghasilkan "tidak ada" yang SALAH (false negative),
    # sehingga pembersihan bisa gagal diam-diam.
    # --------------------------------------------------------

    if (-not (Test-Administrator)) {

        Write-Log `
            -Message "Administrator rights required. Run this script as Administrator." `
            -Level "ERROR"

        exit 1
    }

    # --------------------------------------------------------
    # CHECK TASK
    # --------------------------------------------------------

    $ExistingTask = Get-ScheduledTask `
        -TaskName $TaskName `
        -ErrorAction SilentlyContinue

    if ($null -eq $ExistingTask) {

        Write-Log `
            -Message "Task not found. Nothing to delete: $TaskName"

        exit 0
    }

    Write-Log "Task found: $TaskName"

    # --------------------------------------------------------
    # STOP (jika sedang berjalan) LALU DELETE
    # --------------------------------------------------------

    try {
        Stop-ScheduledTask `
            -TaskName $TaskName `
            -ErrorAction SilentlyContinue
    }
    catch {
        # Task tidak sedang berjalan - abaikan.
    }

    Unregister-ScheduledTask `
        -TaskName $TaskName `
        -Confirm:$false

    # --------------------------------------------------------
    # VERIFY
    # --------------------------------------------------------

    $AfterDelete = Get-ScheduledTask `
        -TaskName $TaskName `
        -ErrorAction SilentlyContinue

    if ($null -eq $AfterDelete) {
        Write-Log "Task deleted successfully: $TaskName"
        exit 0
    }
    else {
        Write-Log `
            -Message "Task still exists after delete attempt." `
            -Level "ERROR"

        exit 3
    }
}
catch {
    Write-Log `
        -Message "Unhandled error: $($_.Exception.Message)" `
        -Level "ERROR"

    exit 99
}
finally {
    Write-Log "ZebraMeter Scheduler Delete finished."
    Write-Log "============================================================"
}