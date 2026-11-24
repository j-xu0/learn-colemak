import {
  createPromptGenerator,
  layouts,
  type LetterFocusOverrides,
  type LetterHistory,
} from './practice'

export const balanceStorageKey = 'learn-colemak:balance-letters'
export const practiceStorageKey = 'learn-colemak:missed-letters:v1'
export const defaultWordLimit = 50

export type StartupPractice = ReturnType<typeof prepareStartupPractice>

export function prepareStartupPractice() {
  let balanceLetters = true
  let practiceMissedLetters = false
  let focusOverrides: Record<string, LetterFocusOverrides> = {}
  let letterHistories: Record<string, LetterHistory> = {}

  try {
    balanceLetters = localStorage.getItem(balanceStorageKey) !== 'false'
  } catch {
    // Keep the default if storage is unavailable.
  }
  try {
    const saved = JSON.parse(localStorage.getItem(practiceStorageKey) ?? 'null')
    practiceMissedLetters = saved?.enabled === true
    if (saved?.focusOverrides && typeof saved.focusOverrides === 'object') {
      focusOverrides = Object.fromEntries(
        Object.entries(saved.focusOverrides).flatMap(([key, value]) =>
          value && typeof value === 'object'
            ? [
                [
                  key,
                  Object.fromEntries(
                    Object.entries(value).filter(([, checked]) => typeof checked === 'boolean'),
                  ),
                ],
              ]
            : [],
        ),
      )
    } else if (saved?.focusExclusions && typeof saved.focusExclusions === 'object') {
      focusOverrides = Object.fromEntries(
        Object.entries(saved.focusExclusions).flatMap(([key, letters]) =>
          Array.isArray(letters)
            ? [
                [
                  key,
                  Object.fromEntries(
                    letters
                      .filter(letter => typeof letter === 'string')
                      .map(letter => [letter, false]),
                  ),
                ],
              ]
            : [],
        ),
      )
    }
    if (saved?.layouts && typeof saved.layouts === 'object' && !Array.isArray(saved.layouts)) {
      letterHistories = saved.layouts
    }
  } catch {
    // Start with empty history if stored data cannot be read.
  }

  const history = letterHistories.Colemak
  const nextWords = createPromptGenerator(
    layouts.Colemak,
    0,
    false,
    false,
    practiceMissedLetters && history && typeof history === 'object' && !Array.isArray(history)
      ? history
      : undefined,
    focusOverrides.Colemak,
    balanceLetters,
  )

  return {
    balanceLetters,
    practiceMissedLetters,
    focusOverrides,
    letterHistories,
    nextWords,
    prompt: nextWords(defaultWordLimit),
  }
}
