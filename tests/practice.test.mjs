import assert from 'node:assert/strict'
import test from 'node:test'
import english5k from '../src/data/english_5k.json' with { type: 'json' }
import {
  codes,
  createPrompt,
  createPromptGenerator,
  focusLetters,
  layouts,
  lessonKeys,
  mappedKey,
  promptWindow,
  recordLetterAttempt,
  summarizeLetterHistory,
  validateLayout,
} from '../src/practice.ts'

test('each layout contains six usable lessons and two full key layers', () => {
  for (const [name, layout] of Object.entries(layouts)) {
    assert.deepEqual(
      validateLayout(layout.base.join('\n'), layout.shift.join('\n'), layout.groups.join(' ')),
      layout,
      name,
    )
    const keys = new Set([...layout.base.join(''), ...layout.shift.join('')])
    for (let lesson = 0; lesson <= 6; lesson++) {
      const prompt = createPrompt(layout, lesson, 25, true, true)
      assert.equal(prompt.length, 25, name)
      assert.ok(
        prompt.every(word => word.length && [...word].every(key => keys.has(key))),
        name,
      )
    }
  }
})

test('Colemak maps the physical keys on both layers, including Caps Lock', () => {
  const layout = layouts.Colemak
  assert.equal(codes.length, 47)
  assert.equal(mappedKey(layout, 'KeyK', false, false), 'e')
  assert.equal(mappedKey(layout, 'KeyK', true, false), 'E')
  assert.equal(mappedKey(layout, 'KeyK', false, true), 'E')
  assert.equal(mappedKey(layout, 'KeyK', true, true), 'e')
  assert.equal(mappedKey(layout, 'Space', true, true), ' ')
  assert.equal(mappedKey(layout, 'Enter', false, false), undefined)
})

test('custom layouts reject malformed layers and unreachable lesson keys', () => {
  const layout = layouts.Colemak
  assert.match(
    validateLayout('short', layout.shift.join('\n'), layout.groups.join(' ')),
    /four rows/,
  )
  assert.match(
    validateLayout(layout.base.join('\n'), layout.shift.join('\n'), 'é b c d e f'),
    /only characters/,
  )
})

test('every progressive drill word uses a key introduced in that lesson', () => {
  const custom = { ...layouts.Colemak, groups: ['arstneio', 'arx', 'pgjl', 'cvbk', 'wfuy', 'qzm'] }
  for (const layout of [...Object.values(layouts), custom]) {
    for (let lesson = 0; lesson < 6; lesson++) {
      const { current, previous } = lessonKeys(layout, lesson)
      assert.ok(current.size)
      assert.ok([...current].every(key => !previous.has(key)))
      for (const caps of [false, true]) {
        const prompt = createPrompt(layout, lesson, 100, caps, true)
        assert.ok(
          prompt.every(word =>
            [...word].some(key => current.has(key) || (caps && current.has(key.toLowerCase()))),
          ),
        )
      }
    }
  }
})

test('word drills use the pinned English 5k list', () => {
  const words = new Set(english5k.words.map(word => word.toLowerCase()))
  assert.equal(words.size, 5000)
  for (let lesson = 0; lesson <= 6; lesson++) {
    const prompt = createPrompt(layouts.Colemak, lesson, 100, false, false)
    assert.ok(prompt.every(word => words.has(word)))
  }
})

test('timed batches share a word pool and avoid adjacent repeats when it refills', () => {
  const layout = layouts.Colemak
  const { current } = lessonKeys(layout, 0)
  const eligible = new Set(
    english5k.words
      .map(word => word.toLowerCase())
      .filter(word => [...word].every(key => current.has(key))),
  )
  const nextWords = createPromptGenerator(layout, 0, false, false)
  const firstPass = [...nextWords(48), ...nextWords(eligible.size - 48)]

  assert.equal(firstPass.length, eligible.size)
  assert.deepEqual(new Set(firstPass), eligible)
  assert.notEqual(nextWords(1)[0], firstPass.at(-1))
})

test('letter history keeps recent attempts and combines cases', () => {
  const history = {}
  for (let index = 0; index < 5; index++) recordLetterAttempt(history, 'J', false)
  assert.equal(recordLetterAttempt(history, '.', false), false)
  assert.equal(recordLetterAttempt(history, ' ', false), false)
  assert.deepEqual([...focusLetters(history, new Set(['j']))], ['j'])
  for (let index = 0; index < 24; index++) recordLetterAttempt(history, 'j', true)
  assert.deepEqual(history, { j: '1'.repeat(24) })
  assert.equal(focusLetters(history, new Set(['j'])).size, 0)
})

test('focused prompts prioritize missed letters and preserve lesson eligibility', t => {
  t.mock.method(Math, 'random', () => 0.5)
  const layout = layouts.Colemak
  const baseline = createPromptGenerator(layout, 1, false, false)(10)
  const generator = createPromptGenerator(layout, 1, false, false, {
    z: '00000',
    q: '00000',
    h: '00001',
  })
  const focused = generator(10)
  assert.ok(
    focused.filter(word => word.includes('h')).length >
      baseline.filter(word => word.includes('h')).length,
  )
  const { previous, current } = lessonKeys(layout, 1)
  for (const word of [...focused, ...generator(50)]) {
    assert.ok([...word].every(key => previous.has(key) || current.has(key)))
    assert.ok([...word].some(key => current.has(key)))
  }
})

test('letter breakdown reports counts and ranks miss rates, including perfect letters', () => {
  const history = { a: '1111', j: '01010', z: '0', malformed: '00000', x: 'invalid' }
  assert.deepEqual(summarizeLetterHistory(history), [
    { letter: 'z', attempts: 1, misses: 1, missRate: 1 },
    { letter: 'j', attempts: 5, misses: 3, missRate: 0.6 },
    { letter: 'a', attempts: 4, misses: 0, missRate: 0 },
  ])
  assert.deepEqual([...focusLetters(history, new Set(['a', 'j', 'z']))], ['j'])
})

test('the prompt advances one row at a time and keeps the final row at the bottom', () => {
  const widths = [4, 4, 9, 4, 4, 9]
  const windowAt = index => promptWindow(widths, index, 9, 1, false)

  assert.deepEqual(windowAt(1), { start: 0, end: 3 })
  assert.deepEqual(windowAt(2), { start: 2, end: 5 })
  assert.deepEqual(windowAt(3), { start: 3, end: 6 })
  assert.deepEqual(windowAt(5), { start: 3, end: 6 })
})

test('per-word scrolling keeps nearby words unless they crowd out the active word', () => {
  const widths = [9, 9, 4, 4, 9, 9]
  assert.deepEqual(promptWindow(widths, 1, 9, 1, true), { start: 0, end: 2 })
  assert.deepEqual(promptWindow(widths, 2, 9, 1, true), { start: 2, end: 5 })
})
