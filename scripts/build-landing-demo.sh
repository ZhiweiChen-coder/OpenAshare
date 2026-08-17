#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
FFMPEG_BIN="${FFMPEG_BIN:-ffmpeg}"
OUTPUT_DIR="${REPO_ROOT}/public/marketing"
OUTPUT_FILE="${OUTPUT_DIR}/openashare-demo.mp4"

INPUT_HOME="${REPO_ROOT}/public/marketing/agent-clean.png"
INPUT_NEWS="${REPO_ROOT}/public/marketing/agent-clean.png"
INPUT_STOCK="${REPO_ROOT}/public/marketing/agent-clean.png"

if ! command -v "${FFMPEG_BIN}" >/dev/null 2>&1; then
  echo "ffmpeg was not found. Install ffmpeg or set FFMPEG_BIN to its executable path." >&2
  exit 1
fi

for input_file in "${INPUT_HOME}" "${INPUT_NEWS}" "${INPUT_STOCK}"; do
  if [[ ! -f "${input_file}" ]]; then
    echo "Missing input image: ${input_file}" >&2
    exit 1
  fi
done

mkdir -p "${OUTPUT_DIR}"

"${FFMPEG_BIN}" -y -hide_banner \
  -loop 1 -framerate 30 -t 3.8 -i "${INPUT_HOME}" \
  -loop 1 -framerate 30 -t 3.8 -i "${INPUT_NEWS}" \
  -loop 1 -framerate 30 -t 3.8 -i "${INPUT_STOCK}" \
  -filter_complex "
    [0:v]scale=2400:-2,zoompan=z='min(zoom+0.0008,1.08)':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=1:s=1920x1080:fps=30,format=yuv420p[home];
    [1:v]scale=2400:-2,zoompan=z='min(zoom+0.0007,1.07)':x='(iw-iw/zoom)*on/113':y='(ih-ih/zoom)*0.42':d=1:s=1920x1080:fps=30,format=yuv420p[news];
    [2:v]scale=2400:-2,zoompan=z='min(zoom+0.0009,1.09)':x='(iw-iw/zoom)*0.58':y='(ih-ih/zoom)*(1-on/113)':d=1:s=1920x1080:fps=30,format=yuv420p[stock];
    [home][news]xfade=transition=fade:duration=0.7:offset=3.1[scene12];
    [scene12][stock]xfade=transition=fade:duration=0.7:offset=6.2[vout]
  " \
  -map "[vout]" -an -t 10 \
  -c:v libx264 -preset medium -crf 19 -pix_fmt yuv420p \
  -movflags +faststart "${OUTPUT_FILE}"

echo "Created ${OUTPUT_FILE}"
