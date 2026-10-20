import { test, expect } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth } from '../../utils/gantt-hook'

let backend: ChildProcess
let backendUrl: string

test.beforeAll(async () => {
  backend = spawn('../ai-server/.venv/bin/python', ['scripts/rbot-provider-fixture.py'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  backendUrl = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('AI fixture did not start')), 20_000)
    backend.once('error', (error) => { clearTimeout(timer); reject(error) })
    backend.once('exit', (code) => { clearTimeout(timer); reject(new Error(`AI fixture exited: ${code}`)) })
    backend.stdout!.on('data', (data) => {
      const port = String(data).match(/PORT=(\d+)/)?.[1]
      if (port) { clearTimeout(timer); resolve(`http://127.0.0.1:${port}`) }
    })
    backend.stderr!.on('data', (data) => process.stderr.write(data))
  })
  await expect.poll(async () => {
    try { return (await fetch(`${backendUrl}/ai/health`)).status } catch { return 0 }
  }).toBe(200)
})

test.afterAll(() => { backend?.kill('SIGTERM') })

function screenshotPath(state: string) {
  const dir = '../docs/assets/screenshots/gantt'
  mkdirSync(dir, { recursive: true })
  let version = 1
  while (existsSync(path.join(dir, `rbot-provider-${state}-Ver${version}.png`))) version++
  return path.join(dir, `rbot-provider-${state}-Ver${version}.png`)
}

test('provider outage gives a safe reply; a follow-up recovers after retries', async ({ page, request }) => {
  test.setTimeout(120_000)
  await seedGanttAuth(page, request)
  // Forward the UI's actual chat request to the real isolated backend, not a chat stub.
  await page.route('**/ai/chat', async (route) => {
    const response = await route.fetch({ url: `${backendUrl}/ai/chat` })
    await route.fulfill({ response })
  })
  await new GanttDashboardPage(page).goto()
  await page.getByTestId('ai-chat-toggle').click()
  const input = page.getByTestId('ai-chat-input')
  const send = page.getByTestId('ai-chat-send')
  const replies = page.getByTestId('ai-chat-thread').locator(':scope > .text-left')
  const failedPrompt = 'What does the roster show while the provider is unavailable?'
  await input.fill(failedPrompt)
  await send.click()
  await expect(replies.last()).toHaveText('The AI service is temporarily unavailable after retrying. Please try again shortly.', { timeout: 15_000 })
  await expect(page.getByTestId('ai-chat-applied')).toHaveCount(0)
  await expect(replies).toHaveCount(1)
  await page.screenshot({ path: screenshotPath('unavailable') })

  const recoveredPrompt = 'What does the roster pane show?'
  await input.fill(recoveredPrompt)
  await expect(send).toBeEnabled()
  await send.click()
  await expect(replies.last()).toHaveText('The roster pane shows crew rows and their assigned duties.', { timeout: 15_000 })
  await expect(replies).toHaveCount(2)
  await expect(page.getByTestId('ai-chat-thread')).not.toContainText('developer.mozilla.org')
  await expect(page.getByTestId('ai-chat-applied')).toHaveCount(0)
  const attempts = await (await request.get(`${backendUrl}/test/provider-attempts`)).json()
  expect(attempts).toEqual({ [failedPrompt]: 3, [recoveredPrompt]: 3 })
  await page.screenshot({ path: screenshotPath('recovered') })
})
