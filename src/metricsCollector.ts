// SSHSession은 tabby-ssh의 public API에서 export되지 않아 minimal duck type을 사용
interface SSHSessionLike {
    ssh: any
}

export interface ServerMetrics {
    cpu?: number
    mem?: number
    disk?: number
    load?: number
    uptime?: number
    battery?: { percent: number, charging: boolean }
}

// Linux 가정 (/proc, top, free, df). macOS 서버는 추후 분기.
// 한 줄 명령으로 모든 값을 모아 `cpu|mem|disk|load|uptime` 형식으로 반환.
const METRIC_COMMAND = [
    `printf '%s|%s|%s|%s|%s\\n'`,
    `"$(top -bn1 2>/dev/null | awk '/Cpu\\(s\\)/{print 100-$8; exit}')"`,
    `"$(free 2>/dev/null | awk '/Mem:/{printf \"%.1f\", $3/$2*100}')"`,
    `"$(df -P / 2>/dev/null | awk 'NR==2{gsub(\"%\",\"\",$5); print $5}')"`,
    `"$(awk '{print $1}' /proc/loadavg 2>/dev/null)"`,
    `"$(awk '{print $1}' /proc/uptime 2>/dev/null)"`,
].join(' ')

export class MetricsCollector {
    private disposed = false
    private inFlight: Promise<ServerMetrics> | null = null

    constructor (private sshSession: SSHSessionLike) {}

    async fetch (): Promise<ServerMetrics> {
        if (this.disposed) {
            throw new Error('collector disposed')
        }
        // 동시 호출 방지: 직전 fetch가 아직 안 끝났으면 그걸 재사용
        if (this.inFlight) {
            return this.inFlight
        }
        this.inFlight = this.runOnce().finally(() => { this.inFlight = null })
        return this.inFlight
    }

    private async runOnce (): Promise<ServerMetrics> {
        const ssh = (this.sshSession as any).ssh
        if (!ssh || typeof ssh.openSessionChannel !== 'function') {
            throw new Error('not authenticated')
        }

        const rawChannel = await ssh.openSessionChannel()
        const channel = await ssh.activateChannel(rawChannel)

        let stdout = ''
        const decoder = new TextDecoder()
        const dataSub = channel.data$.subscribe((data: Uint8Array) => {
            stdout += decoder.decode(data)
        })

        const done = new Promise<void>(resolve => {
            const sub = channel.closed$.subscribe(() => {
                sub.unsubscribe()
                resolve()
            })
        })

        // requestExec: russh의 exec 요청. 메서드 명이 다르면 여기서 잡힘.
        if (typeof channel.requestExec !== 'function') {
            channel.close()
            throw new Error('channel.requestExec not available')
        }
        await channel.requestExec(METRIC_COMMAND)

        // 안전망: 너무 오래 걸리면 강제 종료
        const timeout = new Promise<void>(resolve => setTimeout(resolve, 8000))
        await Promise.race([done, timeout])

        dataSub.unsubscribe()
        try { channel.close() } catch { /* already closed */ }

        return parseOutput(stdout)
    }

    dispose (): void {
        this.disposed = true
    }
}

function parseOutput (raw: string): ServerMetrics {
    const line = raw.split('\n').map(l => l.trim()).filter(l => l.includes('|')).pop() ?? ''
    const [cpu, mem, disk, load, uptime] = line.split('|')
    const toNum = (s: string | undefined): number | undefined => {
        if (!s) { return undefined }
        const n = parseFloat(s)
        return Number.isFinite(n) ? n : undefined
    }
    return {
        cpu: toNum(cpu),
        mem: toNum(mem),
        disk: toNum(disk),
        load: toNum(load),
        uptime: toNum(uptime),
    }
}
