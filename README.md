# tabby-server-status

[Tabby](https://tabby.sh) 의 SSH / Local 셸 탭 하단에 시스템 상태바를 표시하는 [Tabby](https://tabby.sh) 플러그인입니다.

> ⚠️ **개인적으로 필요해서 만든 플러그인입니다.**
> 안정성·기능 완성도를 보장하지 않으며, 유지보수도 제가 필요한 만큼만 진행합니다.
> 이슈/PR 환영하지만 빠른 대응은 약속드리지 않아요.

<!-- 스크린샷 자리: docs/screenshot.png 같은 경로로 추가하면 됩니다 -->
<!-- ![Screenshot](docs/screenshot.png) -->

## 기능

각 SSH / Local 셸 탭 하단에 다음 6가지를 표시합니다:

```
🔬 CPU 23% ▁▃▅▇ 💾 MEM 84% ▆▇▇▇ 💽 DISK 62% ▇▇▇ 📊 LOAD 1.42 🕐 UP 3d 5h 🔋 BAT 87% ⚡
```

- 각 항목 옆에 **최근 100초(5초 × 20번) 추세** 스파크라인
- 셀 하단에 가는 게이지바 (현재 값)
- 70% 이상 노랑 경고, 90% 이상 빨강 critical
- 배터리는 평시 초록, 20% 미만 빨강, 충전 중이면 ⚡ 아이콘
- metric 사이 자동 균등 분할 — 값이 바뀌어도 다른 metric 자리가 안 흔들림

## OS 호환성

### Local 셸

| 메트릭 | macOS | Linux | Windows |
|---|---|---|---|
| CPU | ✓ `os.cpus()` delta | ✓ | ✓ |
| MEM | ✓ `vm_stat` (wired+active+compressed) | ✓ `/proc/meminfo` MemAvailable | △ `os.totalmem/freemem` |
| DISK | ✓ `volumeAvailableCapacityForImportantUsageKey` (swift) | ✓ `fs.statfs('/')` | ✓ `fs.statfs('C:\\')` |
| LOAD | ✓ | ✓ | `—` (Windows는 `os.loadavg()`가 항상 0) |
| UPTIME | ✓ | ✓ | ✓ |
| BAT | ✓ `pmset -g batt` | ✓ `/sys/class/power_supply/BAT*` | ✗ |

> macOS 디스크 정확도는 Xcode CLI tools(`swift` 명령)가 설치돼 있을 때 가장 정확합니다. 없으면 `df`로 자동 fallback.

### SSH 탭

원격 서버에 별도 SSH session channel을 열어 한 줄 명령을 실행합니다. **Linux 서버 가정** — macOS/BSD 서버는 일부 값이 `—`로 표시될 수 있어요. 사용자 메인 셸/히스토리/프롬프트에 영향을 주지 않습니다 (별도 채널).

## 설치

### 방법 A: 사전 빌드 zip (팀에 배포할 때 추천)

1. [Releases](https://github.com/wawds123/tabby-server-status/releases) 또는 직접 빌드된 zip을 다운로드
2. 압축 해제 후:
   ```sh
   cd tabby-server-status
   ./install.sh
   ```
3. Tabby Cmd+Q (Linux/Windows는 메뉴로 종료) → 다시 실행

`Settings → Plugins` 에 `tabby-server-status` 가 노출되면 정상.

### 방법 B: 직접 빌드 (개발하거나 기여하실 분만)

1. Node 22+ 설치 (예: `nvm install 22`)
2. Tabby 본 저장소 ([Eugeny/tabby](https://github.com/Eugeny/tabby)) 를 이 저장소의 형제 디렉터리에 클론 — 예: `~/side/tabby` 와 `~/side/tabby-server-status`
3. 본 저장소 의존성 설치: `cd ~/side/tabby && yarn` (Node 22+ 필수)
4. 본 저장소 안에 이 플러그인을 symlink:
   ```sh
   ln -sfn ~/side/tabby-server-status ~/side/tabby/tabby-server-status
   ```
   ngcc resolution이 본 저장소 안 위치에서만 통과하기 때문에 필요.
5. 이 플러그인 빌드: `cd ~/side/tabby-server-status && yarn build`
6. 정식 Tabby 플러그인 디렉터리에 symlink (개발 중 자동 반영):
   ```sh
   mkdir -p "$HOME/Library/Application Support/tabby/plugins/node_modules"
   ln -sfn ~/side/tabby-server-status \
     "$HOME/Library/Application Support/tabby/plugins/node_modules/tabby-server-status"
   ```
7. Tabby 재시작

배포용 zip 만들 때: `./package.sh` → `release/tabby-server-status-<version>.zip`

## 요구사항

- Tabby ≥ 1.0.220 (master 기반 빌드와 호환되는 정도)
- macOS / Linux / Windows
- (선택, macOS만) Xcode CLI tools — 정확한 디스크 사용률을 위해. 설치: `xcode-select --install`

## 파일 구성

```
src/
├─ index.ts                  # NgModule + TerminalDecorator multi-provider
├─ statusDecorator.ts        # 탭별 attach/detach, 5초 폴링
├─ statusRenderer.ts         # 공통 render / spark / history helpers
├─ metricsCollector.ts       # SSH exec 채널 + 한 줄 명령 + 파싱
├─ localMetricsCollector.ts  # OS별 분기 (vm_stat / proc / fs.statfs / swift / pmset)
└─ statusBar.scss            # 스타일 (게이지·스파크·아이콘·세로 구분선)
```

## 알려진 한계

- **Windows 배터리**: PowerShell / WMIC 구현이 번거로워 일단 제외. PR 환영.
- **SSH 명령은 Linux 가정**: macOS/BSD SSH 서버에서는 일부 metric이 `—`. OS 자동 감지(uname) 후 분기는 미구현.
- **internal API 의존**: `SSHSession.ssh` 필드(`russh.AuthenticatedSSHClient`)와 `BaseTerminalTabComponent.element` 에 직접 접근합니다. Tabby 본체 리팩터링에 따라 깨질 수 있어요.

## 면책

이 플러그인은 **개인적으로 macOS 데스크탑에서 서버 상태를 보기 위해 만든 취미 프로젝트**입니다:

- 운영 환경에서의 안정성 보증 X
- 메이저 Tabby 버전 업그레이드 시 동작 보장 X
- 모든 OS·서버 디스트로 호환성 보증 X

자유롭게 fork 해서 자신의 환경에 맞게 고치셔도 됩니다.

## License

MIT
