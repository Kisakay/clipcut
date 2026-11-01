#!/usr/bin/env sh
# Installe la commande `clipcut` dans ~/.local/bin (wrapper qui lance le source avec bun)
set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BIN_DIR="$HOME/.local/bin"
BUN="$(command -v bun || echo "$HOME/.bun/bin/bun")"

mkdir -p "$BIN_DIR"
cat > "$BIN_DIR/clipcut" <<EOF
#!/usr/bin/env sh
exec "$BUN" run "$PROJECT_DIR/clipcut.ts" "\$@"
EOF
chmod +x "$BIN_DIR/clipcut"
echo "✓ clipcut installé dans $BIN_DIR/clipcut"

for rc in "$HOME/.zshrc" "$HOME/.bashrc"; do
  [ -f "$rc" ] || continue
  if ! grep -q '.local/bin' "$rc"; then
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$rc"
    echo "✓ ~/.local/bin ajouté au PATH dans $rc"
  fi
done

echo "→ Ouvre un nouveau terminal (ou fais: source ~/.zshrc) puis tape: clipcut"
