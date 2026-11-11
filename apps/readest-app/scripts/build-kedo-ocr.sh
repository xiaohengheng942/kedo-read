#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
mkdir -p src-tauri/kedo-resources public/vendor/kedo-wordlens
cp data/wordlens/manifest.json data/wordlens/en-zh.json data/wordlens/ATTRIBUTION.md data/wordlens/ECDICT-LICENSE public/vendor/kedo-wordlens/
xcrun swiftc -O -target arm64-apple-macos12 src-tauri/kedo-ocr.swift -o src-tauri/kedo-resources/kedo-ocr
