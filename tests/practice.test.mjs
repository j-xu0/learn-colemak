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
