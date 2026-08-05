#!/bin/sh

set -eu

manifest="docs/prd/10-mvp-freeze-manifest.md"
expected_count=10
checksums_file="$(mktemp)"
trap 'rm -f "$checksums_file"' EXIT HUP INT TERM

awk -F '`' '
  /^\| `[^`]+` \| v[^|]+ \| `[0-9a-f]{64}` \|$/ {
    print $4 "  docs/prd/" $2
  }
' "$manifest" > "$checksums_file"

actual_count="$(wc -l < "$checksums_file" | tr -d ' ')"
if [ "$actual_count" -ne "$expected_count" ]; then
  echo "Expected $expected_count PRD hash entries in $manifest, found $actual_count." >&2
  exit 1
fi

if command -v sha256sum >/dev/null 2>&1; then
  sha256sum --check "$checksums_file"
elif command -v shasum >/dev/null 2>&1; then
  shasum -a 256 --check "$checksums_file"
else
  echo "Neither sha256sum nor shasum is available." >&2
  exit 1
fi
