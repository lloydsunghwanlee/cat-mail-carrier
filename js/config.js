/* 운영 설정 — 게임 코드를 건드리지 않고 이 파일만 고쳐서 바꿉니다. */
window.CAT_CONFIG = {
  // 배포할 때 scripts/release.sh 가 자동으로 올립니다. sw.js 의 VERSION 과 같아야 합니다.
  version: '1.0.0',
  // 오류 보고를 받을 주소 (POST, JSON). 비워 두면 보내지 않고 브라우저에만 최근 20개를 보관합니다.
  errorEndpoint: '',
  // 플레이 통계(게임 시작·스테이지 클리어·게임 오버)를 받을 주소 (POST, JSON). 비워 두면 보내지 않습니다.
  analyticsEndpoint: '',
  // 개인 식별 정보는 보내지 않습니다. 무작위 세션 ID만 붙습니다.
};
