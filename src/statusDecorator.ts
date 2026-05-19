import { Injectable } from '@angular/core'
import { TerminalDecorator, BaseTerminalTabComponent } from 'tabby-terminal'

import { MetricsCollector, ServerMetrics } from './metricsCollector'
import { LocalMetricsCollector } from './localMetricsCollector'
import { MetricHistory, emptyHistory, pushHistory, renderMetrics } from './statusRenderer'

interface MetricsSource {
    fetch(): Promise<ServerMetrics>
    dispose(): void
}

const POLL_INTERVAL_MS = 5000

@Injectable()
export class ServerStatusDecorator extends TerminalDecorator {
    private collectors = new Map<BaseTerminalTabComponent<any>, MetricsSource>()
    private timers = new Map<BaseTerminalTabComponent<any>, ReturnType<typeof setInterval>>()
    private bars = new Map<BaseTerminalTabComponent<any>, HTMLElement>()
    private history = new Map<BaseTerminalTabComponent<any>, MetricHistory>()

    attach (terminal: BaseTerminalTabComponent<any>): void {
        const profileType = (terminal as any).profile?.type as string | undefined
        const isSSH = profileType === 'ssh'
        const isLocal = profileType === 'local'
        if (!isSSH && !isLocal) {
            return
        }

        const host = this.findHostElement(terminal)
        if (!host) {
            return
        }

        const bar = document.createElement('div')
        bar.className = 'tabby-server-status-bar'
        bar.innerHTML = isSSH
            ? '<span class="status">connecting…</span>'
            : '<span class="status">…</span>'
        host.appendChild(bar)
        this.bars.set(terminal, bar)
        this.history.set(terminal, emptyHistory())

        // 상태바 높이만큼 host에 padding-bottom을 잡아 xterm 영역을 침범하지 않게 한다.
        const applyPadding = (): void => {
            const h = bar.offsetHeight
            if (h > 0) {
                host.style.paddingBottom = `${h}px`
                window.dispatchEvent(new Event('resize'))  // xterm fit 트리거
            }
        }
        applyPadding()
        const ro = new ResizeObserver(applyPadding)
        ro.observe(bar)
        ;(bar as any)._resizeObserver = ro

        if (isLocal) {
            this.collectors.set(terminal, new LocalMetricsCollector())
        }

        const tick = async (): Promise<void> => {
            const h = this.history.get(terminal)!
            if (isSSH && !this.collectors.has(terminal)) {
                const sshSession = (terminal as any).sshSession
                if (!sshSession) {
                    renderMetrics(bar, null, 'connecting…', h)
                    return
                }
                this.collectors.set(terminal, new MetricsCollector(sshSession))
            }
            try {
                const m = await this.collectors.get(terminal)!.fetch()
                pushHistory(h, m)
                renderMetrics(bar, m, null, h)
            } catch (err) {
                renderMetrics(bar, null, String(err).slice(0, 80), h)
            }
        }

        tick().catch(() => null)
        const timer = setInterval(() => { tick().catch(() => null) }, POLL_INTERVAL_MS)
        this.timers.set(terminal, timer)
    }

    detach (terminal: BaseTerminalTabComponent<any>): void {
        super.detach(terminal)
        const timer = this.timers.get(terminal)
        if (timer) {
            clearInterval(timer)
            this.timers.delete(terminal)
        }
        this.collectors.get(terminal)?.dispose()
        this.collectors.delete(terminal)
        const bar = this.bars.get(terminal)
        if (bar) {
            ;(bar as any)._resizeObserver?.disconnect()
            const host = bar.parentElement
            if (host) {
                host.style.paddingBottom = ''
            }
            bar.remove()
        }
        this.bars.delete(terminal)
        this.history.delete(terminal)
    }

    private findHostElement (terminal: BaseTerminalTabComponent<any>): HTMLElement | null {
        const el = terminal.element?.nativeElement as HTMLElement | undefined
        if (!el) {
            return null
        }
        if (getComputedStyle(el).position === 'static') {
            el.style.position = 'relative'
        }
        return el
    }
}
