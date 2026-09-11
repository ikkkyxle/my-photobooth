#!/usr/bin/env bash
#
# Fix non-root USB access for the tethered Canon body, then prove it works.
#
# WHY THIS IS NEEDED
# ------------------
# On this machine gphoto2 detected the camera fine:
#
#     Canon EOS 4000D    usb:001,003
#
# but every real operation failed with:
#
#     An error occurred in the io-library ('I/O problem')
#     *** Error (-7: 'I/O problem') ***
#
# Root cause: the USB device node is root-only.
#
#     $ ls -l /dev/bus/usb/001/003
#     crw------- 1 root root 189, 2 ...
#
# The pre-existing udev rule only covered 0x32d1 (EOS M100), so the EOS 3000D
# (0x32d9) never got relaxed permissions. gphoto2 could read the descriptor via
# the generic bus scan but could not claim the interface.
#
# This script installs a rule covering every supported body, reloads udev, and
# then verifies the fix by actually talking to the camera.
#
# Run it once. It needs sudo, so it will prompt for your password.
#
#     bash scripts/fix-camera-permissions.sh

set -uo pipefail

VENDOR_ID="04a9"
# 32d1 = EOS M100, 32d9 = EOS 3000D / 4000D / Rebel T100
PRODUCT_IDS="32d1 32d9"
RULE_PATH="/etc/udev/rules.d/90-canon-eos-photobooth.rules"
OLD_RULE="/etc/udev/rules.d/90-canon-eos-m100.rules"

bold=$'\033[1m'; red=$'\033[31m'; green=$'\033[32m'
yellow=$'\033[33m'; cyan=$'\033[36m'; reset=$'\033[0m'
step() { printf '\n%s==> %s%s\n' "$cyan" "$*" "$reset"; }
ok()   { printf '  %sOK%s    %s\n' "$green" "$reset" "$*"; }
bad()  { printf '  %sFAIL%s  %s\n' "$red" "$reset" "$*"; }
warn() { printf '  %s!!%s    %s\n' "$yellow" "$reset" "$*"; }
note() { printf '        %s\n' "$*"; }

USB_RE="$VENDOR_ID:($(printf '%s' "$PRODUCT_IDS" | tr ' ' '|'))"

# usbipd lives on the Windows side. WSL can invoke it through /mnt/c.
USBIPD="/mnt/c/Program Files/usbipd-win/usbipd.exe"

is_wsl() { grep -qiE 'microsoft|wsl' /proc/version 2>/dev/null; }

# Try to (re)attach the camera from Windows automatically.
#
# WSL2 drops USB/IP attachments regularly: whenever the camera powers down, the
# cable is touched, the WSL VM idles, or usbipd restarts. The device stays
# "Shared" on the Windows side but disappears from the Linux bus, so this is by
# far the most common reason the photobooth suddenly stops seeing the camera.
# Rather than telling the operator to run PowerShell by hand, do it here.
try_auto_attach() {
  is_wsl || return 1
  [ -x "$USBIPD" ] || { note "usbipd not found at $USBIPD"; return 1; }

  local listing busid
  listing="$("$USBIPD" list 2>/dev/null | tr -d '\r')"
  busid="$(printf '%s\n' "$listing" \
    | grep -iE "$USB_RE" \
    | head -n1 \
    | sed -E 's/^[[:space:]]*([0-9]+-[0-9]+).*/\1/')"

  if [ -z "$busid" ]; then
    note "no supported Canon body in 'usbipd list' either"
    note "check: camera ON, Wi-Fi Disable, Auto power off Disable, cable seated"
    return 1
  fi

  warn "camera is on Windows bus $busid but not attached to WSL; attaching now"
  "$USBIPD" attach --wsl --busid "$busid" 2>&1 | sed 's/^/        /'

  # Give the kernel a moment to enumerate the freshly attached device.
  local i
  for i in 1 2 3 4 5 6 7 8; do
    sleep 1
    if lsusb 2>/dev/null | grep -qiE "$USB_RE"; then
      ok "attached: $(lsusb | grep -iE "$USB_RE" | head -n1)"
      return 0
    fi
  done

  bad "attach command ran but the camera still is not on the WSL bus"
  note "If it says 'access denied', run this once in an Administrator PowerShell:"
  note "  & '$(printf '%s' "$USBIPD" | sed 's|/mnt/c|C:|; s|/|\\\\|g')' bind --busid $busid"
  return 1
}

printf '%s\n' "${bold}Fix Canon USB permissions for the photobooth${reset}"

# ---------------------------------------------------------------------------
step "1/5  Camera present on the WSL USB bus?"
if ! lsusb 2>/dev/null | grep -qiE "$USB_RE"; then
  warn "not on the WSL bus yet"
  if ! try_auto_attach; then
    bad "No Canon camera on the bus."
    note "Forward it from Windows (Administrator PowerShell):"
    note "  & 'C:\\Program Files\\usbipd-win\\usbipd.exe' list"
    note "  & 'C:\\Program Files\\usbipd-win\\usbipd.exe' attach --wsl --busid <id>"
    exit 1
  fi
else
  ok "$(lsusb | grep -iE "$USB_RE" | head -n1)"
fi

BUS_DEV="$(lsusb | grep -iE "$USB_RE" | head -n1 | sed -E 's/^Bus ([0-9]+) Device ([0-9]+).*/\1\/\2/')"
NODE="/dev/bus/usb/$BUS_DEV"
[ -e "$NODE" ] && note "device node: $NODE ($(stat -c '%A %U:%G' "$NODE"))"

# ---------------------------------------------------------------------------
step "2/5  Installing udev rule for every supported body"
{
  printf '# Canon EOS (PTP). Non-root tethered access for the photobooth.\n'
  printf '# 32d1 = EOS M100, 32d9 = EOS 3000D / 4000D / Rebel T100\n'
  for pid in $PRODUCT_IDS; do
    printf 'SUBSYSTEM=="usb", ATTR{idVendor}=="%s", ATTR{idProduct}=="%s", MODE="0666", GROUP="plugdev"\n' \
      "$VENDOR_ID" "$pid"
  done
} | sudo tee "$RULE_PATH" >/dev/null || { bad "could not write $RULE_PATH"; exit 1; }
ok "wrote $RULE_PATH"
sudo sed 's/^/      /' "$RULE_PATH"

if [ -f "$OLD_RULE" ]; then
  sudo rm -f "$OLD_RULE" && ok "removed superseded $OLD_RULE"
fi

# ---------------------------------------------------------------------------
step "3/5  Reloading udev and relaxing the current node"
sudo udevadm control --reload-rules 2>/dev/null && ok "rules reloaded" \
  || warn "udevadm reload failed (common on WSL)"
sudo udevadm trigger --subsystem-match=usb 2>/dev/null && ok "triggered usb subsystem" \
  || warn "udevadm trigger failed (common on WSL)"

# WSL often does not re-run udev for already-attached devices, so fix the live
# node directly. Without this you would have to detach and re-attach the camera.
if [ -e "$NODE" ]; then
  sudo chmod 0666 "$NODE" && ok "chmod 0666 $NODE -> $(stat -c '%A' "$NODE")"
fi

# ---------------------------------------------------------------------------
step "4/5  Stopping anything that competes for the camera"
KILLED=0
for proc in gvfs-gphoto2-volume-monitor gvfsd-gphoto2 gphoto2-volume-monitor; do
  if pgrep -x "$proc" >/dev/null 2>&1; then
    pkill -x "$proc" 2>/dev/null && { warn "stopped $proc"; KILLED=1; }
  fi
done
[ "$KILLED" -eq 0 ] && ok "no gvfs/auto-mount daemon holding the interface"

# ---------------------------------------------------------------------------
step "5/5  Proving it works (this is the real test)"
SUMMARY="$(timeout 30 gphoto2 --summary 2>&1)"
if printf '%s' "$SUMMARY" | grep -qiE "I/O problem|Could not claim|error"; then
  bad "camera still not fully accessible"
  printf '%s\n' "$SUMMARY" | sed 's/^/        /' | head -n 12
  note "If it says 'Could not claim', detach and re-attach from Windows:"
  note "  usbipd detach --busid <id> ; usbipd attach --wsl --busid <id>"
  exit 1
fi

ok "gphoto2 --summary succeeded"
printf '%s\n' "$SUMMARY" | grep -iE "Model|Manufacturer|Serial|Capture Formats|Device Capabilities" \
  | sed 's/^/        /'

printf '\n%sPermissions are fixed.%s Next: bash scripts/verify-camera.sh\n' "$green" "$reset"
