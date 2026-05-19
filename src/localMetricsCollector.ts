import * as os from 'os'
import * as fsp from 'fs/promises'
import { exec } from 'child_process'
import { promisify } from 'util'

import { ServerMetrics } from './metricsCollector'

const execAsync = promisify(exec)
const platform = os.platform()
const isMacOS = platform === 'darwin'
const isLinux = platform === 'linux'
const isWindows = platform === 'win32'

export class LocalMetricsCollector {
    private prevCpu: { idle: number, total: number } | null = null

    async fetch (): Promise<ServerMetrics> {
        const cpu = this.readCpu()
        const mem = await this.readMemory()
        const disk = await this.readDisk()
        const battery = await this.readBattery()
        const load = this.readLoad()
        const uptime = os.uptime()
        return { cpu, mem, disk, load, uptime, battery }
    }

    // os.cpus()는 부팅 이후 누적 시간만 주므로 두 샘플의 차이로 계산 (모든 OS)
    private readCpu (): number | undefined {
        const cpus = os.cpus()
        let totalIdle = 0, totalAll = 0
        for (const c of cpus) {
            for (const t of Object.values(c.times)) {
                totalAll += t
            }
            totalIdle += c.times.idle
        }
        let cpu: number | undefined
        if (this.prevCpu) {
            const idleDiff = totalIdle - this.prevCpu.idle
            const totalDiff = totalAll - this.prevCpu.total
            cpu = totalDiff > 0 ? (1 - idleDiff / totalDiff) * 100 : 0
        }
        this.prevCpu = { idle: totalIdle, total: totalAll }
        return cpu
    }

    private readLoad (): number | undefined {
        // Windows는 os.loadavg() 가 항상 [0,0,0] 이라 의미 없음 → undefined 로 표기는 '—'
        if (isWindows) {
            return undefined
        }
        return os.loadavg()[0]
    }

    // OS별 메모리 처리
    private async readMemory (): Promise<number | undefined> {
        if (isMacOS) { return this.readMacMemory() }
        if (isLinux) {
            // /proc/meminfo의 MemAvailable 이 가장 정확한 "사용 가능" 값
            // (buffer/cache 회수 가능 영역까지 포함).
            try {
                const content = await fsp.readFile('/proc/meminfo', 'utf-8')
                const total = parseMeminfo(content, 'MemTotal')
                const available = parseMeminfo(content, 'MemAvailable')
                if (total && available != null) {
                    return (total - available) / total * 100
                }
            } catch {
                // fall through
            }
        }
        // Windows 및 fallback
        return this.readGenericMemory()
    }

    private readGenericMemory (): number {
        const total = os.totalmem()
        const free = os.freemem()
        return (1 - free / total) * 100
    }

    // macOS vm_stat: wired + active + compressed (Activity Monitor "메모리 사용량")
    private async readMacMemory (): Promise<number | undefined> {
        try {
            const { stdout } = await execAsync('vm_stat')
            const pageSizeMatch = stdout.match(/page size of (\d+) bytes/)
            const pageSize = pageSizeMatch ? parseInt(pageSizeMatch[1]!, 10) : 4096

            const getPages = (key: string): number => {
                const m = stdout.match(new RegExp(`${key}:\\s+(\\d+)\\.?`))
                return m ? parseInt(m[1]!, 10) : 0
            }

            const active = getPages('Pages active')
            const wired = getPages('Pages wired down')
            const compressed = getPages('Pages occupied by compressor')

            const totalPages = os.totalmem() / pageSize
            const usedPages = wired + active + compressed
            return usedPages / totalPages * 100
        } catch {
            return this.readGenericMemory()
        }
    }

    // OS별 디스크 처리.
    // macOS: native API (swift) — Finder/iStat 과 동일한 "사용 가능" 값
    // Linux/Windows: Node 18+ 의 fs.statfs() — purgeable 없는 일반 사용률
    private async readDisk (): Promise<number | undefined> {
        if (isMacOS) {
            const v = await this.readMacDisk()
            if (v != null) { return v }
        }
        // 모든 OS 공통: fs.statfs 시도
        try {
            const target = isWindows ? `${process.env.SystemDrive ?? 'C:'}\\` : '/'
            const stats = await (fsp as any).statfs?.(target)
            if (stats) {
                const total = Number(stats.blocks) * Number(stats.bsize)
                const free = Number(stats.bavail) * Number(stats.bsize)
                if (total > 0) {
                    return (total - free) / total * 100
                }
            }
        } catch {
            // fall through
        }
        // 최후 fallback: df (macOS/Linux)
        if (!isWindows) {
            try {
                const target = isMacOS ? '/System/Volumes/Data' : '/'
                const { stdout } = await execAsync(`df -k ${target}`)
                const cols = stdout.split('\n')[1]?.split(/\s+/) ?? []
                const capCol = cols.find(c => /^\d+%$/.test(c))
                return capCol ? parseFloat(capCol) : undefined
            } catch {
                // ignore
            }
        }
        return undefined
    }

    private async readMacDisk (): Promise<number | undefined> {
        const cmd = `swift -e 'import Foundation; let v = try? URL(fileURLWithPath: "/System/Volumes/Data").resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey]); print(v?.volumeAvailableCapacityForImportantUsage ?? 0)'`
        try {
            const { stdout: availStdout } = await execAsync(cmd, { timeout: 4000 })
            const availMatch = availStdout.match(/(\d+)/)
            const available = availMatch ? parseInt(availMatch[1]!, 10) : 0
            if (available <= 0) { return undefined }

            const { stdout: dfStdout } = await execAsync('df -k /System/Volumes/Data')
            const cols = dfStdout.split('\n')[1]?.split(/\s+/) ?? []
            const totalKb = parseInt(cols[1] ?? '0', 10)
            const total = totalKb * 1024
            return total > 0 ? (total - available) / total * 100 : undefined
        } catch {
            return undefined
        }
    }

    // OS별 배터리. macOS=pmset / Linux=/sys/class/power_supply / Windows=미지원
    private async readBattery (): Promise<{ percent: number, charging: boolean } | undefined> {
        if (isMacOS) { return this.readMacBattery() }
        if (isLinux) { return this.readLinuxBattery() }
        // Windows는 PowerShell/WMIC 가 필요하고 구현이 복잡해서 일단 미지원
        return undefined
    }

    private async readMacBattery (): Promise<{ percent: number, charging: boolean } | undefined> {
        try {
            const { stdout } = await execAsync('pmset -g batt')
            if (stdout.includes('No batteries')) { return undefined }
            const pctMatch = stdout.match(/(\d+)%/)
            if (!pctMatch) { return undefined }
            const percent = parseInt(pctMatch[1]!, 10)
            const charging = /Now drawing from\s+'AC Power'/.test(stdout)
            return { percent, charging }
        } catch {
            return undefined
        }
    }

    private async readLinuxBattery (): Promise<{ percent: number, charging: boolean } | undefined> {
        try {
            const entries = await fsp.readdir('/sys/class/power_supply').catch(() => [] as string[])
            const batName = entries.find(e => /^BAT/i.test(e))
            if (!batName) { return undefined }

            const base = `/sys/class/power_supply/${batName}`
            const [capRaw, statusRaw] = await Promise.all([
                fsp.readFile(`${base}/capacity`, 'utf-8'),
                fsp.readFile(`${base}/status`, 'utf-8').catch(() => 'Unknown'),
            ])
            const percent = parseInt(capRaw.trim(), 10)
            if (!Number.isFinite(percent)) { return undefined }
            // "Charging"·"Full"·"Not charging" 모두 AC 연결 상태로 간주
            const status = statusRaw.trim()
            const charging = status === 'Charging' || status === 'Full' || status === 'Not charging'
            return { percent, charging }
        } catch {
            return undefined
        }
    }

    dispose (): void {
        // no-op
    }
}

function parseMeminfo (content: string, key: string): number | null {
    const m = content.match(new RegExp(`^${key}:\\s+(\\d+)\\s*kB`, 'm'))
    return m ? parseInt(m[1]!, 10) * 1024 : null  // kB → bytes
}
