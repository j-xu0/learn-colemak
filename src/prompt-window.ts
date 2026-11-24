import { promptWindow } from './practice'

export function measurePromptWindow(
  element: HTMLElement,
  measure: CanvasRenderingContext2D,
  prompt: string[],
  wordIndex: number,
  width: number,
  scroll: boolean,
) {
  const style = getComputedStyle(element)
  measure.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
  const widths = prompt.map(word => measure.measureText(word).width)
  return promptWindow(widths, wordIndex, width, parseFloat(style.columnGap), scroll)
}
