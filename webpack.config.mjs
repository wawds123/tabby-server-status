import * as fs from 'fs'
import * as path from 'path'
import * as url from 'url'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))

// 본 저장소 webpack.plugin.config.mjs 위치를 동적으로 찾는다.
// (사이드 디렉터리에서 직접 호출, 본 저장소 안 symlink로 호출 둘 다 지원)
const candidates = [
    path.resolve(__dirname, '../webpack.plugin.config.mjs'),
    path.resolve(__dirname, '../tabby/webpack.plugin.config.mjs'),
]

export default async () => {
    const pluginConfigPath = candidates.find(p => fs.existsSync(p))
    if (!pluginConfigPath) {
        throw new Error(`Could not locate tabby webpack.plugin.config.mjs; tried:\n  ${candidates.join('\n  ')}`)
    }

    // 본 저장소 webpack.plugin.config.mjs는 dirname 기준으로 modules 경로를 계산한다.
    // dirname을 본 저장소 안 symlink 위치(./tabby-server-status)로 강제해야
    // ../app/node_modules, ../node_modules 가 본 저장소 안 디렉터리를 가리킨다.
    const tabbyRoot = path.dirname(pluginConfigPath)
    const inRepoDir = path.resolve(tabbyRoot, 'tabby-server-status')

    const { default: config } = await import(url.pathToFileURL(pluginConfigPath).href)
    const cfg = config({
        name: 'tabby-server-status',
        dirname: inRepoDir,
    })
    // webpack이 symlink를 realpath로 따라가지 않도록 → ts 컴파일러와 일관된 경로 사용
    cfg.resolve = cfg.resolve ?? {}
    cfg.resolve.symlinks = false
    return cfg
}
