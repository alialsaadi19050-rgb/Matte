#!/usr/bin/env bash
# Bygger TI-84 Plus CE-emulatorn (hunterchen7/ti84ce, MIT) till public/ti84/.
# Kräver: git, Rust (rustup) med målet wasm32-unknown-unknown, wasm-pack, Node.
# Ingen ROM följer med – den medföljande sys84.bin i repot används inte.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="$ROOT/.vendor/ti84ce"
COMMIT=eb90c33cfaebd19fbd0fea9c06a359e3efaf54c2
export PATH="$HOME/.cargo/bin:$PATH"

if [ ! -d "$SRC" ]; then
  git clone https://github.com/hunterchen7/ti84ce.git "$SRC"
fi
git -C "$SRC" fetch --depth 1 origin "$COMMIT" && git -C "$SRC" checkout -q "$COMMIT"

(cd "$SRC/core" && wasm-pack build --target web --release)
rm -rf "$SRC/web/src/emu-core" && cp -r "$SRC/core/pkg" "$SRC/web/src/emu-core"

# Vår ingång och byggkonfiguration
cp "$ROOT/scripts/ti84/matte-main.tsx" "$SRC/web/src/"
cp "$ROOT/scripts/ti84/matte.html" "$ROOT/scripts/ti84/vite.matte.config.ts" "$SRC/web/"
# Knappbilderna ska hämtas relativt, eftersom emulatorn ligger under /ti84/.
sed -i 's#src={`/buttons/${region.img}`}#src={`${import.meta.env.BASE_URL}buttons/${region.img}`}#' "$SRC/web/src/components/keypad/ImageButton.tsx"
mkdir -p "$SRC/web/matte-public" && cp -r "$SRC/web/public/buttons" "$SRC/web/public/calculator.svg" "$SRC/web/matte-public/"

(cd "$SRC/web" && npm install --no-audit --no-fund && npx vite build --config vite.matte.config.ts)
cp "$SRC/LICENSE" "$ROOT/public/ti84/LICENSE.txt"
cp "$ROOT/scripts/ti84/README.txt" "$ROOT/public/ti84/README.txt"
echo "Klart: public/ti84/"
