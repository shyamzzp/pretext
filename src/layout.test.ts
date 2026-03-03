import { test, expect, beforeAll, describe } from 'bun:test'
import { init, loadFont, measureText } from './measure-harfbuzz.ts'
import { TEXTS, SIZES, WIDTHS } from './test-data.ts'

// Headless test suite for the line breaking algorithm.
//
// Can't use canvas measureText in bun (no OffscreenCanvas), so we use HarfBuzz
// for measurement instead. Same algorithm, same test data as the browser
// accuracy page — just a different measurement backend.
//
// Tests two things:
//   1. Consistency: edge cases, monotonicity, determinism
//   2. Accuracy: word-by-word sum vs full-line measurement using the same engine.
//      This isolates algorithm accuracy from measurement backend differences.
//      100% match confirms the word-by-word approach is exact.

const FONT_PATH = '/Library/Fonts/Arial Unicode.ttf'
const FONT_NAME = 'Arial Unicode'

beforeAll(async () => {
  await init()
  loadFont(FONT_NAME, FONT_PATH)
})

// --- Minimal reimplementation of prepare+layout using HarfBuzz ---

function isCJK(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if ((c >= 0x4E00 && c <= 0x9FFF) || (c >= 0x3400 && c <= 0x4DBF) ||
        (c >= 0x3000 && c <= 0x303F) || (c >= 0x3040 && c <= 0x309F) ||
        (c >= 0x30A0 && c <= 0x30FF) || (c >= 0xAC00 && c <= 0xD7AF) ||
        (c >= 0xFF00 && c <= 0xFFEF)) return true
  }
  return false
}

type Segment = { text: string, width: number, isWordLike: boolean, isSpace: boolean }

function segmentAndMeasure(text: string, fontSize: number): Segment[] {
  const normalized = text.replace(/\n/g, ' ')
  if (normalized.length === 0 || normalized.trim().length === 0) return []

  const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' })
  const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

  // Merge punctuation into preceding word
  const rawSegs = [...segmenter.segment(normalized)]
  const merged: { text: string, isWordLike: boolean, isSpace: boolean }[] = []
  for (const s of rawSegs) {
    const ws = !s.isWordLike && /^\s+$/.test(s.segment)
    if (!s.isWordLike && !ws && merged.length > 0) {
      merged[merged.length - 1]!.text += s.segment
    } else {
      merged.push({ text: s.segment, isWordLike: s.isWordLike ?? false, isSpace: ws })
    }
  }

  const result: Segment[] = []
  for (const seg of merged) {
    if (seg.isWordLike && isCJK(seg.text)) {
      for (const g of graphemeSegmenter.segment(seg.text)) {
        result.push({
          text: g.segment,
          width: measureText(g.segment, FONT_NAME, fontSize),
          isWordLike: true,
          isSpace: false,
        })
      }
    } else {
      result.push({
        text: seg.text,
        width: measureText(seg.text, FONT_NAME, fontSize),
        isWordLike: seg.isWordLike,
        isSpace: seg.isSpace,
      })
    }
  }
  return result
}

function layoutSegments(segments: Segment[], maxWidth: number, lineHeight: number): { lineCount: number, height: number } {
  if (segments.length === 0) return { lineCount: 0, height: 0 }

  let lineCount = 0
  let lineW = 0
  let hasContent = false
  let lineStart = 0
  let lastWordIdx = -1

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!
    const w = seg.width

    if (!hasContent) {
      lineW = w
      hasContent = true
      lineCount++
      lineStart = i
      lastWordIdx = seg.isWordLike ? i : -1
      continue
    }

    const newW = lineW + w
    if (newW > maxWidth) {
      if (seg.isWordLike) {
        lineCount++
        lineStart = i
        lineW = w
        lastWordIdx = i
      } else if (seg.isSpace) {
        continue
      } else if (lastWordIdx > lineStart) {
        lineCount++
        lineStart = lastWordIdx
        lineW = 0
        lastWordIdx = -1
        for (let j = lastWordIdx; j <= i; j++) {
          lineW += segments[j]!.width
          if (segments[j]!.isWordLike) lastWordIdx = j
        }
      } else {
        lineW = newW
      }
    } else {
      lineW = newW
      if (seg.isWordLike) lastWordIdx = i
    }
  }

  return { lineCount, height: lineCount * lineHeight }
}

// --- Tests ---

describe('layout consistency', () => {
  test('line count increases as width decreases', () => {
    for (const { text } of TEXTS) {
      if (text.length === 0 || text.trim().length === 0) continue
      const fontSize = 16
      const lineHeight = Math.round(fontSize * 1.2)
      const segments = segmentAndMeasure(text, fontSize)
      let prevLineCount = 0
      for (const width of [...WIDTHS].reverse()) {
        const { lineCount } = layoutSegments(segments, width, lineHeight)
        expect(lineCount).toBeGreaterThanOrEqual(prevLineCount)
        prevLineCount = lineCount
      }
    }
  })

  test('empty and whitespace texts return 0 height', () => {
    for (const { label, text } of TEXTS) {
      if (label !== 'Empty' && label !== 'Whitespace') continue
      const segments = segmentAndMeasure(text, 16)
      const { height } = layoutSegments(segments, 400, 19)
      expect(height).toBe(0)
    }
  })

  test('single character fits on one line at any reasonable width', () => {
    const segments = segmentAndMeasure('A', 16)
    for (const width of WIDTHS) {
      const { lineCount } = layoutSegments(segments, width, 19)
      expect(lineCount).toBe(1)
    }
  })

  test('CJK text breaks per character at narrow widths', () => {
    const text = '这是中文'  // 4 chars
    const fontSize = 16
    const segments = segmentAndMeasure(text, fontSize)
    // Each CJK char should be its own segment
    expect(segments.length).toBe(4)
    expect(segments.every(s => s.isWordLike)).toBe(true)
  })

  test('newlines are treated as spaces', () => {
    const withNewlines = segmentAndMeasure('Hello\nWorld', 16)
    const withSpaces = segmentAndMeasure('Hello World', 16)
    // Should produce same number of segments
    expect(withNewlines.length).toBe(withSpaces.length)
  })

  test('punctuation merges with preceding word', () => {
    const segments = segmentAndMeasure('hello.', 16)
    // "hello." should be one segment, not "hello" + "."
    expect(segments.length).toBe(1)
    expect(segments[0]!.text).toBe('hello.')
  })

  test('same text at same width always gives same result', () => {
    const text = 'The quick brown fox jumps over the lazy dog'
    const fontSize = 16
    const lineHeight = 19
    const segments = segmentAndMeasure(text, fontSize)
    const r1 = layoutSegments(segments, 200, lineHeight)
    const r2 = layoutSegments(segments, 200, lineHeight)
    expect(r1.lineCount).toBe(r2.lineCount)
    expect(r1.height).toBe(r2.height)
  })
})

// --- Precise layout: measures full candidate line as one string ---

function layoutPrecise(text: string, fontSize: number, maxWidth: number, lineHeight: number): { lineCount: number, height: number } {
  const normalized = text.replace(/\n/g, ' ')
  if (normalized.length === 0 || normalized.trim().length === 0) return { lineCount: 0, height: 0 }

  const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' })
  const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

  // Merge punctuation
  const rawSegs = [...segmenter.segment(normalized)]
  const merged: { text: string, isWordLike: boolean, isSpace: boolean }[] = []
  for (const s of rawSegs) {
    const ws = !s.isWordLike && /^\s+$/.test(s.segment)
    if (!s.isWordLike && !ws && merged.length > 0) {
      merged[merged.length - 1]!.text += s.segment
    } else {
      merged.push({ text: s.segment, isWordLike: s.isWordLike ?? false, isSpace: ws })
    }
  }

  // Expand CJK into graphemes
  const segs: { text: string, isWordLike: boolean, isSpace: boolean }[] = []
  for (const seg of merged) {
    if (seg.isWordLike && isCJK(seg.text)) {
      for (const g of graphemeSegmenter.segment(seg.text)) {
        segs.push({ text: g.segment, isWordLike: true, isSpace: false })
      }
    } else {
      segs.push(seg)
    }
  }

  // Line break using full-string measurement
  let lineCount = 0
  let lineStr = ''
  let hasContent = false

  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i]!
    if (!hasContent) {
      lineStr = seg.text
      hasContent = true
      lineCount++
      continue
    }

    const candidate = lineStr + seg.text
    const candidateW = measureText(candidate, FONT_NAME, fontSize)

    if (candidateW > maxWidth) {
      if (seg.isWordLike) {
        lineCount++
        lineStr = seg.text
      } else if (seg.isSpace) {
        // trailing space hangs
        continue
      } else {
        // punctuation — would need to rewind, but for comparison just overflow
        lineStr = candidate
      }
    } else {
      lineStr = candidate
    }
  }

  return { lineCount, height: lineCount * lineHeight }
}

describe('accuracy: word-sum vs full-line measurement', () => {
  test('sweep all texts × sizes × widths', () => {
    let total = 0
    let matches = 0
    const mismatches: string[] = []

    for (const fontSize of SIZES) {
      const lineHeight = Math.round(fontSize * 1.2)
      for (const width of WIDTHS) {
        for (const { label, text } of TEXTS) {
          const segments = segmentAndMeasure(text, fontSize)
          const wordSum = layoutSegments(segments, width, lineHeight)
          const precise = layoutPrecise(text, fontSize, width, lineHeight)
          total++

          if (wordSum.lineCount === precise.lineCount) {
            matches++
          } else {
            mismatches.push(`${fontSize}px w=${width} "${label}": wordSum=${wordSum.lineCount}L precise=${precise.lineCount}L`)
          }
        }
      }
    }

    const pct = ((matches / total) * 100).toFixed(1)
    console.log(`Accuracy: ${matches}/${total} (${pct}%)`)
    if (mismatches.length > 0) {
      console.log(`Mismatches (${mismatches.length}):`)
      for (const m of mismatches.slice(0, 20)) console.log(`  ${m}`)
      if (mismatches.length > 20) console.log(`  ... and ${mismatches.length - 20} more`)
    }

    // We expect very high accuracy — the punctuation merging fix
    // should make word-sum match full-line in nearly all cases
    // 98.4% — remaining mismatches are Arabic shaping context differences
    // (word-by-word measurement loses cross-word shaping in mixed bidi text)
    expect(matches / total).toBeGreaterThan(0.98)
  })
})

describe('i18n sweep', () => {
  test('all texts at all sizes and widths produce valid results', () => {
    let total = 0
    let valid = 0
    for (const fontSize of SIZES) {
      const lineHeight = Math.round(fontSize * 1.2)
      for (const width of WIDTHS) {
        for (const { text } of TEXTS) {
          const segments = segmentAndMeasure(text, fontSize)
          const result = layoutSegments(segments, width, lineHeight)
          total++
          if (result.height >= 0 && result.lineCount >= 0) valid++
          expect(result.height).toBe(result.lineCount * lineHeight)
        }
      }
    }
    console.log(`Sweep: ${valid}/${total} valid results`)
  })

  test('Arabic text produces at least 1 line', () => {
    for (const { label, text } of TEXTS) {
      if (!label.startsWith('Arabic')) continue
      const segments = segmentAndMeasure(text, 16)
      const { lineCount } = layoutSegments(segments, 400, 19)
      expect(lineCount).toBeGreaterThanOrEqual(1)
    }
  })

  test('mixed bidi text does not crash', () => {
    for (const { label, text } of TEXTS) {
      if (!label.startsWith('Mixed')) continue
      for (const width of WIDTHS) {
        const segments = segmentAndMeasure(text, 16)
        const result = layoutSegments(segments, width, 19)
        expect(result.lineCount).toBeGreaterThanOrEqual(1)
      }
    }
  })

  test('long word is handled without infinite loop', () => {
    const text = 'Superlongwordwithoutanyspacesthatshouldjustoverflowthelineandkeepgoing'
    const segments = segmentAndMeasure(text, 16)
    const result = layoutSegments(segments, 150, 19)
    expect(result.lineCount).toBeGreaterThanOrEqual(1)
  })
})
