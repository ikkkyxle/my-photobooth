# Attach a tethered Canon EOS body to WSL2 over USB/IP.
#
# WHY THIS IS NEEDED
# ------------------
# WSL2 runs its own Linux kernel inside a VM with no physical USB controller.
# A camera plugged into the Windows host is invisible to Linux until it is
# forwarded over USB/IP. usbipd-win runs the server on Windows; the WSL side
# attaches it with the in-kernel vhci-hcd driver.
#
# Supported bodies (verified on this machine):
#   Canon EOS M100   -> USB 04a9:32d1
#   Canon EOS 3000D  -> USB 04a9:32d9  (same body as EOS 4000D / Rebel T100)
#
# MUST BE RUN FROM AN ELEVATED (Administrator) POWERSHELL ON WINDOWS.
# Binding a device is a one-time, persistent operation; attaching must be
# repeated every time the camera is unplugged or the machine reboots.
#
# Usage (Administrator PowerShell):
#     .\scripts\attach-camera.ps1              # auto-detect and attach
#     .\scripts\attach-camera.ps1 -List        # just show devices
#     .\scripts\attach-camera.ps1 -Detach      # hand the camera back to Windows
#     .\scripts\attach-camera.ps1 -BusId 2-9   # force a specific bus id

[CmdletBinding()]
param(
    [switch]$List,
    [switch]$Detach,
    [string]$BusId,
    [string]$Distribution
)

$ErrorActionPreference = 'Stop'

# Canon bodies this project drives, per libgphoto2 camlibs/ptp2/library.c.
$SupportedCameras = @(
    [pscustomobject]@{ HardwareId = '04a9:32d1'; Name = 'Canon EOS M100' }
    [pscustomobject]@{ HardwareId = '04a9:32d9'; Name = 'Canon EOS 3000D / 4000D / Rebel T100' }
)

function Write-Step($message) { Write-Host "==> $message" -ForegroundColor Cyan }
function Write-Ok($message)   { Write-Host "  OK  $message" -ForegroundColor Green }
function Write-Warn($message) { Write-Host "  !!  $message" -ForegroundColor Yellow }
function Write-Err($message)  { Write-Host "  XX  $message" -ForegroundColor Red }

function Test-Admin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Test-Usbipd {
    $cmd = Get-Command usbipd -ErrorAction SilentlyContinue
    return $null -ne $cmd
}

function Install-Usbipd {
    Write-Step 'Installing usbipd-win'
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        Write-Err 'winget is unavailable. Install usbipd-win manually:'
        Write-Host '      https://github.com/dorssel/usbipd-win/releases'
        exit 1
    }

    winget install --exact --id dorssel.usbipd-win `
        --accept-source-agreements --accept-package-agreements

    Write-Warn 'usbipd installs a service and extends PATH.'
    Write-Warn 'Close this window, open a NEW Administrator PowerShell, and run this script again.'
    exit 0
}

function Get-CameraBusId {
    $output = usbipd list
    # Rows look like:  2-9    04a9:32d9  Canon EOS 3000D    Not shared
    foreach ($line in $output) {
        foreach ($camera in $SupportedCameras) {
            if ($line -match "^\s*(\d+-\d+)\s+$($camera.HardwareId)\s+(.*?)\s{2,}(.*?)\s*$") {
                return [pscustomobject]@{
                    BusId       = $Matches[1]
                    Description = $Matches[2].Trim()
                    State       = $Matches[3].Trim()
                    HardwareId  = $camera.HardwareId
                }
            }
        }
    }
    return $null
}

# ---------------------------------------------------------------------------

if (-not (Test-Usbipd)) { Install-Usbipd }

if ($List) {
    Write-Step 'USB devices visible to usbipd'
    usbipd list
    Write-Host ''
    $camera = Get-CameraBusId
    if ($camera) {
        Write-Ok "$($camera.Description) found on bus $($camera.BusId) -- state: $($camera.State)"
    } else {
        Write-Warn "No supported camera found. Is it plugged in and switched ON?"
        $SupportedCameras | ForEach-Object { Write-Host "      expected $($_.HardwareId)  $($_.Name)" }
    }
    exit 0
}

if (-not (Test-Admin)) {
    Write-Err 'Administrator rights are required to bind or attach a USB device.'
    Write-Host '      Right-click PowerShell -> "Run as administrator", then re-run this script.'
    exit 1
}

$camera = Get-CameraBusId
if ($BusId) {
    Write-Warn "Using operator-supplied bus id $BusId"
    $target = $BusId
} elseif ($camera) {
    $target = $camera.BusId
    Write-Ok "Found $($camera.Description) on bus $target"
} else {
    Write-Err 'Could not find a supported Canon camera on the USB bus.'
    $SupportedCameras | ForEach-Object { Write-Host "      expected $($_.HardwareId)  $($_.Name)" }
    Write-Host ''
    Write-Host 'Checklist:'
    Write-Host '  1. Camera is switched ON (it does not enumerate while off).'
    Write-Host '  2. Correct cable: EOS M100 uses Micro-B; EOS 3000D uses Mini-B (IFC-400PCU).'
    Write-Host '  2b. EOS 3000D only: MENU > Wi-Fi must be Disable, or the USB path stays dead.'
    Write-Host '  3. The cable carries data, not power only. Charge-only cables have no data pins.'
    Write-Host '  4. An SD card is inserted; some EOS bodies refuse PTP without one.'
    Write-Host ''
    Write-Host 'Current device list:'
    usbipd list
    exit 1
}

if ($Detach) {
    Write-Step "Detaching bus $target and returning it to Windows"
    usbipd detach --busid $target
    usbipd unbind --busid $target
    Write-Ok 'Camera released back to Windows.'
    exit 0
}

Write-Step "Binding bus $target for sharing"
# Binding is idempotent but noisy when already bound, so tolerate failure here.
try {
    usbipd bind --busid $target
    Write-Ok 'Device bound.'
} catch {
    Write-Warn 'Bind reported an error (usually means it was already bound). Continuing.'
}

Write-Step "Attaching bus $target to WSL"
$attachArgs = @('attach', '--wsl', '--busid', $target)
if ($Distribution) { $attachArgs = @('attach', "--wsl=$Distribution", '--busid', $target) }

usbipd $attachArgs
Write-Ok 'Attach command issued.'

Write-Host ''
Write-Step 'Verifying from inside WSL'
wsl -- bash -lc 'lsusb 2>/dev/null | grep -iE "04a9:(32d1|32d9)" || echo "NOT VISIBLE IN WSL YET"'

Write-Host ''
Write-Host 'Next steps inside WSL:' -ForegroundColor Cyan
Write-Host '  bash scripts/setup-camera-wsl.sh     # install gphoto2 (first time only)'
Write-Host '  bash scripts/verify-camera.sh        # confirm capture + live view work'
Write-Host '  npm run dev                          # bridge + React app together'
Write-Host ''
Write-Warn 'Re-run this script after every unplug or reboot; attachments do not persist.'
