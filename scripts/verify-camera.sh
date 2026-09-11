#!/usr/bin/env bash
#
# End-to-end hardware check for the Canon EOS M100 tether.
#
# Runs the same operations the photobooth relies on, in the same order, and
# explains exactly what to fix when a step fails. Every failure mode here was
# observed in the wild on EOS M bodies:
#
#   - camera off / cable is charge-only        -> device never enumerates
#   - Mini-B cable instead of Micro-B          -> connector does not fit
#   - gvfs auto-mounted the camera             -> "Could not claim the USB device"
#   - libgphoto2 older than 2.5.19             -> "Unsupported operation"
#   - camera in movie mode                     -> capture refused
#   - nothing to focus on                      -> "Perhaps no focus?"
#   - no SD card                               -> some bodies refuse PTP entirely
#
# Usage:
#     bash scripts/verify-camera.sh
#     bash scripts/verify-camera.sh --no-capture   # skip the shutter release

set -uo pipefail

VENDOR_ID="04a9"
# Supported: 32d1 = EOS M100, 32d9 = EOS 3000D/4000D/Rebel T100
PRODUCT_IDS="32d1 32d9"
MIN_LIBGPHOTO2="2.5.19"
USB_RE="$VENDOR_ID:($(printf '%s' "$PRODUCT_IDS" | tr ' ' '|'))"
DO_CAPTURE=1
[ "${1:-}" = "--no-capture" ] && DO_CAPTURE=0

bold=$'\033[1m'; red=$'\033[31m'; green=$'\033[32m'
yellow=$'\033[33m'; cyan=$'\033[36m'; reset=$'\033[0m'

PASS=0; FAIL=0; SKIP=0
step() { printf '\n%s==> %s%s\n' "$cyan" "$*" "$reset"; }
ok()   { printf '  %sPASS%s  %s\n' "$green" "$reset" "$*"; PASS=$((PASS+1)); }
bad()  { printf '  %sFAIL%s  %s\n' "$red" "$reset" "$*"; FAIL=$((FAIL+1)); }
skip() { printf '  %sSKIP%s  %s\n' "$yellow" "$reset" "$*"; SKIP=$((SKIP+1)); }
note() { printf '        %s\n' "$*"; }

WORKDIR="$(mktemp -d)"
cleanup() {
  rm -rf "$WORKDIR"
  # Never leave a live-view process holding the USB interface.
  pkill -INT -f 'gphoto2 --.*capture-movie' 2>/dev/null || true
}
trap cleanup EXIT

version_lt() {
  [ "$1" != "$2" ] && [ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | head -n1)" = "$1" ]
}

printf '%s\n' "${bold}Canon EOS M100 tether verification${reset}"
printf 'expecting Canon USB %s:{%s}  (32d1=M100, 32d9=3000D/4000D)\n' "$VENDOR_ID" "$PRODUCT_IDS"

# ---------------------------------------------------------------------------
step "1/7  gphoto2 present"
if command -v gphoto2 >/dev/null 2>&1; then
  ok "$(gphoto2 --version 2>/dev/null | head -n1)"
else
  bad "gphoto2 not installed"
  note "Fix: bash scripts/setup-camera-wsl.sh"
  printf '\n%sCannot continue without gphoto2.%s\n' "$red" "$reset"
  exit 1
fi

# ---------------------------------------------------------------------------
step "2/7  libgphoto2 supports EOS M capture"
LIB_VERSION="$(gphoto2 --version 2>/dev/null | sed -n 's/.*libgphoto2[[:space:]]\+\([0-9.]\+\).*/\1/p' | head -n1)"
if [ -z "$LIB_VERSION" ]; then
  skip "could not parse libgphoto2 version"
elif version_lt "$LIB_VERSION" "$MIN_LIBGPHOTO2"; then
  bad "libgphoto2 $LIB_VERSION < $MIN_LIBGPHOTO2"
  note "EOS M capture was added in $MIN_LIBGPHOTO2. Detection works but capture will not."
else
  ok "libgphoto2 $LIB_VERSION"
fi

# ---------------------------------------------------------------------------
step "3/7  camera enumerated on the USB bus"
if ! command -v lsusb >/dev/null 2>&1; then
  skip "lsusb unavailable (install usbutils)"
elif lsusb 2>/dev/null | grep -qiE "$USB_RE"; then
  ok "$(lsusb | grep -iE "$USB_RE" | head -n1)"
else
  bad "no Canon USB device ($VENDOR_ID:{$PRODUCT_IDS})"
  if grep -qiE 'microsoft|wsl' /proc/version 2>/dev/null; then
    note "WSL2 has no physical USB bus. Forward the device from Windows:"
    note "  Administrator PowerShell -> .\\scripts\\attach-camera.ps1"
    note "Or directly, using the verified bus id from 'usbipd list':"
    note "  usbipd bind --busid <id>   (Administrator, one time)"
    note "  usbipd attach --wsl --busid <id>"
  fi
  note "Also check: camera switched ON, cable is USB-A to Micro-B (NOT Mini-B),"
  note "and the cable carries data rather than being charge-only."
fi

# ---------------------------------------------------------------------------
step "4/7  no process is holding the camera"
HOLDERS=""
for proc in gvfs-gphoto2-volume-monitor gvfsd-gphoto2 gphoto2-volume-monitor; do
  pgrep -x "$proc" >/dev/null 2>&1 && HOLDERS="$HOLDERS $proc"
done
if [ -n "$HOLDERS" ]; then
  bad "conflicting daemons running:$HOLDERS"
  note "Fix: pkill$HOLDERS"
  note "These auto-mount PTP cameras and cause 'Could not claim the USB device'."
else
  ok "no gvfs/auto-mount daemon competing for the interface"
fi

# ---------------------------------------------------------------------------
step "5/7  gphoto2 auto-detect"
DETECT="$(gphoto2 --auto-detect 2>&1)"
MODEL="$(printf '%s\n' "$DETECT" | awk 'NR>2 && NF>1 { sub(/[[:space:]]{2,}(usb|ptpip|disk):.*$/,""); if (length($0)) { print; exit } }')"
PORT="$(printf '%s\n' "$DETECT" | grep -oE '(usb|ptpip|disk):[^[:space:]]*' | head -n1)"

if [ -n "$MODEL" ]; then
  ok "detected: $MODEL on ${PORT:-unknown port}"
  case "$MODEL" in
    *"EOS M100"*) ok "model matches the expected EOS M100" ;;
    *) skip "detected '$MODEL' instead of an EOS M100; generic PTP may still work" ;;
  esac
else
  bad "gphoto2 detected no camera"
  printf '%s\n' "$DETECT" | sed 's/^/        /'
fi

# ---------------------------------------------------------------------------
step "6/7  capability flags (PTP_CAP / PTP_CAP_PREVIEW)"
if [ -z "$MODEL" ]; then
  skip "no camera to query"
else
  ABILITIES="$(gphoto2 --abilities 2>&1)"
  if printf '%s\n' "$ABILITIES" | grep -qiE '^\s*:\s*Image\s*$|Capture choices'; then
    printf '%s\n' "$ABILITIES" | sed -n '/Capture choices/,/^[A-Z]/p' | sed 's/^/        /'
  fi
  if printf '%s\n' "$ABILITIES" | grep -qi 'Image'; then
    ok "still capture advertised (PTP_CAP)"
  else
    bad "still capture not advertised"
  fi
  if printf '%s\n' "$ABILITIES" | grep -qi 'Preview'; then
    ok "live view preview advertised (PTP_CAP_PREVIEW)"
  else
    bad "preview not advertised; the MJPEG stream will not work"
    note "Put the camera in still-image mode, not movie mode."
  fi
fi

# ---------------------------------------------------------------------------
step "7/7  live view + still capture"
if [ -z "$MODEL" ]; then
  skip "no camera to exercise"
elif [ "$DO_CAPTURE" -eq 0 ]; then
  skip "capture skipped by --no-capture"
else
  # Live view: grab ~2 seconds of preview and count JPEG start markers.
  MOVIE="$WORKDIR/preview.mjpg"
  timeout 8 gphoto2 --set-config output=PC --capture-movie=2s --stdout > "$MOVIE" 2>"$WORKDIR/movie.err"
  FRAMES=0
  if [ -s "$MOVIE" ]; then
    FRAMES="$(python3 - "$MOVIE" <<'PY' 2>/dev/null || echo 0
import sys
data = open(sys.argv[1], 'rb').read()
print(data.count(b'\xff\xd8\xff'))
PY
)"
  fi
  if [ "${FRAMES:-0}" -gt 0 ]; then
    ok "live view produced $FRAMES JPEG frames ($(stat -c%s "$MOVIE") bytes)"
  else
    bad "live view produced no frames"
    sed 's/^/        /' "$WORKDIR/movie.err" | tail -n 5
  fi

  # Still capture straight to disk, bypassing the SD card.
  SHOT="$WORKDIR/shot.jpg"
  gphoto2 --capture-image-and-download --filename "$SHOT" --force-overwrite \
          --set-config capturetarget=0 >"$WORKDIR/cap.out" 2>&1
  if [ -s "$SHOT" ]; then
    DIMS="$(command -v ffprobe >/dev/null 2>&1 && ffprobe -v error -show_entries stream=width,height -of csv=p=0 "$SHOT" 2>/dev/null || echo '?')"
    ok "captured $(stat -c%s "$SHOT") bytes, resolution $DIMS"
    if [ "$DIMS" != "?" ]; then
      RATIO="$(printf '%s' "$DIMS" | awk -F, '{ if ($2) printf "%.3f", $1/$2 }')"
      note "aspect ratio $RATIO (frame slots want ~1.48, a 3:2 sensor gives 1.500)"
    fi
  else
    bad "capture failed"
    sed 's/^/        /' "$WORKDIR/cap.out" | tail -n 8
    if grep -qi 'no focus' "$WORKDIR/cap.out"; then
      note "Fix: give the lens something to focus on, or switch to manual focus."
    elif grep -qi 'claim' "$WORKDIR/cap.out"; then
      note "Fix: unmount the camera from the file manager, then retry."
    elif grep -qiE 'unsupported operation|generic capture' "$WORKDIR/cap.out"; then
      note "Fix: upgrade libgphoto2, and make sure the mode dial is NOT on movie."
    fi
  fi
fi

# ---------------------------------------------------------------------------
printf '\n%s%s%s\n' "$bold" "----------------------------------------" "$reset"
printf 'pass %s%d%s   fail %s%d%s   skip %s%d%s\n' \
  "$green" "$PASS" "$reset" "$red" "$FAIL" "$reset" "$yellow" "$SKIP" "$reset"

if [ "$FAIL" -eq 0 ]; then
  printf '\n%sCamera is ready. Start the booth with: npm run dev%s\n' "$green" "$reset"
  exit 0
fi

printf '\n%sResolve the failures above, then re-run this script.%s\n' "$yellow" "$reset"
printf 'The booth still runs without a camera: npm run dev:sim (simulated frames)\n'
exit 1
