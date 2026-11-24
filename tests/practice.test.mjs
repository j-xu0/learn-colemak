import assert from 'node:assert/strict'
import test from 'node:test'
import english5k from '../src/data/english_5k.json' with { type: 'json' }
import {
  codes,
  createPrompt,
  createPromptGenerator,
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
  const words = new Set(english5k.words)
  assert.equal(words.size, 5000)
  for (let lesson = 0; lesson <= 6; lesson++) {
    const prompt = createPrompt(layouts.Colemak, lesson, 100, false, false)
    assert.ok(prompt.every(word => words.has(word) && word === word.toLowerCase()))
  }
})

test('capital-letter practice preserves source casing within progressive lessons', () => {
  const layout = layouts.Colemak
  const { previous, current } = lessonKeys(layout, 3)
  const allowed = new Set([...previous, ...current])
  const eligibleCount = english5k.words.filter(word => {
    const letters = [...word.toLowerCase()]
    return (
      letters.every(letter => allowed.has(letter)) && letters.some(letter => current.has(letter))
    )
  }).length
  const prompt = createPromptGenerator(
    layout,
    3,
    true,
    false,
    undefined,
    undefined,
    false,
  )(eligibleCount)
  assert.ok(prompt.includes('Canada'))
  assert.ok(!prompt.includes('canada'))
})

test('frequency-weighted batches share a word pool and avoid repeats when it refills', () => {
  const layout = layouts.Colemak
  const { current } = lessonKeys(layout, 0)
  const eligible = new Set(english5k.words.filter(word => [...word].every(key => current.has(key))))
  const nextWords = createPromptGenerator(layout, 0, false, false, undefined, undefined, false)
  const firstPass = [...nextWords(48), ...nextWords(eligible.size - 48)]

  assert.equal(firstPass.length, eligible.size)
  assert.deepEqual(new Set(firstPass), eligible)
  assert.notEqual(nextWords(1)[0], firstPass.at(-1))
})

test('balanced prompts narrow the letter count spread in Lesson 1 and All Words', t => {
  const layout = layouts.Colemak
  let seed = 0
  t.mock.method(Math, 'random', () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 2 ** 32
  })
  for (const [lesson, letters] of [
    [0, layout.groups[0]],
    [6, layout.groups.join('')],
  ]) {
    const counts = balance => {
      seed = 42
      const generate = createPromptGenerator(
        layout,
        lesson,
        false,
        false,
        undefined,
        undefined,
        balance,
      )
      const prompt = [...generate(25), ...generate(25)].join('')
      return [...letters].map(letter => prompt.split(letter).length - 1)
    }
    const balanced = counts(true)
    const weighted = counts(false)
    assert.ok(Math.min(...balanced) > 0)
    assert.ok(
      Math.max(...balanced) / Math.min(...balanced) < Math.max(...weighted) / Math.min(...weighted),
    )
  }
})

test('balanced drills cover earlier keys when no dictionary words fit', () => {
  const layout = { ...layouts.Colemak, groups: ['ab', '@'] }
  const prompt = createPromptGenerator(layout, 1, false, false)(10)
  assert.ok(prompt.every(word => word.startsWith('@')))
  assert.deepEqual(new Set(prompt.join('')), new Set('@ab'))
})

test('letter history keeps recent attempts and combines cases', () => {
  const history = {}
  for (let index = 0; index < 5; index++) recordLetterAttempt(history, 'J', false)
  assert.equal(recordLetterAttempt(history, '.', false), false)
  assert.equal(recordLetterAttempt(history, ' ', false), false)
  for (let index = 0; index < 24; index++) recordLetterAttempt(history, 'j', true)
  assert.deepEqual(history, { j: '1'.repeat(24) })
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
  assert.deepEqual(
    createPromptGenerator(layout, 1, false, false, { h: '00001' }, { h: false })(10),
    baseline,
  )
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

test('frequency-weighted focus scales with severity, includes short histories, and honors manual choices', t => {
  t.mock.method(Math, 'random', () => 0.5)
  const prompt = (history, overrides) =>
    createPromptGenerator(layouts.Colemak, 1, false, false, history, overrides, false)(10)
  const baseline = prompt()
  const mild = prompt({ h: '00111' })
  const severe = prompt({ h: '00001' })

  assert.ok(mild.indexOf('and') > baseline.indexOf('and'))
  assert.ok(severe.indexOf('and') > mild.indexOf('and'))
  assert.deepEqual(prompt({ h: '0' }), baseline)
  assert.ok(prompt({ h: '0' }, { h: true }).indexOf('and') > baseline.indexOf('and'))
  assert.deepEqual(prompt({ h: '00001' }, { h: false }), baseline)
  assert.deepEqual(prompt({ h: '00001', d: '00001' }, { h: false }), prompt({ d: '00001' }))
})

test('letter breakdown reports counts and ranks miss rates, including perfect letters', () => {
  const history = { a: '1111', j: '01010', z: '0', malformed: '00000', x: 'invalid' }
  assert.deepEqual(summarizeLetterHistory(history), [
    { letter: 'z', attempts: 1, misses: 1, missRate: 1 },
    { letter: 'j', attempts: 5, misses: 3, missRate: 0.6 },
    { letter: 'a', attempts: 4, misses: 0, missRate: 0 },
  ])
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
