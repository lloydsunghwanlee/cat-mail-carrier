# 고양이 우편배달부

일본풍 마을을 달리며 편지를 배달하는 고양이 러닝 액션 웹 게임입니다.
빌드 과정이 없는 정적 웹사이트라서, 파일을 그대로 올리면 어디서든 실행됩니다.

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
| `sw.js` | 서비스 워커 (오프라인 실행, 업데이트) |
| `manifest.webmanifest`, `icons/` | 앱 설치 정보와 아이콘, 공유 이미지 |
| `tests/smoke.mjs` | 배포 전 자동 점검 |
| `.github/workflows/deploy.yml` | 테스트 통과 시 GitHub Pages 자동 배포 |
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
npm start          # http://localhost:8080
```

Node.js 18 이상이면 추가 설치 없이 됩니다. 주소 뒤에 `?debug=1` 을 붙이면 서비스 워커를 끄고 콘솔에서 `window.__cat` 으로 게임 상태를 볼 수 있습니다.

## 배포

### 방법 1. GitHub Pages (추천, 무료, 자동 배포)

1. GitHub 에 빈 저장소를 만들고 이 폴더 내용을 `main` 브랜치에 올립니다.
2. 저장소 **Settings → Pages → Build and deployment → Source** 를 **GitHub Actions** 로 바꿉니다.
3. 이후 `main` 에 푸시할 때마다 자동 점검(`npm test`)이 돌고, 통과하면 `https://<아이디>.github.io/<저장소>/` 에 배포됩니다. 점검이 실패하면 배포되지 않아서 망가진 버전이 올라가지 않습니다.

### 방법 2. Netlify 또는 Cloudflare Pages (끌어다 놓기)

- Netlify: https://app.netlify.com/drop 에 이 폴더를 끌어다 놓으면 바로 주소가 생깁니다.
- Cloudflare Pages: 저장소를 연결하고 빌드 명령은 비워 두고, 출력 폴더는 `/` 로 둡니다.
- 두 곳 모두 `_headers` 의 보안·캐시 설정이 자동으로 적용됩니다.

### 자기 도메인 연결 후 할 일

`index.html` 의 `og:image` 는 상대 경로입니다. 카카오톡·트위터 미리보기 이미지가 잘 나오려면 실제 주소로 바꿔 주세요.
예: `https://game.example.com/icons/og-image.png`

## 업데이트하는 법

```bash
npm run release -- 1.1.0   # config.js, sw.js, package.json 버전을 한 번에 올림
# CHANGELOG.md 에 바뀐 점 적기
git commit -am "v1.1.0" && git push
```

버전이 바뀌면 이미 게임을 연 사람에게 "새 버전이 나왔어요 [업데이트]" 알림이 뜹니다.
**버전을 올리지 않고 배포하면** 오프라인 캐시 때문에 일부 플레이어가 예전 파일을 계속 볼 수 있으니, 배포할 때마다 꼭 버전을 올려 주세요.

## 운영

### 오류 확인

- 오류가 나면 플레이어 화면에 "문제가 생겼어요 [새로고침]" 안내가 뜹니다.
- 최근 오류 20개는 플레이어 브라우저에 남습니다. 문의가 오면 그 사람에게 브라우저 콘솔에서 `Ops.errors()` 를 실행해 달라고 하면 됩니다.
- 오류를 서버로 모으고 싶으면 `js/config.js` 의 `errorEndpoint` 에 JSON 을 받는 주소를 넣습니다. (예: Sentry 터널, Cloudflare Worker, Google Apps Script 웹앱)

### 플레이 통계

`js/config.js` 의 `analyticsEndpoint` 에 주소를 넣으면 다음 이벤트가 JSON 으로 전송됩니다. 비워 두면 아무것도 보내지 않습니다.

| 이벤트 | 함께 보내는 값 |
| --- | --- |
| `game_start` | 없음 |
| `stage_clear` | 스테이지, 점수, 레벨, 남은 체력 |
| `game_over` | 스테이지, 점수, 레벨, 달린 거리 |

모든 요청에 게임 버전과 무작위 세션 ID 가 붙습니다. 이름·이메일 같은 개인 정보는 보내지 않습니다.
어느 스테이지에서 많이 죽는지 보고 `STAGES` 의 속도·장애물 비율을 조정하는 데 씁니다.

### 저장 데이터

최고 점수와 소리 설정만 플레이어 브라우저(localStorage, `catpost_save_v1`)에 저장합니다. 서버나 계정이 없어 개인정보 처리 대상이 없습니다. 저장값이 깨져 있으면 자동으로 초기화됩니다.

### 배포 전 점검표

- [ ] `npm test` 통과 (GitHub Actions 에서 자동)
- [ ] 버전 올림 (`npm run release -- x.y.z`)
- [ ] `CHANGELOG.md` 작성
- [ ] 휴대폰 가로 화면에서 한 판 플레이

## 저작권 메모

그림은 모두 코드로 직접 그린 원본이고, 외부 이미지·음원은 쓰지 않았습니다. 글꼴은 Google Fonts 의 Jua, Nanum Brush Script (SIL Open Font License) 입니다.
게임 속 불닭볶음면·두쫀쿠는 음식 이름으로만 쓰고 실제 제품 포장이나 로고는 그리지 않았습니다. 상업적으로 출시할 때는 음식 이름의 상표 사용 여부를 한 번 확인하는 것을 권합니다.
