import english5k from './data/english_5k.json' with { type: 'json' }

export const keyRows = [
  'Backquote Digit1 Digit2 Digit3 Digit4 Digit5 Digit6 Digit7 Digit8 Digit9 Digit0 Minus Equal',
  'KeyQ KeyW KeyE KeyR KeyT KeyY KeyU KeyI KeyO KeyP BracketLeft BracketRight Backslash',
  'KeyA KeyS KeyD KeyF KeyG KeyH KeyJ KeyK KeyL Semicolon Quote',
  'KeyZ KeyX KeyC KeyV KeyB KeyN KeyM Comma Period Slash',
].map(row => row.split(' '))

export const codes = keyRows.flat()
const base = ['`1234567890-=', 'qwertyuiop[]\\', "asdfghjkl;'", 'zxcvbnm,./']
const shift = ['~!@#$%^&*()_+', 'QWERTYUIOP{}|', 'ASDFGHJKL:"', 'ZXCVBNM<>?'].join('')
const shiftByKey = new Map([...base.join('')].map((key, i) => [key, shift[i]]))

export type Layout = { base: string[]; shift: string[]; groups: string[] }

function layout(rows: string[], groups?: string): Layout {
  const keys = [...rows.join('')]
  const letters = [
    ...new Set([...(rows[2] + rows[1] + rows[3] + rows[0])].filter(key => /[a-z]/.test(key))),
  ].join('')
  return {
    base: rows,
    shift: keyRows.map(row =>
      row
        .map(code => {
          const key = keys[codes.indexOf(code)]
          return shiftByKey.get(key) ?? key.toUpperCase()
        })
        .join(''),
    ),
    groups: groups?.split(' ') ?? [
      letters.slice(0, 8),
      letters.slice(8, 12),
      letters.slice(12, 16),
      letters.slice(16, 20),
      letters.slice(20, 23),
      letters.slice(23),
    ],
  }
}

const colemakGroups = 'arstneio dh pgjl cvbk wfuy qzxm'
export const layouts: Record<string, Layout> = {
  Colemak: layout([base[0], 'qwfpgjluy;[]\\', "arstdhneio'", 'zxcvbkm,./'], colemakGroups),
  'Colemak-DH': layout(
    [base[0], 'qwfpbjluy;[]\\', "arstgkneio'", 'zxcdvmh,./'],
    'arstneio gk pbjl cdvm wfuy qzxh',
  ),
  'Colemak-DHm': layout(
    [base[0], 'qwfpbjluy;[]\\', "arstgmneio'", 'zxcdvkh,./'],
    'arstneio gm pbjl cdvk wfuy qzxh',
  ),
  Dvorak: layout(['`1234567890[]', "',.pyfgcrl/=\\", 'aoeuidhtns-', ';qjkxbmwvz']),
  'Left-handed Dvorak': layout(['`[]/pfmlj4321', ';qbyurso.65=\\', '-kcdtheaz87', "'xgvwni,09"]),
  QWERTY: layout(base, 'asdfjkl ghert uiop bnmcv qwy xz'),
  AZERTY: {
    ...layout(['²&é"' + "'(-è_çà)=", 'azertyuiop^$*', 'qsdfghjklmù', 'wxcvbn,;:!']),
    shift: ['~1234567890°+', 'AZERTYUIOP¨£µ', 'QSDFGHJKLM%', 'WXCVBN?./§'],
  },
  Tarmak: layout([base[0], 'qwjrtyuiop[]\\', "asdfghnel;'", 'zxcvbkm,./']),
  Workman: layout([base[0], 'qdrwbjfup;[]\\', "ashtgyneoi'", 'zxmcvkl,./']),
}

const words = [...new Set(english5k.words.map(word => word.toLowerCase()))].map((word, rank) => ({
  word,
  weight: 1 / Math.sqrt(rank + 1),
}))

export function validateLayout(
  baseText: string,
  shiftText: string,
  groupText: string,
): Layout | string {
  const layers = [baseText, shiftText].map(text => text.trim().split(/\r?\n/))
  if (
    layers.some(
      layer =>
        layer.length !== 4 ||
        layer.some((row, i) => [...row].length !== keyRows[i].length || /\s/.test(row)),
    )
  ) {
    return 'Each layer needs four rows of 13, 13, 11, and 10 keys, with no spaces.'
  }
  const keys = layers.flatMap(layer => [...layer.join('')])
  const groups = groupText.trim().split(/\s+/)
  if (
    groups.length !== 6 ||
    groups.some(group => !group || [...group].some(key => !keys.includes(key)))
  ) {
    return 'Enter six lesson groups separated by spaces. Use only characters in your key layers.'
  }
  const layout = { base: layers[0], shift: layers[1], groups }
  if (groups.some((_, lesson) => !lessonKeys(layout, lesson).current.size)) {
    return 'Each lesson group needs at least one key that earlier lessons do not use.'
  }
  return layout
}

export function lessonKeys(layout: Layout, lesson: number) {
  const previous = new Set(layout.groups.slice(0, lesson).join(''))
  const current = new Set([...(layout.groups[lesson] ?? '')].filter(key => !previous.has(key)))
  return { previous, current }
}

export type LetterHistory = Record<string, string>

const recentAttemptLimit = 24

function isAttemptHistory(value: unknown): value is string {
  return typeof value === 'string' && /^[01]{1,24}$/.test(value)
}

export function recordLetterAttempt(history: LetterHistory, expected: string, correct: boolean) {
  if (!/^\p{L}$/u.test(expected)) return false
  const letter = expected.toLowerCase()
  const previous = history[letter]
  history[letter] = ((isAttemptHistory(previous) ? previous : '') + (correct ? '1' : '0')).slice(
    -recentAttemptLimit,
  )
  return true
}

export function summarizeLetterHistory(history: LetterHistory) {
  return Object.entries(history)
    .filter(([letter, attempts]) => /^\p{L}\p{M}*$/u.test(letter) && isAttemptHistory(attempts))
    .map(([letter, attempts]) => {
      const misses = attempts.length - attempts.replaceAll('0', '').length
      return { letter, attempts: attempts.length, misses, missRate: misses / attempts.length }
    })
    .sort((a, b) => b.missRate - a.missRate || a.letter.localeCompare(b.letter))
}

export type LetterFocusOverrides = Record<string, boolean>

export function isLetterFocused(letter: string, misses: number, overrides: LetterFocusOverrides) {
  return overrides[letter] ?? misses >= 2
}

function createBalancedPicker(
  eligible: typeof words,
  allowed: Set<string>,
  current: Set<string>,
  focusWeights: Map<string, number>,
) {
  const byLetter = new Map<string, { word: string; letters: string[]; lastUsed: number }[]>()
  for (const { word } of eligible) {
    const candidate = { word, letters: [...word], lastUsed: -Infinity }
    for (const letter of new Set(candidate.letters)) {
      const bucket = byLetter.get(letter) ?? []
      bucket.push(candidate)
      byLetter.set(letter, bucket)
    }
  }

  const counts = new Map<string, number>()
  const targets = new Map(
    [...allowed]
      .filter(key => key !== ' ')
      .map(key => [key, 1 + (focusWeights.get(key.toLowerCase()) ?? 0)]),
  )
  const usage = (key: string) => (counts.get(key) ?? 0) / (targets.get(key) ?? 1)
  const record = (key: string) => counts.set(key, (counts.get(key) ?? 0) + 1)
  const leastUsed = (keys: string[]) =>
    keys.reduce((best, key) => (usage(key) < usage(best) ? key : best))
  const covered = [...byLetter.keys()]
  const drillKeys = [...targets.keys()]
  const newKeys = [...current]
  let position = 0
  let lastWord: string | undefined

  return () => {
    if (!covered.length) {
      return Array.from({ length: 3 }, (_, index) => {
        const key = leastUsed(index === 0 && newKeys.length ? newKeys : drillKeys)
        record(key)
        return key
      }).join('')
    }

    const bucket = byLetter.get(leastUsed(covered))!
    let best = bucket[0]
    let bestScore = Infinity
    for (let i = 0; i < Math.min(24, bucket.length); i++) {
      const index = Math.floor(Math.random() * bucket.length)
      const picked = bucket[index]
      const candidate =
        picked.word === lastWord && bucket.length > 1 ? bucket[(index + 1) % bucket.length] : picked
      const score =
        candidate.letters.reduce((sum, key) => sum + usage(key), 0) / candidate.letters.length +
        Math.max(0, 8 - (position - candidate.lastUsed))
      if (score < bestScore) {
        best = candidate
        bestScore = score
      }
    }
    for (const key of best.letters) record(key)
    best.lastUsed = position++
    lastWord = best.word
    return best.word
  }
}

export function createPromptGenerator(
  layout: Layout,
  lesson: number,
  caps: boolean,
  punctuation: boolean,
  history?: LetterHistory,
  focusOverrides: LetterFocusOverrides = {},
  balanceLetters = true,
) {
  const keys = new Set([...layout.base.join(''), ...layout.shift.join(''), ' '])
  const { previous, current } = lessonKeys(layout, lesson)
  const allowed = lesson < 6 ? new Set([...previous, ...current]) : keys
  const fits = (word: string, set: Set<string>) => [...word].every(char => set.has(char))
  const capitalize = (word: string) => {
    const first = [...word][0]
    const upper = first.toUpperCase()
    return caps && keys.has(upper) ? upper + word.slice(first.length) : word
  }
  const punctuate = (word: string, mark: string) =>
    punctuation && keys.has(mark) ? word + mark : word

  const eligible = words.filter(
    ({ word }) => fits(word, allowed) && (lesson >= 6 || [...word].some(char => current.has(char))),
  )
  const letters = [...(current.size ? current : allowed)].filter(char => char !== ' ')
  const focusWeights = new Map(
    summarizeLetterHistory(history ?? {})
      .filter(({ letter, misses }) => misses > 0 && isLetterFocused(letter, misses, focusOverrides))
      // Two prior correct attempts temper the effect of a small sample.
      .map(({ letter, attempts, misses }) => [letter, (6 * misses) / (attempts + 2)]),
  )
  const emphasis = (word: string) => {
    if (!focusWeights.size) return 1
    let weight = 1
    for (const letter of new Set(word.toLowerCase())) weight += focusWeights.get(letter) ?? 0
    return weight
  }
  const weightedWords = eligible.map(({ word, weight }) => ({
    word,
    weight: weight * emphasis(word),
  }))
  let totalDrillWeight = 0
  const drillLetters = letters.map(letter => ({
    letter,
    end: (totalDrillWeight += emphasis(letter)),
  }))
  const pickBalanced = balanceLetters
    ? createBalancedPicker(eligible, allowed, current, focusWeights)
    : undefined
  let remaining: string[] = []
  let lastWord: string | undefined
  let position = 0

  return (count: number) =>
    Array.from({ length: count }, () => {
      if (!pickBalanced && !remaining.length && weightedWords.length) {
        // Random priorities favor common words early in each pass without repeating them.
        remaining = weightedWords
          .map(({ word, weight }) => ({
            word,
            priority: -Math.log(1 - Math.random()) / weight,
          }))
          .sort((a, b) => b.priority - a.priority)
          .map(({ word }) => word)
        const next = remaining.length - 1
        if (next > 0 && remaining[next] === lastWord) {
          ;[remaining[next], remaining[next - 1]] = [remaining[next - 1], remaining[next]]
        }
      }

      const word =
        pickBalanced?.() ??
        remaining.pop() ??
        Array.from({ length: 3 }, () => {
          const draw = Math.random() * totalDrillWeight
          return drillLetters.find(({ end }) => draw < end)?.letter
        }).join('')
      lastWord = word
      const slot = position++ % 8
      return slot === 0 ? capitalize(word) : slot === 7 ? punctuate(word, '.') : word
    })
}

export function createPrompt(
  layout: Layout,
  lesson: number,
  count: number,
  caps: boolean,
  punctuation: boolean,
) {
  return createPromptGenerator(layout, lesson, caps, punctuation)(count)
}

export function mappedKey(layout: Layout, code: string, shift: boolean, capsLock: boolean) {
  if (code === 'Space') return ' '
  const index = codes.indexOf(code)
  if (index < 0) return undefined
  const base = [...layout.base.join('')][index]
  const upper = [...layout.shift.join('')][index]
  return shift !== (capsLock && base.toUpperCase() === upper && base !== upper) ? upper : base
}

function lineEnd(widths: number[], start: number, available: number, gap: number) {
  let used = 0
  let end = start
  while (end < widths.length) {
    const width = Math.min(widths[end], available)
    const next = used ? used + gap + width : width
    if (next > available) break
    used = next
    end += 1
  }
  return end
}

export function promptWindow(
  widths: number[],
  wordIndex: number,
  available: number,
  gap: number,
  scroll: boolean,
) {
  let start = scroll ? Math.max(0, wordIndex - 2) : 0
  let secondLine = lineEnd(widths, start, available, gap)
  let end = lineEnd(widths, secondLine, available, gap)

  if (scroll && end <= wordIndex && end < widths.length) {
    start = wordIndex
    secondLine = lineEnd(widths, start, available, gap)
    end = lineEnd(widths, secondLine, available, gap)
  }

  while (!scroll && secondLine <= wordIndex && end < widths.length) {
    start = secondLine
    secondLine = end
    end = lineEnd(widths, secondLine, available, gap)
  }
  return { start, end }
}
