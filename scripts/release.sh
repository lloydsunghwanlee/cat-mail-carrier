#!/usr/bin/env bash
# 사용법: npm run release -- 1.1.0
# config.js, sw.js, package.json 의 버전을 한 번에 올립니다. 서비스 워커 캐시가 바뀌어 플레이어에게 "새 버전" 알림이 뜹니다.
set -euo pipefail
NEW="${1:?새 버전을 적어 주세요. 예: npm run release -- 1.1.0}"
cd "$(dirname "$0")/.."
sed -i.bak -E "s/version: '[^']+'/version: '$NEW'/" js/config.js
sed -i.bak -E "s/^const VERSION = '[^']+';/const VERSION = '$NEW';/" sw.js
sed -i.bak -E "0,/\"version\": \"[^\"]+\"/s//\"version\": \"$NEW\"/" package.json
rm -f js/config.js.bak sw.js.bak package.json.bak
echo "버전을 $NEW 로 올렸어요. CHANGELOG.md 에 변경 내용을 적고 커밋·푸시하면 자동 배포됩니다."
