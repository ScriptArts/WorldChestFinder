import { describe, expect, it } from 'vitest'
import {
  buildLogFileName,
  formatLogLine,
  isLogFileExpired,
  parseLogFileDate,
  resolveLogsDirectory
} from '../src/main/logging/AppLogger'

describe('AppLogger helpers', () => {
  it('resolves dev logs directory under project logs/', () => {
    expect(resolveLogsDirectory(false, '/tmp/user-data', '/project')).toBe('/project/logs')
  })

  it('resolves packaged logs directory under userData/logs', () => {
    expect(resolveLogsDirectory(true, '/tmp/user-data', '/project')).toBe('/tmp/user-data/logs')
  })

  it('builds daily log file name', () => {
    expect(buildLogFileName(new Date(2026, 4, 26))).toBe('world-chest-finder-2026-05-26.log')
  })

  it('parses log file date', () => {
    const parsed = parseLogFileDate('world-chest-finder-2026-05-26.log')
    expect(parsed).not.toBeNull()
    if (parsed !== null) {
      expect(parsed.getFullYear()).toBe(2026)
      expect(parsed.getMonth()).toBe(4)
      expect(parsed.getDate()).toBe(26)
    }
  })

  it('expires logs older than retention days', () => {
    const now = new Date(2026, 4, 26)
    expect(isLogFileExpired('world-chest-finder-2026-05-18.log', now, 7)).toBe(true)
    expect(isLogFileExpired('world-chest-finder-2026-05-20.log', now, 7)).toBe(false)
  })

  it('formats log line with details', () => {
    const line = formatLogLine('info', 'app', '起動', { version: '0.1.0' }, new Date('2026-05-26T11:00:00.000Z'))
    expect(line).toContain('[INFO ]')
    expect(line).toContain('[app    ]')
    expect(line).toContain('起動')
    expect(line).toContain('"version":"0.1.0"')
  })
})
