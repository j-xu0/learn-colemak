import english5k from './data/english_5k.json' with { type: 'json' }

export const keyRows = [
  'Backquote Digit1 Digit2 Digit3 Digit4 Digit5 Digit6 Digit7 Digit8 Digit9 Digit0 Minus Equal',
  'KeyQ KeyW KeyE KeyR KeyT KeyY KeyU KeyI KeyO KeyP BracketLeft BracketRight Backslash',
  'KeyA KeyS KeyD KeyF KeyG KeyH KeyJ KeyK KeyL Semicolon Quote',
  'KeyZ KeyX KeyC KeyV KeyB KeyN KeyM Comma Period Slash',
].map(row => row.split(' '))

export const codes = keyRows.flat()
const base = ["`1234567890-=", "qwertyuiop[]\\", "asdfghjkl;'", "zxcvbnm,./"]
const shift = ['~!@#$%^&*()_+', 'QWERTYUIOP{}|', 'ASDFGHJKL:"', 'ZXCVBNM<>?'].join('')
const shiftByKey = new Map([...base.join('')].map((key, i) => [key, shift[i]]))

export type Layout = { base: string[]; shift: string[]; groups: string[] }

function layout(rows: string[], groups?: string): Layout {
  const keys = [...rows.join('')]
  const letters = [...new Set([...rows[2] + rows[1] + rows[3] + rows[0]].filter(key => /[a-z]/.test(key)))].join('')
  return {
    base: rows,
    shift: keyRows.map(row => row.map(code => {
      const key = keys[codes.indexOf(code)]
      return shiftByKey.get(key) ?? key.toUpperCase()
    }).join('')),
    groups: groups?.split(' ') ?? [letters.slice(0, 8), letters.slice(8, 12), letters.slice(12, 16), letters.slice(16, 20), letters.slice(20, 23), letters.slice(23)],
  }
}

const colemakGroups = 'arstneio dh pgjl cvbk wfuy qzxm'
export const layouts: Record<string, Layout> = {
  Colemak: layout([base[0], 'qwfpgjluy;[]\\', "arstdhneio'", 'zxcvbkm,./'], colemakGroups),
  'Colemak-DH': layout([base[0], 'qwfpbjluy;[]\\', "arstgkneio'", 'zxcdvmh,./'], 'arstneio gk pbjl cdvm wfuy qzxh'),
  'Colemak-DHm': layout([base[0], 'qwfpbjluy;[]\\', "arstgmneio'", 'zxcdvkh,./'], 'arstneio gm pbjl cdvk wfuy qzxh'),
  Dvorak: layout(["`1234567890[]", "',.pyfgcrl/=\\", 'aoeuidhtns-', ';qjkxbmwvz']),
  'Left-handed Dvorak': layout(["`[]/pfmlj4321", ';qbyurso.65=\\', '-kcdtheaz87', "'xgvwni,09"]),
  QWERTY: layout(base, 'asdfjkl ghert uiop bnmcv qwy xz'),
  AZERTY: {
    ...layout(['²&é"' + "'(-è_çà)=", 'azertyuiop^$*', 'qsdfghjklmù', 'wxcvbn,;:!']),
    shift: ['~1234567890°+', 'AZERTYUIOP¨£µ', 'QSDFGHJKLM%', 'WXCVBN?./§'],
  },
  Tarmak: layout([base[0], 'qwjrtyuiop[]\\', "asdfghnel;'", 'zxcvbkm,./']),
  Workman: layout([base[0], 'qdrwbjfup;[]\\', "ashtgyneoi'", 'zxmcvkl,./']),
}

const words = english5k.words.map(word => word.toLowerCase())

export function validateLayout(baseText: string, shiftText: string, groupText: string): Layout | string {
  const layers = [baseText, shiftText].map(text => text.trim().split(/\r?\n/))
  if (layers.some(layer => layer.length !== 4 || layer.some((row, i) => [...row].length !== keyRows[i].length || /\s/.test(row)))) {
    return 'Each layer needs four rows of 13, 13, 11, and 10 keys, with no spaces.'
  }
  const keys = layers.flatMap(layer => [...layer.join('')])
  const groups = groupText.trim().split(/\s+/)
  if (groups.length !== 6 || groups.some(group => !group || [...group].some(key => !keys.includes(key)))) {
    return 'Enter six lesson groups separated by spaces. Use only characters in your key layers.'
  }
  const layout = { base: layers[0], shift: layers[1], groups }
  if (groups.some((_, lesson) => !lessonKeys(layout, lesson).current.size)) {
    return 'Each lesson group needs at least one key that earlier lessons do not use.'
  }
  return layout
}

export function lessonKeys(layout: Layout, lesson: number) {
  const previous = new Set([...layout.groups.slice(0, lesson).join('')])
  const current = new Set([...(layout.groups[lesson] ?? '')].filter(key => !previous.has(key)))
  return { previous, current }
}

export function createPrompt(layout: Layout, lesson: number, count: number, caps: boolean, punctuation: boolean) {
  const keys = new Set([...layout.base.join(''), ...layout.shift.join(''), ' '])
  const { previous, current } = lessonKeys(layout, lesson)
  const allowed = lesson < 6 ? new Set([...previous, ...current]) : keys
  const fits = (word: string, set: Set<string>) => [...word].every(char => set.has(char))
  const capitalize = (word: string) => {
    const first = [...word][0]
    const upper = first.toUpperCase()
    return caps && keys.has(upper) ? upper + word.slice(first.length) : word
  }
  const punctuate = (word: string, mark: string) => punctuation && keys.has(mark) ? word + mark : word

  const eligible = words.filter(word => fits(word, allowed) && (lesson >= 6 || [...word].some(char => current.has(char))))
  const letters = [...(current.size ? current : allowed)].filter(char => char !== ' ')
  const result: string[] = []
  let lastIndex = -1
  for (let i = 0; i < count; i++) {
    const excludeLast = lastIndex >= 0 && eligible.length > 1
    let index = Math.floor(Math.random() * (eligible.length - Number(excludeLast)))
    if (excludeLast && index >= lastIndex) index += 1
    const word = eligible[index] ?? Array.from({ length: 3 }, () => letters[Math.floor(Math.random() * letters.length)]).join('')
    lastIndex = index
    result.push(i % 8 === 0 ? capitalize(word) : i % 8 === 7 ? punctuate(word, '.') : word)
  }
  return result
}

export function mappedKey(layout: Layout, code: string, shift: boolean, capsLock: boolean) {
  if (code === 'Space') return ' '
  const index = codes.indexOf(code)
  if (index < 0) return undefined
  const base = [...layout.base.join('')][index]
  const upper = [...layout.shift.join('')][index]
  return shift !== (capsLock && base.toUpperCase() === upper && base !== upper) ? upper : base
}
