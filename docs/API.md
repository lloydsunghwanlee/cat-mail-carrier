# 고양이 우편배달부 API

기본 주소: `<서버 주소>/api`. 요청·응답은 모두 JSON 입니다.
오류는 `{"error": {"code": "...", "message": "플레이어에게 보여줄 한국어 문장"}}` 모양으로 옵니다.

| 메서드 | 경로 | 하는 일 |
| --- | --- | --- |
| GET | `/api/health` | 서버 상태와 버전. 모니터링용 |
| POST | `/api/runs` | 새 판 시작. 점수 등록에 쓸 토큰 발급 |
| POST | `/api/scores` | 점수 등록 |
| GET | `/api/leaderboard` | 랭킹 조회 |
| POST | `/api/events` | 플레이 통계 수집 |
| POST | `/api/errors` | 게임 오류 수집 |
| GET | `/api/admin/stats` | (관리자) 최근 7일 통계와 오류 |
| POST | `/api/admin/hide-score` | (관리자) 부적절한 기록 숨기기 |

## 점수 등록 흐름

```
게임 시작  → POST /api/runs            → { "runId": "...", "token": "..." }
게임 끝    → POST /api/scores
             { "runId", "token", "name": "치즈", "score": 4321, "stage": 2,
               "level": 5, "letters": 61, "cleared": false, "v": "1.1.0" }
           → { "id": 17, "name": "치즈", "rank": 3, "weekRank": 1 }
```

서버가 확인하는 것:

- 토큰이 서버가 발급한 것인지 (HMAC 서명), 한 판에 한 번만 등록하는지
- 판 길이가 5초 이상 3시간 이하인지
- 점수가 플레이 시간에 비해 말이 되는지 (`server/app.mjs` 의 `RULES`)
- 이름: 1~12자, 제어문자와 `<>` 제거, 금칙어 거부
- IP별 요청 제한: 판 시작 분당 30회, 점수 등록 분당 10회

오류 코드: `bad_name` `bad_input` (400), `bad_run` (403), `already_submitted` (409), `implausible` (422), `rate_limited` (429)

> 브라우저 게임이라 조작을 100% 막을 수는 없습니다. 눈에 띄는 가짜 기록은 관리자 API로 숨기세요.

## 랭킹

`GET /api/leaderboard?limit=10&period=all|week|day` (limit 최대 50)

```json
{ "period": "all", "entries": [
  { "rank": 1, "id": 17, "name": "치즈", "score": 4321, "stage": 2, "level": 5, "cleared": false, "at": "2026-11-19T01:30:00.000Z" } ] }
```

## 통계와 오류

- `POST /api/events` `{ "name": "game_over", "data": { "stage": 2, "score": 1200 }, "session": "ab12cd34", "v": "1.1.0" }`
  이름은 영문 소문자와 `_` 만. 게임이 보내는 것: `game_start`, `stage_clear`, `game_over`. 90일 뒤 자동 삭제.
- `POST /api/errors` `{ "kind", "msg", "stack", "ua", "url", "session", "v" }`. 30일 뒤 자동 삭제.

개인 식별 정보는 저장하지 않습니다. IP는 요청 제한에만 쓰고, 판 토큰과 함께 2일 뒤 지워집니다.

## 관리자

헤더 `X-Admin-Key: <ADMIN_KEY>` 가 필요합니다. `ADMIN_KEY` 를 설정하지 않으면 꺼져 있습니다.

```bash
# 어느 스테이지에서 많이 죽는지, 최근 오류
curl -H "X-Admin-Key: $ADMIN_KEY" https://<서버>/api/admin/stats
# 랭킹에서 기록 숨기기 (되돌리려면 "hidden": false)
curl -X POST -H "X-Admin-Key: $ADMIN_KEY" -H "Content-Type: application/json" \
  -d '{"id": 17}' https://<서버>/api/admin/hide-score
```

## 데이터

`DATA_DIR/game.db` (SQLite) 파일 하나입니다. 백업은 이 파일을 복사하면 됩니다.
