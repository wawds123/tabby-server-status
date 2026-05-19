#!/usr/bin/env bash
#
# tabby-server-status 배포용 zip 패키지 생성 스크립트.
# 빌드 후 dist + package.json + install.sh + README 만 묶어서 release/ 에 저장.
#
# 사용법:  ./package.sh
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_NAME="tabby-server-status"
VERSION="$(node -p "require('$SCRIPT_DIR/package.json').version" 2>/dev/null || echo "0.0.0")"
OUT_DIR="$SCRIPT_DIR/release"
STAGING="$OUT_DIR/$PLUGIN_NAME"
ZIP_PATH="$OUT_DIR/$PLUGIN_NAME-$VERSION.zip"

# Node 22+ 필요. nvm 사용자라면 v22가 PATH에 있도록 best-effort.
if [ -d "$HOME/.nvm/versions/node" ]; then
    LATEST_V22="$(ls "$HOME/.nvm/versions/node" 2>/dev/null | grep '^v22' | sort -V | tail -1 || true)"
    if [ -n "$LATEST_V22" ] && [ -d "$HOME/.nvm/versions/node/$LATEST_V22/bin" ]; then
        export PATH="$HOME/.nvm/versions/node/$LATEST_V22/bin:$PATH"
    fi
fi

echo "→ Building plugin (yarn build)..."
(cd "$SCRIPT_DIR" && yarn build) > /dev/null

if [ ! -f "$SCRIPT_DIR/dist/index.js" ]; then
    echo "✗ 빌드 산출물 dist/index.js 가 없습니다. yarn build 가 정상 동작하는지 확인하세요." >&2
    exit 1
fi

echo "→ Cleaning staging directory..."
rm -rf "$OUT_DIR"
mkdir -p "$STAGING/dist"

echo "→ Copying files..."
cp "$SCRIPT_DIR/dist/index.js" "$STAGING/dist/"
[ -f "$SCRIPT_DIR/dist/index.js.map" ] && cp "$SCRIPT_DIR/dist/index.js.map" "$STAGING/dist/"
cp "$SCRIPT_DIR/package.json" "$STAGING/"
cp "$SCRIPT_DIR/install.sh" "$STAGING/"
chmod +x "$STAGING/install.sh"

cat > "$STAGING/README.md" <<'EOF'
# tabby-server-status

[Tabby](https://tabby.sh) 의 SSH / Local 셸 탭 하단에 시스템 상태바를 표시하는 플러그인 (macOS 전용).

표시 항목: CPU · MEM · DISK · LOAD · UPTIME · BAT (배터리, 충전 중이면 ⚡ 아이콘).
각 항목에는 최근 100초 추세 스파크라인과 셀 하단 게이지바가 함께 표시됩니다.

## 설치

```sh
./install.sh
```

설치 후 Tabby가 실행 중이면 **Cmd+Q 로 완전 종료** 후 다시 실행하세요.
`Settings → Plugins` 에 `tabby-server-status` 가 노출되면 정상.

## 요구사항

- macOS
- Tabby 정식 앱 ( https://tabby.sh )
- **(선택) Xcode CLI tools** — 정확한 디스크 사용률 계산에 사용. 미설치 시 `df` 기반 값으로 자동 fallback.
  설치: `xcode-select --install`

## 수동 설치 (install.sh 동작 안 할 때)

```sh
mkdir -p "$HOME/Library/Application Support/tabby/plugins/node_modules"
cp -R . "$HOME/Library/Application Support/tabby/plugins/node_modules/tabby-server-status"
```

이후 Tabby 재시작.

## 제거

```sh
rm -rf "$HOME/Library/Application Support/tabby/plugins/node_modules/tabby-server-status"
```

이후 Tabby 재시작.
EOF

echo "→ Creating zip..."
(cd "$OUT_DIR" && zip -rq "$(basename "$ZIP_PATH")" "$PLUGIN_NAME")

echo ""
echo "✓ 패키지 생성 완료"
echo ""
ls -lh "$ZIP_PATH"
echo ""
echo "팀원에게 위 zip 파일을 전달하세요."
echo "팀원 사용법: 압축 해제 → cd $PLUGIN_NAME → ./install.sh"
