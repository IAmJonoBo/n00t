#!/usr/bin/env bash
set -euo pipefail

OUT_DIR="docs/modules/ROOT/pages"
mkdir -p "$OUT_DIR"

TODAY=$(date +%F)
FIX=false
DEFAULT_TAGS="diataxis:explanation, domain:platform, audience:contrib, stability:beta"
DEFAULT_REVIEWED="$TODAY"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --fix)
      FIX=true; shift 1;;
    --default-tags)
      DEFAULT_TAGS="$2"; shift 2;;
    --reviewed)
      DEFAULT_REVIEWED="$2"; shift 2;;
    --help)
      echo "Usage: $0 [--fix] [--default-tags \"tags\"] [--reviewed YYYY-MM-DD]"; exit 0;;
    *)
      echo "Unknown option: $1"; exit 1;;
  esac
done

convert() {
  local src="$1"
  local base=$(basename "$src" .md)
  local dest="$OUT_DIR/${base}.adoc"
  echo "Converting $src -> $dest"
  if command -v pandoc >/dev/null 2>&1; then
    pandoc --from=gfm --to=asciidoc -o "$dest" "$src"
  else
    echo "Pandoc not found; copying as placeholder" >"$dest"
    cat "$src" >>"$dest"
  fi
  # Add portable header
  title=$(head -n1 "$src" | sed 's/^#* //')
  tmpfile=$(mktemp)
  printf "= %s\n:page-tags: %s\n:reviewed: %s\n\n" "$title" "$DEFAULT_TAGS" "$DEFAULT_REVIEWED" > "$tmpfile"
  cat "$dest" >> "$tmpfile"
  mv "$tmpfile" "$dest"
}

fix_adoc_headers() {
  local f
  for f in "$OUT_DIR"/*.adoc; do
    [ -e "$f" ] || continue
    if ! grep -q "^:page-tags:" "$f"; then
      echo "Fixing :page-tags: in $f"
      tmp=$(mktemp)
      printf ":page-tags: %s\n" "$DEFAULT_TAGS" > "$tmp"
      cat "$f" >> "$tmp"
      mv "$tmp" "$f"
    fi
    if ! grep -q "^:reviewed:" "$f"; then
      echo "Fixing :reviewed: in $f"
      tmp=$(mktemp)
      printf ":reviewed: %s\n" "$DEFAULT_REVIEWED" > "$tmp"
      cat "$f" >> "$tmp"
      mv "$tmp" "$f"
    fi
  done
}

for file in docs/index.md docs/**/*.md; do
  if [[ -f $file ]]; then
    convert "$file"
  fi
done

if [[ "$FIX" == true ]]; then
  fix_adoc_headers
fi


echo "Conversion complete. Check $OUT_DIR for generated .adoc files."
