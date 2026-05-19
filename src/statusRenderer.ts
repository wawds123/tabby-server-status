import { ServerMetrics } from './metricsCollector'

export interface MetricHistory {
    cpu: number[]
    mem: number[]
    disk: number[]
    battery: number[]
}

export const HISTORY_LEN = 20

export function emptyHistory (): MetricHistory {
    return { cpu: [], mem: [], disk: [], battery: [] }
}

export function pushHistory (h: MetricHistory, m: ServerMetrics): void {
    const push = (arr: number[], v: number | undefined): void => {
        if (v == null || Number.isNaN(v)) { return }
        arr.push(v)
        if (arr.length > HISTORY_LEN) {
            arr.shift()
        }
    }
    push(h.cpu, m.cpu)
    push(h.mem, m.mem)
    push(h.disk, m.disk)
    push(h.battery, m.battery?.percent)
}

export function renderMetrics (target: HTMLElement, m: ServerMetrics | null, statusText: string | null, h: MetricHistory): void {
    if (!m) {
        target.innerHTML = `<span class="status">${escape(statusText ?? '…')}</span>`
        return
    }
    const cell = (icon: string, label: string, value: string, pct?: number, sparkData?: number[], klass = ''): string => {
        const style = pct != null ? ` style="--metric-pct:${Math.min(100, Math.max(0, pct))}%"` : ''
        const classAttr = `metric${pct != null ? ' has-gauge' : ''}${klass ? ' ' + klass : ''}`
        return `<span class="${classAttr}"${style}><i class="fas fa-${icon} metric-icon"></i><b>${label}</b> ${value}${spark(sparkData)}</span>`
    }
    const parts = [
        cell('microchip',   'CPU',  fmtPct(m.cpu),  m.cpu,  h.cpu,  pctClass(m.cpu)),
        cell('memory',      'MEM',  fmtPct(m.mem),  m.mem,  h.mem,  pctClass(m.mem)),
        cell('hard-drive',  'DISK', fmtPct(m.disk), m.disk, h.disk, pctClass(m.disk)),
        cell('gauge-high',  'LOAD', fmtNum(m.load, 2)),
        cell('clock',       'UP',   fmtUptime(m.uptime)),
    ]
    if (m.battery) {
        const value = `${m.battery.percent}%${m.battery.charging ? ' ⚡' : ''}`
        const batClass = `battery${m.battery.percent < 20 ? ' critical' : ''}`
        parts.push(cell(batteryIcon(m.battery.percent), 'BAT', value, m.battery.percent, h.battery, batClass))
    }
    target.innerHTML = parts.join('')
}

function fmtPct (v: number | undefined): string {
    return v == null || Number.isNaN(v) ? '—' : `${v.toFixed(0)}%`
}

function fmtNum (v: number | undefined, digits: number): string {
    return v == null || Number.isNaN(v) ? '—' : v.toFixed(digits)
}

function fmtUptime (seconds: number | undefined): string {
    if (seconds == null || Number.isNaN(seconds)) {
        return '—'
    }
    const d = Math.floor(seconds / 86400)
    const h = Math.floor(seconds % 86400 / 3600)
    const m = Math.floor(seconds % 3600 / 60)
    if (d > 0) { return `${d}d ${h}h` }
    if (h > 0) { return `${h}h ${m}m` }
    return `${m}m`
}

function pctClass (v: number | undefined): string {
    if (v == null) { return '' }
    if (v >= 90) { return 'critical' }
    if (v >= 70) { return 'warning' }
    return ''
}

function batteryIcon (percent: number): string {
    if (percent >= 87) { return 'battery-full' }
    if (percent >= 62) { return 'battery-three-quarters' }
    if (percent >= 37) { return 'battery-half' }
    if (percent >= 12) { return 'battery-quarter' }
    return 'battery-empty'
}

function spark (vals?: number[]): string {
    if (!vals || vals.length === 0) { return '' }
    const bars = vals.map(v => {
        const h = Math.max(6, Math.min(100, v))
        return `<span style="height:${h}%"></span>`
    }).join('')
    return `<span class="spark">${bars}</span>`
}

function escape (s: string): string {
    return s.replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]!))
}
