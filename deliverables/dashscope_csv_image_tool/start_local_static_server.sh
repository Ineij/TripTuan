#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

echo "Serving local images at http://127.0.0.1:8000/static/ ..."
echo "Press Ctrl+C to stop."
python3 -m http.server 8000 --bind 127.0.0.1 --directory backend
