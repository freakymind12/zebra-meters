# ============================================================
# ZebraMeter - Task Scheduler Creator
# ------------------------------------------------------------
# Membuat Windows Task Scheduler yang menjalankan
# collect-zebra.ps1 otomatis SETIAP 15 MENIT.
#
# Requirements:
#   - Windows PowerShell
#   - Jalankan sebagai Administrator
#
# Usage:
#   powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\create-scheduler.ps1"
#
# Related:
#   delete-scheduler.ps1 -> menghapus task buatan script ini
# ============================================================

$ErrorActionPreference = "Stop"

# ------------------------------------------------------------
# SETTINGS
# ------------------------------------------------------------

$TaskName = "ZebraMeter Collector"
$IntervalMinutes = 15

# Nama task ini HARUS sama dengan yang ada di
# delete-scheduler.ps1.

# ------------------------------------------------------------
# BASE DIRECTORY
# ------------------------------------------------------------

$BaseDirectory = Split-Path -Parent $MyInvocation.MyCommand.Definition
$CollectorScript = Join-Path $BaseDirectory "collect-zebra.ps1"

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
Write-Log "ZebraMeter Scheduler Creator started."
Write-Log "============================================================"

try {

    # --------------------------------------------------------
    # ADMIN CHECK
    # --------------------------------------------------------

    if (-not (Test-Administrator)) {

        Write-Log `
            -Message "Administrator rights required. Run this script as Administrator." `
            -Level "ERROR"

        exit 1
    }

    # --------------------------------------------------------
    # COLLECTOR SCRIPT CHECK
    # --------------------------------------------------------

    if (-not (Test-Path $CollectorScript)) {

        Write-Log `
            -Message "collect-zebra.ps1 not found: $CollectorScript" `
            -Level "ERROR"

        exit 2
    }

    # --------------------------------------------------------
    # NEXT RUN TIME (diselaraskan ke kelipatan 15 menit)
    # --------------------------------------------------------

    $Now = Get-Date
    $NextRun = $Now.Date.AddMinutes(
        [math]::Ceiling(
            $Now.TimeOfDay.TotalMinutes / $IntervalMinutes
        ) * $IntervalMinutes
    )

    if ($NextRun -le $Now) {
        $NextRun = $NextRun.AddMinutes($IntervalMinutes)
    }

    # --------------------------------------------------------
    # TASK DEFINITION
    # --------------------------------------------------------

    $PowerShellExe = Join-Path `
        $env:SystemRoot `
        "System32\WindowsPowerShell\v1.0\powershell.exe"

    if (-not (Test-Path $PowerShellExe)) {
        $PowerShellExe = "powershell.exe"
    }

    $Action = New-ScheduledTaskAction `
        -Execute $PowerShellExe `
        -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$CollectorScript`"" `
        -WorkingDirectory $BaseDirectory

    $Trigger = New-ScheduledTaskTrigger `
        -Once `
        -At $NextRun `
        -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes) `
        -RepetitionDuration (New-TimeSpan -Days 9999)

    $Settings = New-ScheduledTaskSettingsSet `
        -StartWhenAvailable `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -MultipleInstances IgnoreNew `
        -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

    $Principal = New-ScheduledTaskPrincipal `
        -UserId "SYSTEM" `
        -LogonType ServiceAccount `
        -RunLevel Highest

    # --------------------------------------------------------
    # REGISTER
    # --------------------------------------------------------

    $ExistingTask = Get-ScheduledTask `
        -TaskName $TaskName `
        -ErrorAction SilentlyContinue

    if ($null -ne $ExistingTask) {
        Write-Log -Message "Task already exists. It will be re-created."
    }

    Register-ScheduledTask `
        -TaskName $TaskName `
        -Description "ZebraMeter: runs collect-zebra.ps1 every $IntervalMinutes minutes." `
        -Action $Action `
        -Trigger $Trigger `
        -Settings $Settings `
        -Principal $Principal `
        -Force | Out-Null

    Write-Log "Task created successfully."

    # --------------------------------------------------------
    # SUMMARY
    # --------------------------------------------------------

    $TaskInfo = Get-ScheduledTaskInfo -TaskName $TaskName

    Write-Log "Task Name    : $TaskName"
    Write-Log "Schedule     : every $IntervalMinutes minutes"
    Write-Log "First Run    : $NextRun"
    Write-Log "Next Run     : $($TaskInfo.NextRunTime)"
    Write-Log "Script       : $CollectorScript"
    Write-Log "Run As       : SYSTEM (Highest privileges)"

    exit 0
}
catch {
    Write-Log `
        -Message "Unhandled error: $($_.Exception.Message)" `
        -Level "ERROR"

    exit 99
}
finally {
    Write-Log "ZebraMeter Scheduler Creator finished."
    Write-Log "============================================================"
}