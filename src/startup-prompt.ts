import { measurePromptWindow } from './prompt-window'
import { prepareStartupPractice } from './startup-practice'

export const startup = prepareStartupPractice()
const element = document.getElementById('practice-prompt')!
const measure = document.createElement('canvas').getContext('2d')
const originalNodes = [...element.childNodes]
const { end } = measure
  ? measurePromptWindow(element, measure, startup.prompt, 0, element.clientWidth, false)
  : { end: 24 }

element.replaceChildren(
  ...startup.prompt.slice(0, end).map((word, index) => {
    const span = document.createElement('span')
    span.className = 'word'
    if (index === 0) {
      span.classList.add('active')
      const [first, ...rest] = word
      const caret = document.createElement('span')
      caret.className = 'caret'
      caret.textContent = first
      span.append(caret, rest.join(''))
    } else {
      span.textContent = word
    }
    return span
  }),
)

export function restorePromptMarkup() {
  // Hydration needs the original Svelte comment markers.
  element.replaceChildren(...originalNodes)
}
