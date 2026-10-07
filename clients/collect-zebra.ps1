# ============================================================
# Zebra Printer Meter Collector
# ------------------------------------------------------------
# Requirements:
#   - Windows PowerShell
#   - No Node.js required
#   - No external library required
#
# Flow:
#   Zebra Printer
#       ↓ TCP 9100
#   PowerShell
#       ↓ HTTP POST
#   MES API
# ============================================================

$ErrorActionPreference = "Stop"

# ------------------------------------------------------------
# CONFIG FILE
# ------------------------------------------------------------

$BaseDirectory = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ConfigFile = Join-Path $BaseDirectory "config.json"

if (-not (Test-Path $ConfigFile)) {
    Write-Host "ERROR: config.json not found:"
    Write-Host $ConfigFile
    exit 1
}

try {
    $Config = Get-Content $ConfigFile -Raw | ConvertFrom-Json
}
catch {
    Write-Host "ERROR: Failed to parse config.json"
    Write-Host $_.Exception.Message
    exit 1
}

# ------------------------------------------------------------
# COLLECTOR (KOMPUTER INI) INFO
# ------------------------------------------------------------
# Diisi otomatis saat koneksi TCP ke printer berhasil.
#   Hostname : nama komputer yang menjalankan script.
#   Ip       : IP lokal yang benar-benar dipakai menjangkau
#              printer (diambil dari socket koneksi).
# ------------------------------------------------------------

$Script:CollectorHostname = [System.Environment]::MachineName
$Script:CollectorIp = $null

# ------------------------------------------------------------
# FUNCTIONS
# ------------------------------------------------------------

function Write-Log {
    param (
        [string]$Message,
        [string]$Level = "INFO"
    )

    $Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

    $LogMessage = "[{0}] [{1}] {2}" -f `
        $Timestamp,
        $Level,
        $Message

    Write-Host $LogMessage

    if ($Config.logging.enabled -eq $true) {

        $LogDirectory = $Config.logging.directory
        $LogFile = Join-Path `
            $LogDirectory `
            $Config.logging.fileName

        try {
            if (-not (Test-Path $LogDirectory)) {
                New-Item `
                    -ItemType Directory `
                    -Path $LogDirectory `
                    -Force | Out-Null
            }

            Add-Content `
                -Path $LogFile `
                -Value $LogMessage
        }
        catch {
            Write-Host "WARNING: Cannot write log file."
        }
    }
}


function Test-Configuration {

    $RequiredValues = @(
        $Config.printer.id,
        $Config.printer.model,
        $Config.printer.ip,
        $Config.printer.port,
        $Config.api.url
    )

    foreach ($Value in $RequiredValues) {

        if ($null -eq $Value -or "$Value".Trim() -eq "") {

            Write-Log `
                -Message "Configuration contains empty required value." `
                -Level "ERROR"

            return $false
        }
    }

    return $true
}


function Test-PrinterConnection {

    param (
        [string]$IPAddress,
        [int]$Port,
        [int]$TimeoutMilliseconds = 5000
    )

    Write-Log `
        -Message "Testing connection to $IPAddress`:$Port"

    $TcpClient = New-Object System.Net.Sockets.TcpClient

    try {

        $ConnectTask = $TcpClient.ConnectAsync(
            $IPAddress,
            $Port
        )

        if (-not $ConnectTask.Wait($TimeoutMilliseconds)) {

            Write-Log `
                -Message "Connection timeout to printer $IPAddress`:$Port" `
                -Level "ERROR"

            return $false
        }

        if (-not $TcpClient.Connected) {

            Write-Log `
                -Message "Printer connection failed." `
                -Level "ERROR"

            return $false
        }

        Write-Log `
            -Message "Printer connection successful."

        # ----------------------------------------------------
        # CAPTURE COLLECTOR LOCAL IP
        # ----------------------------------------------------
        # IP lokal socket yang menjangkau printer (akurat
        # untuk komputer dengan lebih dari satu NIC).
        # ----------------------------------------------------

        try {
            $LocalEndpoint = $TcpClient.Client.LocalEndPoint

            if ($null -ne $LocalEndpoint) {
                $Script:CollectorIp = $LocalEndpoint.Address.ToString()
            }
        }
        catch {
            # Fallback ditangani di bagian MAIN.
        }

        return $true

    }
    catch {

        Write-Log `
            -Message "Printer connection error: $($_.Exception.Message)" `
            -Level "ERROR"

        return $false
    }
    finally {

        if ($null -ne $TcpClient) {
            $TcpClient.Close()
        }
    }
}


function Get-ZebraValue {

    param (
        [string]$IPAddress,
        [int]$Port,
        [string]$Command,
        [int]$ConnectionTimeoutMs = 5000,
        [int]$ResponseTimeoutMs = 2000
    )

    $TcpClient = New-Object System.Net.Sockets.TcpClient

    try {

        # ----------------------------------------------------
        # CONNECT
        # ----------------------------------------------------

        $ConnectTask = $TcpClient.ConnectAsync(
            $IPAddress,
            $Port
        )

        if (-not $ConnectTask.Wait($ConnectionTimeoutMs)) {

            throw "Connection timeout"
        }

        if (-not $TcpClient.Connected) {

            throw "Unable to connect to printer"
        }

        # ----------------------------------------------------
        # STREAM
        # ----------------------------------------------------

        $Stream = $TcpClient.GetStream()

        $Stream.ReadTimeout = $ResponseTimeoutMs
        $Stream.WriteTimeout = $ConnectionTimeoutMs

        # ----------------------------------------------------
        # COMMAND
        # ----------------------------------------------------

        $CommandWithCRLF = $Command + "`r`n"

        $Bytes = [System.Text.Encoding]::ASCII.GetBytes(
            $CommandWithCRLF
        )

        $Stream.Write(
            $Bytes,
            0,
            $Bytes.Length
        )

        $Stream.Flush()

        # ----------------------------------------------------
        # RESPONSE
        # ----------------------------------------------------

        $Buffer = New-Object byte[] 4096
        $Response = New-Object System.Text.StringBuilder

        $StartTime = Get-Date

        while ($true) {

            $Elapsed = (
                (Get-Date) - $StartTime
            ).TotalMilliseconds

            if ($Elapsed -gt $ResponseTimeoutMs) {
                break
            }

            if ($Stream.DataAvailable) {

                $BytesRead = $Stream.Read(
                    $Buffer,
                    0,
                    $Buffer.Length
                )

                if ($BytesRead -gt 0) {

                    $Text = [System.Text.Encoding]::ASCII.GetString(
                        $Buffer,
                        0,
                        $BytesRead
                    )

                    [void]$Response.Append($Text)

                    # Wait briefly for remaining response
                    Start-Sleep -Milliseconds 100
                }
            }
            else {

                Start-Sleep -Milliseconds 50
            }
        }

        $Result = $Response.ToString().Trim()

        return $Result
    }
    catch {

        throw $_
    }
    finally {

        if ($null -ne $TcpClient) {
            $TcpClient.Close()
        }
    }
}


function Parse-NumericValue {

    param (
        [string]$Value
    )

    if ($null -eq $Value) {
        return $null
    }

    $CleanValue = $Value.Trim()

    # Remove surrounding quotes
    $CleanValue = $CleanValue.Trim('"')

    # Try direct numeric parsing
    $Number = 0

    if (
        [decimal]::TryParse(
            $CleanValue,
            [Globalization.NumberStyles]::Any,
            [Globalization.CultureInfo]::InvariantCulture,
            [ref]$Number
        )
    ) {
        return $Number
    }

    # --------------------------------------------------------
    # Some Zebra values can contain text/unit.
    #
    # Example:
    #  "12345 INCHES"
    #
    # Extract first numeric value.
    # --------------------------------------------------------

    $Match = [regex]::Match(
        $CleanValue,
        "-?\d+(\.\d+)?"
    )

    if ($Match.Success) {

        $ParsedNumber = 0

        if (
            [decimal]::TryParse(
                $Match.Value,
                [Globalization.NumberStyles]::Any,
                [Globalization.CultureInfo]::InvariantCulture,
                [ref]$ParsedNumber
            )
        ) {
            return $ParsedNumber
        }
    }

    return $null
}


function Collect-Meters {

    param (
        [string]$IPAddress,
        [int]$Port,
        [int]$ConnectionTimeoutMs,
        [int]$ResponseTimeoutMs
    )

    $MeterResults = @{}

    foreach ($Meter in $Config.meters) {

        $Name = $Meter.name
        $Command = $Meter.command

        Write-Log `
            -Message "Reading meter: $Name"

        try {

            $RawResponse = Get-ZebraValue `
                -IPAddress $IPAddress `
                -Port $Port `
                -Command $Command `
                -ConnectionTimeoutMs $ConnectionTimeoutMs `
                -ResponseTimeoutMs $ResponseTimeoutMs

            $NumericValue = Parse-NumericValue `
                -Value $RawResponse

            $MeterResults[$Name] = @{
                raw = $RawResponse
                value = $NumericValue
            }

            Write-Log `
                -Message "$Name = $RawResponse"
        }
        catch {

            Write-Log `
                -Message "Failed to read $Name : $($_.Exception.Message)" `
                -Level "ERROR"

            $MeterResults[$Name] = @{
                raw = $null
                value = $null
                error = $_.Exception.Message
            }
        }
    }

    return $MeterResults
}


function Send-ToApi {

    param (
        [hashtable]$MeterResults
    )

    $Timestamp = Get-Date

    # --------------------------------------------------------
    # BUILD PAYLOAD
    # --------------------------------------------------------

    $Meters = @{}

    foreach ($Key in $MeterResults.Keys) {

        $Meters[$Key] = $MeterResults[$Key].value
    }

    $PayloadObject = @{
        printerId = $Config.printer.id
        model = $Config.printer.model
        ipAddress = $Config.printer.ip
        measuredAt = $Timestamp.ToString("o")

        collectorHostname = $Script:CollectorHostname
        collectorIp = $Script:CollectorIp

        meters = $Meters

        rawMeters = $MeterResults
    }

    $Payload = $PayloadObject | ConvertTo-Json -Depth 10

    Write-Log "Sending meter data to API:"
    Write-Log $Payload

    # --------------------------------------------------------
    # HTTP HEADERS
    # --------------------------------------------------------

    $Headers = @{
        "Accept" = "application/json"
    }

    if (
        $null -ne $Config.api.apiKey -and
        "$($Config.api.apiKey)".Trim() -ne ""
    ) {

        $Headers["X-API-Key"] = $Config.api.apiKey
    }

    # --------------------------------------------------------
    # SEND
    # --------------------------------------------------------

    try {

        $Response = Invoke-RestMethod `
            -Uri $Config.api.url `
            -Method $Config.api.method `
            -Headers $Headers `
            -ContentType "application/json" `
            -Body $Payload `
            -TimeoutSec $Config.api.timeoutSeconds

        Write-Log "API request successful."

        return $true
    }
    catch {

        Write-Log `
            -Message "API request failed: $($_.Exception.Message)" `
            -Level "ERROR"

        return $false
    }
}


# ============================================================
# MAIN
# ============================================================

Write-Log "============================================================"
Write-Log "Zebra Printer Meter Collector started."
Write-Log "============================================================"

try {

    # --------------------------------------------------------
    # VALIDATE CONFIG
    # --------------------------------------------------------

    if (-not (Test-Configuration)) {

        Write-Log `
            -Message "Invalid configuration. Process stopped." `
            -Level "ERROR"

        exit 1
    }

    $PrinterId = $Config.printer.id
    $PrinterModel = $Config.printer.model
    $PrinterIP = $Config.printer.ip
    $PrinterPort = [int]$Config.printer.port

    $ConnectionTimeoutMs = [int]$Config.printer.connectionTimeoutMs
    $ResponseTimeoutMs = [int]$Config.printer.responseTimeoutMs

    Write-Log "Printer ID    : $PrinterId"
    Write-Log "Printer Model : $PrinterModel"
    Write-Log "Printer IP    : $PrinterIP"
    Write-Log "Printer Port  : $PrinterPort"

    # --------------------------------------------------------
    # TEST CONNECTION
    # --------------------------------------------------------

    $ConnectionOK = Test-PrinterConnection `
        -IPAddress $PrinterIP `
        -Port $PrinterPort `
        -TimeoutMilliseconds $ConnectionTimeoutMs

    if (-not $ConnectionOK) {

        Write-Log `
            -Message "Printer is unreachable. Process stopped." `
            -Level "ERROR"

        exit 2
    }

    # --------------------------------------------------------
    # COLLECTOR INFO (KOMPUTER INI)
    # --------------------------------------------------------

    if ([string]::IsNullOrWhiteSpace($Script:CollectorIp)) {

        # Fallback: ambil IPv4 NIC aktif pertama komputer ini.
        $FallbackAddress = [System.Net.Dns]::GetHostEntry(
            [System.Net.Dns]::GetHostName()
        ).AddressList |
            Where-Object {
                $_.AddressFamily -eq
                    [System.Net.Sockets.AddressFamily]::InterNetwork
            } |
            Select-Object -First 1

        if ($null -ne $FallbackAddress) {
            $Script:CollectorIp = $FallbackAddress.ToString()
        }
    }

    Write-Log "Collector Hostname : $Script:CollectorHostname"
    Write-Log "Collector IP       : $Script:CollectorIp"

    # --------------------------------------------------------
    # COLLECT
    # --------------------------------------------------------

    $MeterResults = Collect-Meters `
        -IPAddress $PrinterIP `
        -Port $PrinterPort `
        -ConnectionTimeoutMs $ConnectionTimeoutMs `
        -ResponseTimeoutMs $ResponseTimeoutMs

    # --------------------------------------------------------
    # SEND API
    # --------------------------------------------------------

    # $ApiOK = Send-ToApi `
    #     -MeterResults $MeterResults

    # if (-not $ApiOK) {

    #     Write-Log `
    #         -Message "Meter collection completed but API delivery failed." `
    #         -Level "ERROR"

    #     exit 3
    # }

    Write-Log "Meter collection completed successfully."

    exit 0
}
catch {

    Write-Log `
        -Message "Unhandled error: $($_.Exception.Message)" `
        -Level "ERROR"

    exit 99
}
finally {

    Write-Log "Zebra Printer Meter Collector finished."
    Write-Log "============================================================"
}