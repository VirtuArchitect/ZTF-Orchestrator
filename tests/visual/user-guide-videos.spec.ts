import { expect, test } from '@playwright/test'
import { inflateSync } from 'node:zlib'

for (const width of [1440, 390]) {
  test(`landing and video pages link the current PDF and Word manual at ${width}px`, async ({ page }) => {
    test.skip(process.env.ZTF_TEST_STATIC_DEMO !== '1', 'Requires assembled Pages or published site')
    await page.setViewportSize({ width, height: 1000 })
    const manuals = {
      pdf: 'https://github.com/VirtuArchitect/ZTF-Orchestrator/releases/download/v1.8.5-rc1/ZTF-Orchestrator-Administrator-and-User-Guide-v1.8.5-rc1-2026-11-22.pdf',
      word: 'https://github.com/VirtuArchitect/ZTF-Orchestrator/releases/download/v1.8.5-rc1/ZTF-Orchestrator-Administrator-and-User-Guide-v1.8.5-rc1-2026-11-22.docx',
    }
    for (const route of ['./', 'tutorials/']) {
      await page.goto(route)
      for (const kind of ['pdf', 'word'] as const) {
        const link = page.locator(`#admin-guide-${kind}`)
        await link.scrollIntoViewIfNeeded()
        await expect(link).toBeVisible()
        await expect(link).toHaveAttribute('href', manuals[kind])
        await expect(link).toContainText(kind === 'pdf' ? /PDF/ : /Word/)
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
    }
  })
}

test('landing and video pages expose the same complete-series release download', async ({ page }) => {
  test.skip(process.env.ZTF_TEST_STATIC_DEMO !== '1', 'Requires assembled Pages or published site')
  const asset = 'ZTF-Orchestrator-User-Guide-Videos-Revised-2026-11-22.zip'
  const url = `https://github.com/VirtuArchitect/ZTF-Orchestrator/releases/download/v1.8.5-rc1/${asset}`
  for (const route of ['', 'tutorials/']) {
    await page.goto(route || './')
    await expect(page.locator('#series-zip-download')).toBeVisible()
    await expect(page.locator('#series-zip-download')).toHaveAttribute('href', url)
    await expect(page.locator('#series-zip-checksum')).toHaveAttribute('href', url + '.sha256')
    await expect(page.locator('#series-zip-download')).toContainText('23')
  }
})

for (const width of [1440, 390]) {
  test(`video guide opens Overview 00 and seeks chapters at ${width}px`, async ({ page }) => {
    test.skip(process.env.ZTF_TEST_STATIC_DEMO !== '1', 'Requires the assembled Pages demo')
    await page.setViewportSize({ width, height: 1000 })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('tutorials/')
    await expect(page.locator('#parts button')).toHaveCount(23)
    await expect(page.locator('#parts button').first()).toHaveText('00. ZTF-Orchestrator Overview')
    await expect(page.locator('#title')).toContainText('ZTF-Orchestrator Overview')
    await expect.poll(() => page.locator('video').evaluate(video => video.videoWidth)).toBe(1920)
    await expect(page.locator('#chapters button')).toHaveCount(6)
    await page.locator('#chapters button').last().click()
    await expect.poll(() => page.locator('video').evaluate(video => video.currentTime)).toBeGreaterThan(79)
    await page.locator('video').evaluate(video => video.pause())
    await expect(page.getByRole('link', { name: 'Transcript', exact: true })).toHaveAttribute('href', /media\/.*Part-00.*-transcript\.txt$/)
    await page.locator('#parts button').nth(11).click()
    await expect(page.locator('#title')).toContainText('Part 11')
    await expect(page.locator('#chapters')).toContainText(/session/i)
    await expect(page.getByRole('link', { name: 'Captions (VTT)', exact: true })).toHaveAttribute('href', /media\/.*Part-11.*\.vtt$/)
    await expect(page.getByRole('link', { name: 'Chapter list', exact: true })).toHaveAttribute('href', /media\/.*Part-11.*-chapters\.txt$/)
    await page.getByRole('button', { name: /^14\. Foundation/ }).click()
    await expect(page.locator('#title')).toContainText('Part 14')
    await expect(page.locator('#chapters button')).toHaveCount(5)
    await expect(page.locator('body')).toContainText('Simulated examples')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    expect(errors).toEqual([])
    await page.locator('#parts button').first().click()
    await page.screenshot({ path: `test-results/user-guide-videos-${width}.png`, fullPage: true })
  })
}

test('mobile transcript Back restores the selected part and timestamp without playing', async ({ page }) => {
  test.skip(process.env.ZTF_TEST_STATIC_DEMO !== '1', 'Requires the assembled Pages demo')
  await page.setViewportSize({ width: 390, height: 720 })
  await page.goto('tutorials/')
  const player = page.locator('video')
  await expect(player).toHaveAttribute('playsinline', '')
  const selected = page.getByRole('button', { name: /^11\. Administration/ })
  const fullyVisible = () => player.evaluate(video => {
    const { top, bottom } = video.getBoundingClientRect()
    return top >= 0 && bottom <= window.innerHeight
  })

  await selected.click()
  await expect(page).toHaveURL(/\?part=11$/)
  await expect(selected).toHaveAttribute('aria-current', 'true')
  await expect.poll(fullyVisible).toBe(true)
  await expect(player).toBeFocused()
  await expect.poll(() => player.evaluate(video => video.videoWidth)).toBe(1920)

  await page.getByRole('button', { name: /Interpret session counts/ }).click()
  await expect.poll(fullyVisible).toBe(true)
  await expect.poll(() => player.evaluate(video => video.currentTime)).toBeGreaterThanOrEqual(20)
  await expect.poll(() => player.evaluate(video => video.paused)).toBe(false)
  const beforeTranscript = await player.evaluate(video => video.currentTime)
  await page.getByRole('link', { name: 'Transcript', exact: true }).click()
  await expect(page).toHaveURL(/Part-11.*-transcript\.txt$/)
  await page.goBack()
  await expect(page).toHaveURL(/\?part=11$/)
  await expect(page.locator('#title')).toContainText('Part 11')
  await expect(selected).toHaveAttribute('aria-current', 'true')
  await expect.poll(() => player.evaluate(video =>
    video.readyState >= 2 && !video.seeking && video.paused ? video.currentTime : -1
  )).toBeGreaterThanOrEqual(beforeTranscript - 0.1)
  expect(await player.evaluate(video => video.currentTime)).toBeLessThan(beforeTranscript + 2)
  await page.reload()
  await expect(page.locator('#title')).toContainText('Part 11')
  await expect.poll(() => player.evaluate(video => video.currentTime)).toBe(0)

  await page.goto('tutorials/?part=99')
  await expect(page.locator('#title')).toContainText('Part 00')
})

test('the recovery documentation deep link opens the full recovery walkthrough', async ({ page }) => {
  test.skip(process.env.ZTF_TEST_STATIC_DEMO !== '1', 'Requires the assembled Pages demo')
  await page.goto('tutorials/?part=15')
  await expect(page.getByRole('heading', { name: /^Part 15: Disaster Recovery Start to Finish \(\d+:\d{2}\)$/ })).toBeVisible()
  await expect(page.getByRole('button', { name: '15. Disaster Recovery Start to Finish' })).toHaveAttribute('aria-current', 'true')
  const player = page.locator('video')
  await expect.poll(() => player.evaluate(video => video.videoWidth)).toBe(1920)
  const download = page.getByRole('link', { name: 'Download MP4', exact: true })
  await expect(download).toHaveAttribute('href', /^media\/.*Part-15.*\.mp4$/)
  expect(await player.evaluate(video => video.currentSrc)).toBe(await download.evaluate(link => link.href))
  await expect(page.locator('#chapters button')).toHaveCount(7)
  await page.getByRole('button', { name: /Accept the handoff/ }).click()
  await expect.poll(() => player.evaluate(video => video.currentTime)).toBeGreaterThan(95)
  for (const link of await page.locator('#downloads a').all()) {
    const response = await page.request.get(await link.evaluate(el => el.href), { headers: { Range: 'bytes=0-63' } })
    expect(response.ok()).toBe(true)
    await response.dispose()
  }
})

test('the disk expansion deep link plays and seeks to readiness', async ({ page }) => {
  test.skip(process.env.ZTF_TEST_STATIC_DEMO !== '1', 'Requires the assembled Pages demo')
  await page.goto('tutorials/?part=17')
  await expect(page.getByRole('heading', { name: /^Part 17: Production Ubuntu VM Disk Expansion \(\d+:\d{2}\)$/ })).toBeVisible()
  await expect(page.getByRole('button', { name: '17. Production Ubuntu VM Disk Expansion' })).toHaveAttribute('aria-current', 'true')
  const player = page.locator('video')
  await expect.poll(() => player.evaluate(video => video.videoWidth)).toBe(1920)
  await expect(page.locator('#chapters button')).toHaveCount(5)
  await page.getByRole('button', { name: /Check guided update readiness/ }).click()
  await expect.poll(() => player.evaluate(video => video.currentTime)).toBeGreaterThan(60)
  await expect.poll(() => player.evaluate(video => video.paused)).toBe(false)
  for (const link of await page.locator('#downloads a').all()) {
    const response = await page.request.get(await link.evaluate(el => el.href), { headers: { Range: 'bytes=0-63' } })
    expect(response.ok()).toBe(true)
    await response.dispose()
  }
})


for (let part = 0; part < 23; part++) {
  test(`published part ${part} plays with caption companions and working chapter links`, async ({ page }) => {
    test.skip(process.env.ZTF_TEST_STATIC_DEMO !== '1', 'Requires assembled Pages or published site')
    await page.goto(`tutorials/?part=${String(part).padStart(2, '0')}`)
    const player = page.locator('video')
    await expect(page.locator('#parts button')).toHaveCount(23)
    await expect.poll(() => player.evaluate(video => video.videoWidth)).toBe(1920)
    const duration = await player.evaluate(video => video.duration)
    expect(duration).toBeGreaterThan(60)
    await page.locator('#chapters button').last().click()
    await expect.poll(() => player.evaluate(video => !video.paused && video.currentTime > 10)).toBe(true)
    await expect.poll(() => player.evaluate(video => video.error)).toBe(null)
    for (const label of ['Captions (VTT)', 'Captions (SRT)', 'Chapter list', 'Transcript']) {
      const link = page.getByRole('link', { name: label, exact: true })
      const response = await page.request.get(await link.evaluate(el => el.href))
      expect(response.ok()).toBe(true)
      const text = await response.text()
      expect(text.length).toBeGreaterThan(50)
      if (label === 'Captions (VTT)') expect(text).toMatch(/^WEBVTT/)
      if (label.startsWith('Captions')) expect(text).toContain('-->')
    }
  })
}


test('Part 02 keeps its URL and explains the three deployment services', async ({ page }) => {
  test.skip(process.env.ZTF_TEST_STATIC_DEMO !== '1', 'Requires assembled Pages or published site')
  await page.goto('tutorials/?part=02')
  await expect(page.locator('#title')).toContainText('Create Cluster Workflows and Deployment Use Cases')
  await expect(page.locator('#chapters button')).toHaveCount(8)
  const player = page.locator('video')
  for (const title of ['Use a classic Foundation VM', 'Use Foundation Central', 'Use a standalone FCA']) {
    await page.getByRole('button', { name: new RegExp(title) }).click()
    await expect.poll(() => player.evaluate(v => v.readyState >= 2 && !v.paused && !v.seeking)).toBe(true)
    await expect.poll(() => player.evaluate(v => v.currentTime)).toBeGreaterThan(10)
  }
  await expect(page.getByRole('link', { name: 'Download MP4', exact: true })).toHaveAttribute('href', /Part-02-Deploy-a-Cluster-with-Foundation-VM\.mp4$/)
})

type CaptionSample = {
  time: number; region: [number, number, number, number];
  ink: 'light' | 'dark'; threshold: number; referenceMaskZlib: string;
}

test.describe('Burned-in caption pixels', () => {
  let records: { part: number; browserSamples: CaptionSample[] }[] = []
  test.beforeAll(async ({ request }) => {
    if (process.env.ZTF_TEST_STATIC_DEMO !== '1') return
    const response = await request.get('tutorials/media/caption-render-audit.json')
    expect(response.ok()).toBe(true)
    records = (await response.json()).records
    const manifest = await (await request.get('tutorials/media/series-manifest.json')).json()
    records = records.map(record => {
      const offset = manifest.verification.find((row: { part: number }) => row.part === record.part).introSeconds || 0
      return { ...record, browserSamples: record.browserSamples.map(sample => ({ ...sample, time: sample.time + offset })) }
    })
  })
  for (let part = 0; part < 23; part++) {
    test(`part ${part} displays the expected changing caption text`, async ({ page }) => {
      test.skip(process.env.ZTF_TEST_STATIC_DEMO !== '1', 'Requires assembled Pages or published site')
      await page.goto(`tutorials/?part=${String(part).padStart(2, '0')}`)
      const player = page.locator('video')
      await expect.poll(() => player.evaluate(v => v.videoWidth)).toBe(1920)
      for (const sample of records.find(r => r.part === part)!.browserSamples) {
        const expected = inflateSync(Buffer.from(sample.referenceMaskZlib, 'base64'))
        const actual = await player.evaluate(async (video, cue) => {
          video.pause()
          await new Promise<void>(resolve => {
            video.requestVideoFrameCallback(() => resolve())
            video.currentTime = cue.time
          })
          const [x, y, width, height] = cue.region
          const canvas = document.createElement('canvas')
          canvas.width = width; canvas.height = height
          const context = canvas.getContext('2d')!
          context.drawImage(video, x, y, width, height, 0, 0, width, height)
          const pixels = context.getImageData(0, 0, width, height).data
          const mask = []
          for (let i = 0; i < pixels.length; i += 4) {
            const gray = .299 * pixels[i] + .587 * pixels[i + 1] + .114 * pixels[i + 2]
            mask.push(cue.ink === 'dark' ? Number(gray < cue.threshold) : Number(gray > cue.threshold))
          }
          return mask
        }, sample)
        expect(actual.length).toBe(expected.length)
        let common = 0, referenceInk = 0, actualInk = 0
        for (let i = 0; i < actual.length; i++) {
          referenceInk += expected[i]; actualInk += actual[i]
          common += expected[i] && actual[i] ? 1 : 0
        }
        expect(2 * common / (referenceInk + actualInk)).toBeGreaterThan(.78)
      }
    })
  }
})
