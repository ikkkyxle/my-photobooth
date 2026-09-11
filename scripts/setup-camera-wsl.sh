#!/usr/bin/env bash
#
# Install and configure everything the Linux/WSL side needs to talk to the
# Canon EOS M100 over USB.
#
# The M100 speaks PTP with Canon's EOS extensions. libgphoto2 handles that
# protocol and declares the camera as:
#
#     { "Canon:EOS M100", 0x04a9, 0x32d1, PTP_CAP | PTP_CAP_PREVIEW }
#
# PTP_CAP         -> tethered still capture
# PTP_CAP_PREVIEW -> live view preview frames
#
# EOS M capture support requires libgphoto2 >= 2.5.19. Older builds detect the
# camera but fail every shutter release with "Unsupported operation".
#
# Usage:
#     bash scripts/setup-camera-wsl.sh

set -euo pipefail

VENDOR_ID="04a9"
# Supported: 32d1 = EOS M100, 32d9 = EOS 3000D/4000D/Rebel T100
PRODUCT_IDS="32d1 32d9"
MIN_LIBGPHOTO2="2.5.19"

bold=$'\033[1m'; red=$'\033[31m'; green=$'\033[32m'
yellow=$'\033[33m'; cyan=$'\033[36m'; reset=$'\033[0m'

step() { printf '%s==> %s%s\n' "$cyan" "$*" "$reset"; }
ok()   { printf '  %sOK%s  %s\n' "$green" "$reset" "$*"; }
warn() { printf '  %s!!%s  %s\n' "$yellow" "$reset" "$*"; }
err()  { printf '  %sXX%s  %s\n' "$red" "$reset" "$*"; }

is_wsl() { grep -qiE 'microsoft|wsl' /proc/version 2>/dev/null; }

version_lt() {
  # version_lt A B -> true when A < B
  [ "$1" != "$2" ] && [ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | head -n1)" = "$1" ]
}

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  if command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
  else
    err "This script needs root privileges and sudo is not installed."
    exit 1
  fi
fi

printf '%s\n' "${bold}Canon EOS M100 tethering setup${reset}"
printf 'target devices: Canon Inc. USB %s:{%s}\n' "$VENDOR_ID" "$PRODUCT_IDS"
printf '  32d1 = EOS M100      32d9 = EOS 3000D / 4000D / Rebel T100\n\n'

# ---------------------------------------------------------------------------
step "Checking environment"

if is_wsl; then
  ok "WSL detected: $(uname -r)"
  warn "WSL2 has no physical USB bus. The camera must be forwarded with usbipd-win."
  warn "Run scripts/attach-camera.ps1 from an Administrator PowerShell on Windows."
  IS_WSL=1
else
  ok "Native Linux: $(uname -r)"
  IS_WSL=0
fi

# ---------------------------------------------------------------------------
step "Installing packages"

PACKAGES=(gphoto2 libgphoto2-dev ffmpeg)
if [ "$IS_WSL" -eq 1 ]; then
  # linux-tools-generic provides the usbip client used to attach forwarded devices.
  PACKAGES+=(usbutils linux-tools-generic hwdata)
else
  PACKAGES+=(usbutils)
fi

if command -v apt-get >/dev/null 2>&1; then
  $SUDO apt-get update -qq
  $SUDO DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "${PACKAGES[@]}"
  ok "Installed: ${PACKAGES[*]}"
elif command -v dnf >/dev/null 2>&1; then
  $SUDO dnf install -y gphoto2 libgphoto2-devel ffmpeg usbutils
  ok "Installed via dnf"
elif command -v pacman >/dev/null 2>&1; then
  $SUDO pacman -S --needed --noconfirm gphoto2 libgphoto2 ffmpeg usbutils
  ok "Installed via pacman"
else
  err "No supported package manager found. Install gphoto2 and ffmpeg manually."
  exit 1
fi

# ---------------------------------------------------------------------------
step "Verifying libgphoto2 version"

if ! command -v gphoto2 >/dev/null 2>&1; then
  err "gphoto2 is still not on PATH after installation."
  exit 1
fi

LIB_VERSION="$(gphoto2 --version 2>/dev/null | sed -n 's/.*libgphoto2[[:space:]]\+\([0-9.]\+\).*/\1/p' | head -n1)"
if [ -z "$LIB_VERSION" ]; then
  warn "Could not parse the libgphoto2 version. Continuing anyway."
elif version_lt "$LIB_VERSION" "$MIN_LIBGPHOTO2"; then
  err "libgphoto2 $LIB_VERSION is too old. EOS M capture needs >= $MIN_LIBGPHOTO2."
  warn "Detection will work but every capture will fail with 'Unsupported operation'."
  warn "Build a newer libgphoto2 from source: https://github.com/gphoto/libgphoto2"
else
  ok "libgphoto2 $LIB_VERSION supports EOS M capture (>= $MIN_LIBGPHOTO2)"
fi

# ---------------------------------------------------------------------------
step "Confirming the camera is in the supported device list"

if gphoto2 --list-cameras 2>/dev/null | grep -qi "EOS M100"; then
  ok "Canon EOS M100 is present in this libgphoto2 build's camera list"
else
  warn "EOS M100 not found in --list-cameras. Generic PTP capture may still work."
fi

# ---------------------------------------------------------------------------
step "Granting non-root access to the camera"

# Without this rule the device node is root-only and gphoto2 fails with
# "Could not claim the USB device" when run as a normal user.
UDEV_RULE="/etc/udev/rules.d/90-canon-eos-photobooth.rules"
{
  printf '# Canon EOS (PTP). Non-root tethered access for the photobooth.\n'
  for pid in $PRODUCT_IDS; do
    printf 'SUBSYSTEM=="usb", ATTR{idVendor}=="%s", ATTR{idProduct}=="%s", MODE="0666", GROUP="plugdev"\n' \
      "$VENDOR_ID" "$pid"
  done
} | $SUDO tee "$UDEV_RULE" >/dev/null
ok "Wrote $UDEV_RULE"

if command -v udevadm >/dev/null 2>&1; then
  $SUDO udevadm control --reload-rules 2>/dev/null || warn "udevadm reload failed (harmless on WSL)"
  $SUDO udevadm trigger 2>/dev/null || true
fi

if getent group plugdev >/dev/null 2>&1; then
  if id -nG "$USER" | tr ' ' '\n' | grep -qx plugdev; then
    ok "$USER is already in the plugdev group"
  else
    $SUDO usermod -aG plugdev "$USER"
    warn "Added $USER to plugdev. Log out and back in for it to take effect."
  fi
fi

# ---------------------------------------------------------------------------
step "Disabling desktop auto-mount handlers"

# gvfs and gnome's volume monitor grab PTP cameras the moment they appear and
# hold the USB interface, which makes gphoto2 fail to claim the device.
KILLED=0
for proc in gvfs-gphoto2-volume-monitor gvfsd-gphoto2 gphoto2-volume-monitor; do
  if pgrep -x "$proc" >/dev/null 2>&1; then
    pkill -x "$proc" 2>/dev/null && KILLED=1
    warn "Stopped $proc (it holds the camera's USB interface)"
  fi
done
[ "$KILLED" -eq 0 ] && ok "No conflicting auto-mount daemons are running"

# ---------------------------------------------------------------------------
step "Looking for the camera"

USB_RE="$VENDOR_ID:($(printf '%s' "$PRODUCT_IDS" | tr ' ' '|'))"
if command -v lsusb >/dev/null 2>&1 && lsusb 2>/dev/null | grep -qiE "$USB_RE"; then
  ok "Camera visible on the USB bus:"
  lsusb | grep -iE "$USB_RE" | sed 's/^/      /'
else
  warn "Camera not on the USB bus yet."
  if [ "$IS_WSL" -eq 1 ]; then
    printf '\n%sTo forward it from Windows:%s\n' "$bold" "$reset"
    printf '  1. Open PowerShell as Administrator on Windows\n'
    printf '  2. cd to this project\n'
    printf '  3. .\\scripts\\attach-camera.ps1\n'
  fi
fi

printf '\n%sSetup finished.%s\n\n' "$green" "$reset"
printf 'Next:\n'
printf '  bash scripts/verify-camera.sh     # end-to-end hardware check\n'
printf '  npm run dev                       # bridge + React app\n'
