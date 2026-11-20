/* 운영 설정 — 게임 코드를 건드리지 않고 이 파일만 고쳐서 바꿉니다. */
window.CAT_CONFIG = {
  // 배포할 때 scripts/release.sh 가 자동으로 올립니다. sw.js 의 VERSION 과 같아야 합니다.
  version: '1.1.1',
  // 게임 API 주소. 'auto' = 게임과 같은 서버에서 /api 를 찾고, 없으면 랭킹 없이 실행.
  // 게임(GitHub Pages 등)과 API 서버를 따로 올렸다면 'https://api.example.com/api' 처럼 적습니다. '' 이면 끔.
  apiBase: 'auto',
  // 같은 서버에 /api 가 없을 때(예: GitHub Pages) 대신 쓸 API 서버 주소. 예: 'https://cat-mail-carrier.onrender.com/api'
  apiRemote: '',
  // 서비스 워커(오프라인 실행) 사용 여부
  serviceWorker: true,
  // 오류 보고를 받을 주소 (POST, JSON). 비워 두면 API 서버(apiBase)로 보내고, API도 없으면 브라우저에만 최근 20개를 보관합니다.
  errorEndpoint: '',
  // 플레이 통계를 받을 주소 (POST, JSON). 비워 두면 API 서버(apiBase)가 있을 때 그쪽으로 보냅니다.
  analyticsEndpoint: '',
  // 개인 식별 정보는 보내지 않습니다. 무작위 세션 ID만 붙습니다.
};
