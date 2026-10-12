# ============================================================
# Zebra Printer Meter Collector
# ------------------------------------------------------------
# Requirements:
#   - Windows PowerShell
#   - No Node.js required
#   - No external library required
#
# Flow:
#   Zebra Printer (bisa lebih dari 1 pada 1 PC)
#       ↓ TCP 9100
#   PowerShell
#       ↓ HTTP POST (1 request per printer)
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
# PRINTER IDENTITY (serial + model)
# ------------------------------------------------------------
# Diisi otomatis dari printer via TCP setelah koneksi berhasil
# (lihat fungsi Get-PrinterIdentity). Tidak lagi dari config.json.
#
# CATATAN: semua state di blok ini Direset di awal setiap iterasi
# loop printer (lihat Invoke-PrinterCollection), karena satu run
# bisa memproses lebih dari satu printer.
# ------------------------------------------------------------

# IP printer yang sedang diproses (dari config.printers[].ip).
$Script:PrinterIp = $null

$Script:PrinterId = $null
$Script:PrinterModel = $null

# Serial printhead saat ini (diisi otomatis dari printer via TCP;
# null = tidak tersedia / gagal dibaca, lihat Get-PrintheadSerial).
$Script:PrintheadId = $null

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


function Resolve-PrinterList {

    # --------------------------------------------------------
    # NORMALISASI DAFTAR PRINTER
    # --------------------------------------------------------
    # Mendukung DUA bentuk config agar upgrade tidak memutus
    # deployment lama:
    #
    #   BARU (multi) : "printers": [ {...}, {...} ]
    #   LAMA (single): "printer":  { ip, port, ... }
    #
    # Jika "printers" tidak ada tapi "printer" ada, objek lama
    # dibungkus menjadi array 1 elemen.
    #
    # Mengembalikan array PSCustomObject dengan field seragam:
    #   Label, Ip, Port, ConnectionTimeoutMs, ResponseTimeoutMs
    # --------------------------------------------------------

    $Source = $null

    if ($null -ne $Config.printers) {
        $Source = @($Config.printers)
    }
    elseif ($null -ne $Config.printer) {
        $Source = @($Config.printer)
    }

    if ($null -eq $Source) {
        return @()
    }

    # --------------------------------------------------------
    # PENTING: objek di-EMIT langsung ke pipeline (Write-Output)
    # --------------------------------------------------------
    # Jangan kumpulkan ke array lalu "return $array": PowerShell
    # meng-"unwrap" array ber-1-elemen menjadi scalar, sehingga
    # .Count kosong di PS 5.1 dan loop tidak jalan. Dengan emit
    # per objek, caller cukup membungkus hasil dengan @():
    #   0 printer -> @()            -> Count 0
    #   1 printer -> @(obj)         -> Count 1
    #   N printer -> @(obj, obj..)  -> Count N
    # --------------------------------------------------------

    foreach ($Entry in $Source) {

        # Port default: 9100 (port standar raw TCP Zebra).
        $Port = 9100
        if ($null -ne $Entry.port -and "$($Entry.port)".Trim() -ne "") {
            $Port = [int]$Entry.port
        }

        # Timeout default selaras dengan config lama.
        $ConnectTimeout = 5000
        if (
            $null -ne $Entry.connectionTimeoutMs -and
            "$($Entry.connectionTimeoutMs)".Trim() -ne ""
        ) {
            $ConnectTimeout = [int]$Entry.connectionTimeoutMs
        }

        $ResponseTimeout = 5000
        if (
            $null -ne $Entry.responseTimeoutMs -and
            "$($Entry.responseTimeoutMs)".Trim() -ne ""
        ) {
            $ResponseTimeout = [int]$Entry.responseTimeoutMs
        }

        # Label opsional untuk log; fallback = IP.
        $Label = ""
        if ($null -ne $Entry.label) {
            $Label = "$($Entry.label)".Trim()
        }
        if ($Label -eq "") {
            $Label = "$($Entry.ip)".Trim()
        }

        $Ip = ""
        if ($null -ne $Entry.ip) {
            $Ip = "$($Entry.ip)".Trim()
        }

        Write-Output ([pscustomobject]@{
            Label = $Label
            Ip = $Ip
            Port = $Port
            ConnectionTimeoutMs = $ConnectTimeout
            ResponseTimeoutMs = $ResponseTimeout
        })
    }
}


function Test-Configuration {

    # --------------------------------------------------------
    # VALIDASI KONFIGURASI (MODE MULTI-PRINTER)
    # --------------------------------------------------------
    # Wajib:
    #   - api.url
    #   - minimal 1 printer (via "printers" atau "printer" lama)
    #   - tiap printer: ip + port terisi
    #
    # Timeout tiap printer bersifat OPSIONAL — jika kosong akan
    # diisi default oleh Resolve-PrinterList (5000 ms).
    # --------------------------------------------------------

    if ($null -eq $Config.api.url -or "$($Config.api.url)".Trim() -eq "") {

        Write-Log `
            -Message "Configuration: api.url is required and empty." `
            -Level "ERROR"

        return $false
    }

    $Printers = @(Resolve-PrinterList)

    if ($Printers.Count -eq 0) {

        Write-Log `
            -Message "Configuration: no printer configured (need 'printers' array or legacy 'printer' object)." `
            -Level "ERROR"

        return $false
    }

    $HasError = $false

    for ($i = 0; $i -lt $Printers.Count; $i++) {

        $Entry = $Printers[$i]

        if ($Entry.Ip -eq "") {

            Write-Log `
                -Message "Configuration: printers[$i].ip is empty." `
                -Level "ERROR"

            $HasError = $true
        }

        if ($Entry.Port -le 0) {

            Write-Log `
                -Message "Configuration: printers[$i].port is invalid." `
                -Level "ERROR"

            $HasError = $true
        }
    }

    if ($HasError) {
        return $false
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


function Get-PrinterIdentity {

    # --------------------------------------------------------
    # AMBIL IDENTITAS PRINTER VIA TCP (Link-OS getvar)
    # --------------------------------------------------------
    # Serial : ! U1 getvar "usb.device.serial_string"
    #          -> "ABC1234567890"
    # Model  : ! U1 getvar "device.host_identification"
    #          -> "ZT620,V1.0.0,8dpm,4096KB,"
    #          (model = field pertama sebelum koma)
    #
    # Printer membalas "?" jika variabel tidak dikenal /
    # tidak didukung firmware -> dianggap gagal.
    # --------------------------------------------------------

    param (
        [string]$IPAddress,
        [int]$Port,
        [int]$ConnectionTimeoutMs,
        [int]$ResponseTimeoutMs
    )

    # --------------------
    # SERIAL NUMBER
    # --------------------

    Write-Log `
        -Message "Reading printer serial number..."

    $RawSerial = Get-ZebraValue `
        -IPAddress $IPAddress `
        -Port $Port `
        -Command '! U1 getvar "usb.device.serial_string"' `
        -ConnectionTimeoutMs $ConnectionTimeoutMs `
        -ResponseTimeoutMs $ResponseTimeoutMs

    $Serial = $RawSerial.Trim().Trim('"').Trim()

    if ([string]::IsNullOrWhiteSpace($Serial) -or $Serial -eq '?') {
        throw "Serial number not available (response: '$RawSerial')"
    }

    # --------------------
    # MODEL
    # --------------------

    Write-Log `
        -Message "Reading printer model..."

    $RawIdent = Get-ZebraValue `
        -IPAddress $IPAddress `
        -Port $Port `
        -Command '! U1 getvar "device.host_identification"' `
        -ConnectionTimeoutMs $ConnectionTimeoutMs `
        -ResponseTimeoutMs $ResponseTimeoutMs

    # "ZT620,V1.0.0,8dpm,4096KB," -> "ZT620"
    $Model = (
        $RawIdent.Trim().Trim('"') -split ','
    )[0].Trim()

    if ([string]::IsNullOrWhiteSpace($Model) -or $Model -eq '?') {
        throw "Printer model not available (response: '$RawIdent')"
    }

    return @{
        Id = $Serial
        Model = $Model
    }
}


function Get-PrintheadSerial {

    # --------------------------------------------------------
    # AMBIL SERIAL NUMBER PRINTHEAD VIA TCP (Link-OS getvar)
    # --------------------------------------------------------
    # Printhead : ! U1 getvar "device.serial_numbers.printhead"
    #             -> "PH1234567890"
    #
    # Printer membalas "?" jika variabel tidak dikenal /
    # tidak didukung firmware -> dianggap tidak tersedia.
    #
    # Pembacaan ini NON-FATAL (lihat MAIN): gagal membaca
    # tidak menghentikan proses, hanya menghasilkan $null.
    # --------------------------------------------------------

    param (
        [string]$IPAddress,
        [int]$Port,
        [int]$ConnectionTimeoutMs,
        [int]$ResponseTimeoutMs
    )

    $RawPrinthead = Get-ZebraValue `
        -IPAddress $IPAddress `
        -Port $Port `
        -Command '! U1 getvar "device.serial_numbers.printhead"' `
        -ConnectionTimeoutMs $ConnectionTimeoutMs `
        -ResponseTimeoutMs $ResponseTimeoutMs

    $PrintheadSerial = $RawPrinthead.Trim().Trim('"').Trim()

    if (
        [string]::IsNullOrWhiteSpace($PrintheadSerial) -or
        $PrintheadSerial -eq '?'
    ) {
        # Variabel tidak didukung firmware / response kosong.
        return $null
    }

    return $PrintheadSerial
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
    # ipAddress diambil dari $Script:PrinterIp (printer yang
    # sedang diproses pada iterasi loop ini), bukan lagi dari
    # config global — karena kini bisa ada banyak printer.
    # --------------------------------------------------------

    $Meters = @{}

    foreach ($Key in $MeterResults.Keys) {

        $Meters[$Key] = $MeterResults[$Key].value
    }

    $PayloadObject = @{
        printerId = $Script:PrinterId
        model = $Script:PrinterModel
        ipAddress = $Script:PrinterIp
        measuredAt = $Timestamp.ToString("o")

        collectorHostname = $Script:CollectorHostname
        collectorIp = $Script:CollectorIp
        printheadId = $Script:PrintheadId

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


function Invoke-PrinterCollection {

    # --------------------------------------------------------
    # PROSES SATU PRINTER
    # --------------------------------------------------------
    # Alur: test connection -> identity -> printhead ->
    #       collect meters -> send API
    #
    # Mengembalikan objek hasil, BUKAN memanggil exit, agar
    # kegagalan satu printer TIDAK menghentikan printer lain.
    #
    # Arti ExitCode (sama dengan perilaku script lama):
    #   0 = sukses
    #   2 = printer tidak terjangkau
    #   3 = koleksi sukses, pengiriman API gagal
    #   4 = gagal membaca identitas printer
    # --------------------------------------------------------

    param (
        [int]$Index,
        [int]$Total,
        [pscustomobject]$Printer
    )

    # --------------------------------------------------------
    # RESET STATE PRINTER INI
    # --------------------------------------------------------
    # Variabel script-scope dipakai oleh Send-ToApi, jadi wajib
    # direset tiap iterasi agar tidak membawa nilai dari printer
    # sebelumnya. CollectorIp direset agar IP yang dilaporkan
    # = socket yang menjangkau printer INI (beda printer bisa
    # berada di NIC / subnet berbeda).
    # --------------------------------------------------------

    $Script:PrinterIp = $null
    $Script:PrinterId = $null
    $Script:PrinterModel = $null
    $Script:PrintheadId = $null
    $Script:CollectorIp = $null

    $Label = $Printer.Label
    $PrinterIP = $Printer.Ip
    $PrinterPort = $Printer.Port
    $ConnectionTimeoutMs = $Printer.ConnectionTimeoutMs
    $ResponseTimeoutMs = $Printer.ResponseTimeoutMs

    Write-Log "------------------------------------------------------------"
    Write-Log ("Printer {0}/{1} : {2}" -f $Index, $Total, $Label)
    Write-Log "------------------------------------------------------------"
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
            -Message "Printer is unreachable. Skipping to next printer." `
            -Level "ERROR"

        return [pscustomobject]@{
            Index = $Index
            Label = $Label
            Ip = $PrinterIP
            ExitCode = 2
        }
    }

    # --------------------------------------------------------
    # PRINTER IDENTITY (serial + model via TCP)
    # --------------------------------------------------------
    # Diambil langsung dari printer (Link-OS getvar):
    #   serial : ! U1 getvar "usb.device.serial_string"
    #   model  : ! U1 getvar "device.host_identification"
    #
    # Gagal membaca identitas -> catat exit code 4, lanjut ke
    # printer berikutnya (tidak menghentikan seluruh run).
    # --------------------------------------------------------

    try {

        $Identity = Get-PrinterIdentity `
            -IPAddress $PrinterIP `
            -Port $PrinterPort `
            -ConnectionTimeoutMs $ConnectionTimeoutMs `
            -ResponseTimeoutMs $ResponseTimeoutMs
    }
    catch {

        Write-Log `
            -Message "Failed to read printer identity: $($_.Exception.Message)" `
            -Level "ERROR"

        return [pscustomobject]@{
            Index = $Index
            Label = $Label
            Ip = $PrinterIP
            ExitCode = 4
        }
    }

    $Script:PrinterIp = $PrinterIP
    $Script:PrinterId = $Identity.Id
    $Script:PrinterModel = $Identity.Model

    Write-Log "Printer ID    : $Script:PrinterId"
    Write-Log "Printer Model : $Script:PrinterModel"

    # --------------------------------------------------------
    # PRINTHEAD SERIAL (via TCP)
    # --------------------------------------------------------
    # Diambil langsung dari printer (Link-OS getvar):
    #   printhead : ! U1 getvar "device.serial_numbers.printhead"
    #
    # NON-FATAL: gagal membaca / variabel tidak didukung ->
    # diisi null + WARNING, proses tetap lanjut.
    # --------------------------------------------------------

    Write-Log `
        -Message "Reading printhead serial number..."

    try {

        $Script:PrintheadId = Get-PrintheadSerial `
            -IPAddress $PrinterIP `
            -Port $PrinterPort `
            -ConnectionTimeoutMs $ConnectionTimeoutMs `
            -ResponseTimeoutMs $ResponseTimeoutMs

        if ($null -eq $Script:PrintheadId) {

            Write-Log `
                -Message "Printhead serial not available. Field printheadId will be null." `
                -Level "WARNING"
        }
        else {
            Write-Log "Printhead ID   : $Script:PrintheadId"
        }
    }
    catch {

        $Script:PrintheadId = $null

        Write-Log `
            -Message "Failed to read printhead serial: $($_.Exception.Message)" `
            -Level "WARNING"
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

    $ApiOK = Send-ToApi `
        -MeterResults $MeterResults

    if (-not $ApiOK) {

        Write-Log `
            -Message "Meter collection completed but API delivery failed for $Label." `
            -Level "ERROR"

        return [pscustomobject]@{
            Index = $Index
            Label = $Label
            Ip = $PrinterIP
            ExitCode = 3
        }
    }

    Write-Log "Meter collection completed successfully for $Label."

    return [pscustomobject]@{
        Index = $Index
        Label = $Label
        Ip = $PrinterIP
        ExitCode = 0
    }
}


function Write-PrinterSummary {

    # --------------------------------------------------------
    # RINGKASAN HASIL PER PRINTER (di akhir run)
    # --------------------------------------------------------

    param (
        [array]$Results
    )

    Write-Log "============================================================"
    Write-Log "SUMMARY"
    Write-Log "============================================================"

    foreach ($Item in $Results) {

        if ($Item.ExitCode -eq 0) {
            $Status = "OK"
        }
        else {
            $Status = "FAILED (exit code $($Item.ExitCode))"
        }

        Write-Log ("  [{0}] {1,-20} {2,-16} {3}" -f `
            $Item.Index, $Item.Label, $Item.Ip, $Status)
    }

    $SuccessCount = @(
        $Results | Where-Object { $_.ExitCode -eq 0 }
    ).Count

    Write-Log ("Printers succeeded: {0} / {1}" -f `
        $SuccessCount, $Results.Count)

    Write-Log "============================================================"
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

    # --------------------------------------------------------
    # RESOLVE DAFTAR PRINTER
    # --------------------------------------------------------
    # Mendukung DUA bentuk config:
    #   - "printers" : array (multi)  -> diproses berurutan
    #   - "printer"  : objek (legacy) -> otomatis jadi 1 elemen
    # --------------------------------------------------------

    # --------------------------------------------------------
    # PENTING: bungkus dengan @() agar SELALU array, meski
    # Resolve-PrinterList hanya mengembalikan 1 printer.
    # Tanpa ini loop tidak jalan bila hanya ada 1 printer.
    # --------------------------------------------------------

    $Printers = @(Resolve-PrinterList)

    Write-Log ("Printers configured : {0}" -f $Printers.Count)

    # --------------------------------------------------------
    # LOOP PER PRINTER
    # --------------------------------------------------------
    # Kegagalan satu printer TIDAK menghentikan printer lain.
    # Hasil tiap printer dikumpulkan, lalu dirangkum di akhir
    # run untuk menentukan exit code agregat.
    # --------------------------------------------------------

    $Results = @()

    for ($i = 0; $i -lt $Printers.Count; $i++) {

        $Outcome = Invoke-PrinterCollection `
            -Index ($i + 1) `
            -Total $Printers.Count `
            -Printer $Printers[$i]

        $Results += $Outcome
    }

    # --------------------------------------------------------
    # SUMMARY (per printer)
    # --------------------------------------------------------

    Write-PrinterSummary -Results $Results

    # --------------------------------------------------------
    # AGGREGATE EXIT CODE
    # --------------------------------------------------------
    # 0 = semua printer sukses.
    # Selain itu = exit code dari printer PERTAMA yang gagal
    # (berdasar urutan di config), sehingga monitoring tetap
    # mendapat sinyal gagal tanpa kehilangan konteks printer
    # mana yang bermasalah (lihat SUMMARY di atas).
    # --------------------------------------------------------

    $FirstFailure = $Results |
        Where-Object { $_.ExitCode -ne 0 } |
        Select-Object -First 1

    if ($null -eq $FirstFailure) {

        Write-Log "Meter collection completed successfully."

        exit 0
    }

    Write-Log `
        -Message ("Completed with failure(s). First failed printer: " +
                  "{0} ({1}) -> exit code {2}." -f `
            $FirstFailure.Label, $FirstFailure.Ip, $FirstFailure.ExitCode) `
        -Level "ERROR"

    exit $FirstFailure.ExitCode
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