#!/usr/bin/env bash
#
# tabby-server-status 설치 스크립트.
# 압축을 풀고 이 디렉터리에서 실행하세요:  ./install.sh
#
# 동작:
#   1) Tabby 사용자 플러그인 디렉터리에 tabby-server-status 폴더 생성
#   2) dist/, package.json 만 복사 (install.sh, README.md 는 제외)
#   3) Tabby 재시작 안내
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_NAME="tabby-server-status"
PLUGINS_ROOT="$HOME/Library/Application Support/tabby/plugins/node_modules"
TARGET_DIR="$PLUGINS_ROOT/$PLUGIN_NAME"

echo "→ 설치 위치:"
echo "    $TARGET_DIR"
echo ""

if [ ! -f "$SCRIPT_DIR/dist/index.js" ]; then
    echo "✗ dist/index.js 가 이 디렉터리에 없습니다. 압축을 푼 디렉터리 안에서 실행해 주세요." >&2
    exit 1
fi

# Tabby 실행 중이면 경고만 (강제 종료 X)
if pgrep -x "Tabby" >/dev/null 2>&1 || pgrep -f "Tabby.app/Contents/MacOS/Tabby" >/dev/null 2>&1; then
    echo "⚠️  Tabby 가 실행 중입니다. 설치 후 Cmd+Q 로 완전 종료한 다음 다시 실행하세요."
    echo ""
fi

mkdir -p "$PLUGINS_ROOT"
rm -rf "$TARGET_DIR"
mkdir -p "$TARGET_DIR/dist"

cp "$SCRIPT_DIR/dist/index.js" "$TARGET_DIR/dist/"
[ -f "$SCRIPT_DIR/dist/index.js.map" ] && cp "$SCRIPT_DIR/dist/index.js.map" "$TARGET_DIR/dist/"
cp "$SCRIPT_DIR/package.json" "$TARGET_DIR/"

echo "✓ 설치 완료"
echo ""
echo "다음 단계:"
echo "  1) Tabby 가 실행 중이면 Cmd+Q 로 완전 종료"
echo "  2) Tabby 재실행"
echo "  3) Settings → Plugins 에 '$PLUGIN_NAME' 노출 확인"
echo "  4) SSH 또는 Local 셸 탭을 열어 하단 상태바 확인 (약 5초 후 첫 데이터)"
