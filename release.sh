#!/usr/bin/env bash
# Cut a release, npm-version style:
#   ./release.sh patch|minor|major   # bump from version in package.json
#   ./release.sh 0.3.0               # or set an explicit version
# Bumps the version in package.json (read by Tauri) and src-tauri/Cargo.toml,
# creates a commit titled "0.3.0" and the tag v0.3.0, then pushes main + tag
# in one atomic push. The tag triggers the Release Windows workflow
# (.github/workflows/release.yml), which builds the installer and the
# portable zip and publishes the GitHub Release.
#
# This version-bump commit is the one sanctioned direct-to-main commit (same
# convention as the other JewelBox repositories).
set -euo pipefail
cd "$(dirname "$0")"

ARG="${1:?usage: ./release.sh patch|minor|major|X.Y.Z}"
[[ "$ARG" =~ ^(major|minor|patch|[0-9]+\.[0-9]+\.[0-9]+)$ ]] \
  || { echo "❌ Argument invalide : « $ARG » (attendu patch|minor|major ou X.Y.Z)"; exit 1; }

[[ "$(git branch --show-current)" == "main" ]] || { echo "❌ À lancer depuis main"; exit 1; }
[[ -z "$(git status --porcelain)" ]] || { echo "❌ Working tree non propre — committe ou stash d'abord"; exit 1; }
git pull --ff-only

# npm version met à jour package.json et package-lock.json sans commit ni tag.
V="$(npm version "$ARG" --no-git-tag-version | sed 's/^v//')"
echo "ℹ️  version $V"

if git rev-parse "v$V" >/dev/null 2>&1; then
  git checkout -- package.json package-lock.json
  echo "❌ Le tag v$V existe déjà"; exit 1
fi

sed -i "0,/^version = \"[0-9.]*\"/s//version = \"$V\"/" src-tauri/Cargo.toml
grep -q "^version = \"$V\"" src-tauri/Cargo.toml || { echo "❌ Échec du bump de version dans Cargo.toml"; exit 1; }
# Cargo.lock porte aussi la version du paquet jewelbox.
(cd src-tauri && cargo update --workspace --offline >/dev/null 2>&1 || cargo update --workspace >/dev/null)

git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "$V"
git tag "v$V"
git push --atomic origin main "v$V"
echo "✅ v$V poussé : le workflow Release Windows construit l'installateur et le zip."
