# 🎭 MASK STAGE — 학교 축제 1,000명 관객 투표

GitHub Pages + Cloudflare Workers + D1을 사용하는 **무료 한도 내** 관객 투표 시스템입니다.

- `index.html` : 관객 스마트폰용 투표 화면 및 결과 발표
- `admin.html` : 운영자 로그인 / 라운드명 변경 / 60초 시작·마감 / 결과 공개 / 테스트 초기화
- `screen.html` : OBS 브라우저 소스로 띄울 공연장 대형 스크린(기본 16:9)
- `config.js` : **Workers 주소만** 설정
- `worker/` : 서버·데이터베이스 (GitHub Pages에서 직접 실행되지 않음)

## 운영 전 필수로 알아둘 점

1. **자동 생성 투표 ID는 사람이나 물리적 휴대전화의 고유번호가 아닙니다.** 브라우저 저장소를 지우거나 시크릿 모드 / 다른 브라우저로 접속하면 다른 ID로 다시 투표할 수 있습니다. 따라서 기술적으로 '엄밀한 1인 1표'를 보장하지 않습니다.
2. 60초 동안 1,000명을 처리할 수 있는지 **실제 공연 전에 사전 부하 테스트가 필요합니다.** 무료 요금제의 무중단 운영을 보장하지 않습니다.
3. Cloudflare 웹사이트 및 서비스는 18세 미만을 대상으로 설계된 것이 아니라고 안내합니다. **Cloudflare 가입·서버 운영은 학교 담당 교사 또는 성인 보호자가 서비스 약관을 확인하고 담당하도록 하세요.**
4. GitHub Pages 사이트에 **관리자 비밀키를 절대 올리지 마세요.** 교사가 설정한 비밀키는 Workers Secret에만 저장합니다.
5. 본 시스템은 성명, 전화번호, 학생번호를 받지 않습니다. 자동 생성된 랜덤 ID로 라운드별 중복 투표만 막습니다. 일반적인 플랫폼 접근 로그는 별도로 발생할 수 있습니다.

## A. GitHub Pages에 올리기

1. GitHub에서 **Public** 저장소 `masked-singer-vote` 생성.
2. 이 폴더의 `index.html`, `admin.html`, `screen.html`, `config.js`, `assets/` 및 `worker/` 업로드. (ZIP 파일 자체가 아닌 압축을 푼 파일과 폴더를 업로드)
3. `Settings → Pages → Deploy from a branch → main / (root) → Save`.
4. `https://woolim0601-ops.github.io/masked-singer-vote/` 형태의 주소에서 확인. (계정/저장소 이름이 다르면 달라집니다.)
5. **주의:** 아직 서버 설정 전이면 사이트에 연결 오류가 뜨는 것이 정상입니다. 아래 단계가 끝나야 실제 투표가 됩니다.

## B. Cloudflare Workers + D1 연결 (학교 담당 성인이 작업)

준비: Cloudflare 계정(학교 담당자), Node.js 설치, 터미널 사용 가능.

아래 명령은 **`worker` 폴더 안에서** 실행합니다.

```bash
cd worker
npx wrangler login
npx wrangler d1 create school-mask-vote-db
```

출력에 표시되는 `database_id`를 `worker/wrangler.toml`의 `database_id = "REPLACE_WITH_DATABASE_ID"` 자리에 입력합니다.

`wrangler.toml`의 `ALLOWED_ORIGIN`을 실제 GitHub Pages **출처(origin)만** 지정합니다. 예를 들어 관객 링크가 `https://woolim0601-ops.github.io/masked-singer-vote/`이면 출처는 `https://woolim0601-ops.github.io`입니다.

```bash
# worker 폴더에서 원격 D1에 최초 생성 (초기 설치 후 다시 할 필요 없음)
npx wrangler d1 execute school-mask-vote-db --remote --file=./schema.sql

# 관리자 비밀키 등록: 터미널이 별도로 물어볼 때 20자 이상 긴 문자열 입력
npx wrangler secret put ADMIN_TOKEN

# Worker 배포
npx wrangler deploy
```

`npx wrangler deploy` 명령을 실행하면 `https://school-mask-vote-api.계정명.workers.dev` 형태의 API 주소가 표시됩니다.

### C. GitHub `config.js` 수정

```javascript
window.MASK_VOTE_API = 'https://school-mask-vote-api.계정명.workers.dev';
```

- 주소 끝에는 `/`를 붙이지 않아도 됩니다.
- `계정명` 부분에 **실제 배포 주소**를 입력하세요. 예시 URL을 그대로 복사하면 동작하지 않습니다.
- GitHub에 저장(Commit)하고 Pages가 배포될 때까지 확인하세요.

## D. 각 페이지 주소

관객: `https://[사용자명].github.io/masked-singer-vote/`

운영자: `https://[사용자명].github.io/masked-singer-vote/admin.html`

스크린: `https://[사용자명].github.io/masked-singer-vote/screen.html`

관리자 페이지에서 Workers Secret에 넣은 비밀키를 입력하고 로그인하세요. GitHub에 비밀키를 적는 방식이 아닙니다.

### QR 코드 중요

기본 제공되는 `assets/qr.png`는 **`https://woolim0601-ops.github.io/masked-singer-vote/`**로 제작했습니다. 실제 주소가 이와 다르면 공연장 스크린의 QR 코드도 새 주소로 다시 생성해 같은 파일명으로 교체해야 합니다.

## E. 행사 진행 순서

1. 관리자 → 라운드 선택 → A/B 참가자명 입력 → `이름 저장`.
2. 관객들에게 `index.html` 주소의 QR 코드를 공연 시작 전에 미리 보여줍니다.
3. 공연 후 MC 큐에 맞춰 관리자 `▶ 60초 투표 시작`.
4. 관객 페이지에서 A/B 선택 → 투표 제출 → 서버 접수 성공 화면.
5. 서버는 시작 후 60초가 지나면 투표를 거부합니다(시간은 서버 기준). 필요 시 `■ 투표 즉시 마감`.
6. 운영자가 표수를 검증하고, MC 발표 신호에 맞춰 `★ 결과 전체 공개`.
7. 관객 휴대전화/공연장 대형 스크린에서 결과 표시(갱신 주기와 네트워크에 따라 수초 차이).
8. 다음 라운드 선택 후 반복.

### OBS에서 쓰는 법

- OBS → 소스 추가 → **브라우저** → `screen.html` 주소 입력.
- 기본 권장 화면 크기 1920 × 1080.
- 무대 스크린에 브라우저 소스를 송출.
- 브라우저 소스 자동 새로고침을 자주 켜지 마세요. 1,000명의 관객 웹사이트 갱신과 겹칠 수 있습니다.

## F. 테스트 절차

- 2~3대의 휴대전화로 같은 라운드 투표 및 동일 브라우저 중복 투표 차단 확인.
- 시크릿 모드에서는 **다시 투표될 수 있음**을 학교 운영진에 안내.
- 운영자 `시작` → 관객에 60초 타이머 → 시간 만료 → 추가 투표 차단.
- 운영자 `결과 공개` 전에는 관객과 `screen.html`에 표수가 보이지 않는지 확인.
- 공개 이후 관객과 OBS 스크린에서 같은 표수를 보여주는지 확인.
- 예행연습에서 `리허설용 초기화`로 투표를 지울 수 있음. 본행사에서 사용하지 않도록 주의.
- 1,000명 수준의 사전 부하 테스트는 **학교가 소유·허가한 이 시스템에 대해서만** 실시하고 실제 운영 환경에 맞는 속도와 참여 패턴으로 측정.
- 무료 플랜 사용량과 DB 오류/응답 실패를 행사 전에 확인.

## G. 무료 한도 및 운영 제한

2026년 10월 기준 Cloudflare Workers 무료 요금제는 **일일 100,000 요청** 제한이 있습니다. API 상태 확인도 요청에 포함되므로 관객 1,000명이 여러 시간 동안 페이지를 계속 켜 두는 경우 무료 일일 한도에 도달할 수 있습니다. 코드는 요청 수를 줄이기 위해 단계별로 상태 확인 간격을 조절합니다. 다만 1,000명의 동시 접속 안정성은 서비스 제공량만으로 보증할 수 없습니다.

- [Cloudflare Workers 공식 제한](https://developers.cloudflare.com/workers/platform/limits/)
- [Cloudflare D1 시작하기](https://developers.cloudflare.com/d1/get-started/)
- [GitHub Pages 배포 설정](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [Cloudflare 개인정보 처리 방침](https://www.cloudflare.com/privacypolicy/)

## H. 비상 계획

- 접속 오류 시 MC가 투표를 일시 중단하고 운영자에게 상황 확인 요청.
- Cloudflare Workers 또는 D1 한도 초과/장애 시 즉시 대체 투표 방식(예: 사전 배치한 종이 투표)을 안내.
- 오류 발생 때 서버가 투표 접수 확인을 반환하지 않았으면 **성공한 표로 안내하지 않습니다.**
- 결과 공개 전에 운영자 화면에서 최종 집계를 확인하고 오류가 있는 경우 승자 발표를 보류.
