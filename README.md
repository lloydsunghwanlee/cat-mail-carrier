# 고양이 우편배달부

일본풍 마을을 달리며 편지를 배달하는 고양이 러닝 액션 웹 게임입니다.
게임(정적 웹)과 API 서버(랭킹, 통계, 오류 수집)로 이루어져 있고, 둘 다 추가 설치 없이 Node.js 하나로 실행됩니다.
API 서버가 없어도 게임은 그대로 실행되고, 그때는 랭킹이 기기 안에만 저장됩니다.

- PC: 스페이스·↑ 점프(공중에서 한 번 더), ↓ 슬라이드, P 일시정지
- 모바일: 화면 탭 점프, 슬라이드 버튼 또는 아래로 쓸기
- 홈 화면에 추가하면 앱처럼 전체 화면으로 실행되고, 한 번 연 뒤에는 오프라인에서도 됩니다.

## 폴더 구조

| 경로 | 내용 |
| --- | --- |
| `index.html` | 화면 뼈대, 메타 태그(공유 미리보기, 홈 화면 아이콘) |
| `css/style.css` | 메뉴·버튼 스타일 |
| `js/config.js` | **운영 설정** (버전, 오류·통계 수집 주소) |
| `js/ops.js` | 저장 데이터, 오류 수집, 통계 전송, 새 버전 알림 |
| `js/game.js` | 게임 본체 |
| `js/board.js`, `js/board-ui.js` | 랭킹 저장소 연결, 랭킹 화면과 이름 입력 |
| `server/` | **API 서버** (`app.mjs` 라우트·검증, `db.mjs` SQLite). 게임 파일도 같이 내려줍니다 |
| `docs/API.md` | API 문서 |
| `Dockerfile`, `render.yaml`, `.env.example` | 서버 배포 설정 |
| `sw.js` | 서비스 워커 (오프라인 실행, 업데이트) |
| `manifest.webmanifest`, `icons/` | 앱 설치 정보와 아이콘, 공유 이미지 |
| `tests/api.test.mjs`, `tests/smoke.mjs` | 배포 전 자동 점검 (API 8개, 게임 16개) |
| `.github/workflows/test.yml` | 푸시할 때마다 자동 점검 |
| `_headers`, `netlify.toml` | Netlify·Cloudflare Pages 용 보안·캐시 헤더 |

### 게임 코드 구조 (뱀서라이크 확장용)

`js/game.js` 안에서 데이터와 로직이 나뉘어 있습니다.

- `STAGES`: 스테이지 길이, 속도, 장애물 비율, 배달처. 스테이지를 늘리려면 항목만 추가합니다.
- `OB`: 장애물과 적(요괴) 정의. `enemy: true`, `destructible`, `hp` 로 성격을 정합니다.
- `WEAPONS`: 자동 공격 무기 (생선뼈 표창, 수호 방울). `update(lv, dt)` 하나만 구현하면 됩니다.
- `UPGRADES`: 레벨업 때 나오는 선택지.

서바이버 모드로 넘어갈 때는 플레이어 이동을 2D로 바꾸고 `spawner()` 를 웨이브식으로 교체하면 무기·업그레이드·적 정의는 그대로 쓸 수 있습니다.

## 로컬에서 실행

```bash
npm start          # 게임 + API: http://localhost:8080
npm test           # 자동 점검 (처음 한 번 npm install 과 npx playwright install chromium 필요)
```

Node.js 22.13 이상이면 추가 설치 없이 됩니다. 랭킹을 파일로 남기려면 `DATA_DIR=./data npm start` 로 실행하세요. 환경변수는 `.env.example` 참고. 주소 뒤에 `?debug=1` 을 붙이면 서비스 워커를 끄고 콘솔에서 `window.__cat` 으로 게임 상태를 볼 수 있습니다.

## 배포

### 방법 A. 게임 + API 를 한 서버에 (추천: 공유 링크 하나로 랭킹까지)

Render 기준입니다. Fly.io, Railway, 일반 서버도 `Dockerfile` 로 똑같이 올라갑니다.

1. 이 폴더를 GitHub 저장소에 올립니다.
2. https://dashboard.render.com 에서 **New → Blueprint** 로 저장소를 고르면 `render.yaml` 대로 만들어집니다. 비밀값(`RUN_SECRET`, `ADMIN_KEY`)은 자동 생성됩니다.
3. 생긴 주소(`https://<이름>.onrender.com`)가 곧 공유 링크입니다. 게임과 `/api` 가 같은 주소라 따로 설정할 게 없습니다.

랭킹을 보존하려면 디스크가 필요해서 유료 플랜(월 몇 달러)이 필요합니다. 무료 플랜으로 바꾸려면 `render.yaml` 에서 `plan: free` 로 바꾸고 `disk` 항목을 지우면 되지만, 서버가 재시작될 때 랭킹이 지워집니다.

직접 서버에 올릴 때:

```bash
docker build -t cat-mail-carrier .
docker run -d -p 8080:8080 -v catdata:/data -e RUN_SECRET=<긴 무작위 문자열> -e ADMIN_KEY=<관리자 키> cat-mail-carrier
```

### 방법 B. 게임은 정적 호스팅, API 는 따로

게임을 GitHub Pages 등에 올리고 API 서버만 다른 곳에 둘 수도 있습니다. 이때 `js/config.js` 의 `apiBase` 를 `https://<API 서버>/api` 로 바꾸고, 서버의 `ALLOWED_ORIGINS` 에 게임 주소를 넣으세요.

### 방법 1. GitHub Pages (무료, 랭킹은 기기 안에만) — 지금 쓰는 방식

현재 주소: https://lloydsunghwanlee.github.io/cat-mail-carrier/

저장소 **Settings → Pages** 가 **Deploy from a branch (main, / root)** 로 설정되어 있어서, `main` 에 푸시하면 1~2분 뒤 자동으로 반영됩니다.
푸시할 때마다 자동 점검(`npm test`)도 따로 돌아가니, Actions 탭에 빨간 표시가 뜨면 그 변경은 되돌리거나 고쳐 주세요.

### 방법 2. Netlify 또는 Cloudflare Pages (끌어다 놓기)

- Netlify: https://app.netlify.com/drop 에 이 폴더를 끌어다 놓으면 바로 주소가 생깁니다.
- Cloudflare Pages: 저장소를 연결하고 빌드 명령은 비워 두고, 출력 폴더는 `/` 로 둡니다.
- 두 곳 모두 `_headers` 의 보안·캐시 설정이 자동으로 적용됩니다.

### 자기 도메인 연결 후 할 일

`index.html` 의 `og:image` 는 상대 경로입니다. 카카오톡·트위터 미리보기 이미지가 잘 나오려면 실제 주소로 바꿔 주세요.
예: `https://game.example.com/icons/og-image.png`

### 파일 하나로 보내기

`npm run build:single` 을 실행하면 `dist/cat-mail-carrier.html` 한 파일이 만들어집니다. 메신저로 보내거나 아무 곳에나 올려도 실행됩니다 (랭킹은 기기 안에만).

## 업데이트하는 법

```bash
npm run release -- 1.1.0   # config.js, sw.js, package.json 버전을 한 번에 올림
# CHANGELOG.md 에 바뀐 점 적기
git commit -am "v1.1.0" && git push
```

버전이 바뀌면 이미 게임을 연 사람에게 "새 버전이 나왔어요 [업데이트]" 알림이 뜹니다.
**버전을 올리지 않고 배포하면** 오프라인 캐시 때문에 일부 플레이어가 예전 파일을 계속 볼 수 있으니, 배포할 때마다 꼭 버전을 올려 주세요.

## 운영

### API 서버

- 상태 확인: `GET /api/health`. 모니터링 서비스(UptimeRobot 등)에 이 주소를 걸어 두세요.
- 통계와 오류 보기, 부적절한 랭킹 기록 숨기기: `docs/API.md` 의 관리자 항목.
- 백업: `DATA_DIR/game.db` 파일 하나를 복사하면 됩니다.
- 점수 검증 기준(`server/app.mjs` 의 `RULES`)은 게임 밸런스를 바꿀 때 같이 조정하세요.

### 오류 확인

- 오류가 나면 플레이어 화면에 "문제가 생겼어요 [새로고침]" 안내가 뜹니다.
- 최근 오류 20개는 플레이어 브라우저에 남습니다. 문의가 오면 그 사람에게 브라우저 콘솔에서 `Ops.errors()` 를 실행해 달라고 하면 됩니다.
- API 서버가 연결돼 있으면 오류와 플레이 통계가 자동으로 그쪽에 쌓입니다. 다른 곳으로 보내려면 `js/config.js` 의 `errorEndpoint`, `analyticsEndpoint` 에 주소를 넣습니다.

### 플레이 통계

API 서버가 있으면 다음 이벤트가 전송됩니다. API 서버도 없고 `analyticsEndpoint` 도 비어 있으면 아무것도 보내지 않습니다.

| 이벤트 | 함께 보내는 값 |
| --- | --- |
| `game_start` | 없음 |
| `stage_clear` | 스테이지, 점수, 레벨, 남은 체력 |
| `game_over` | 스테이지, 점수, 레벨, 달린 거리 |

모든 요청에 게임 버전과 무작위 세션 ID 가 붙습니다. 이름·이메일 같은 개인 정보는 보내지 않습니다.
어느 스테이지에서 많이 죽는지 보고 `STAGES` 의 속도·장애물 비율을 조정하는 데 씁니다.

### 저장 데이터

플레이어 브라우저(localStorage, `catpost_save_v1`)에는 최고 점수, 소리 설정, 마지막에 쓴 랭킹 이름만 저장합니다. 서버에는 플레이어가 직접 적은 랭킹 이름과 점수만 남고, 계정이나 이메일은 받지 않습니다. 저장값이 깨져 있으면 자동으로 초기화됩니다.

### 배포 전 점검표

- [ ] `npm test` 통과 (GitHub Actions 에서 자동)
- [ ] 버전 올림 (`npm run release -- x.y.z`)
- [ ] `CHANGELOG.md` 작성
- [ ] 휴대폰 가로 화면에서 한 판 플레이

## 저작권 메모

그림은 모두 코드로 직접 그린 원본이고, 외부 이미지·음원은 쓰지 않았습니다. 글꼴은 Google Fonts 의 Jua, Nanum Brush Script (SIL Open Font License) 입니다.
게임 속 불닭볶음면·두쫀쿠는 음식 이름으로만 쓰고 실제 제품 포장이나 로고는 그리지 않았습니다. 상업적으로 출시할 때는 음식 이름의 상표 사용 여부를 한 번 확인하는 것을 권합니다.
