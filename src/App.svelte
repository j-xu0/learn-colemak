<script lang="ts">
  import { onMount, tick } from 'svelte'
  import { Button } from '@ui-sdk/svelte/button'
  import { Checkbox, CheckboxIndicator } from '@ui-sdk/svelte/checkbox'
  import PracticeSelect from './PracticeSelect.svelte'
  import { codes, createPrompt, keyRows, layouts, lessonKeys, mappedKey, validateLayout, type Layout } from './practice'

  const lessons = ['Lesson 1', 'Lesson 2', 'Lesson 3', 'Lesson 4', 'Lesson 5', 'Lesson 6', 'All Words']
  const options = (values: (number | string)[]) => values.map(value => ({ value: String(value), label: String(value) }))
  const layoutOptions = options([...Object.keys(layouts), 'Custom'])
  const defaultWordLimit = 50
  const wordOptions = options([10, 25, 50, 100])
  const timeOptions = options([15, 30, 60, 120])
  const sessionOptions = [{ value: 'words', label: 'Word count' }, { value: 'time', label: 'Timed' }]
  const storageKey = 'learn-colemak:custom-layout'
  let layoutName = $state('Colemak')
  let custom = $state<Layout>(layouts.Colemak)
  let layout = $derived(layouts[layoutName] ?? custom)
  let lesson = $state(0)
  let mode = $state<'words' | 'time'>('words')
  let wordLimit = $state(defaultWordLimit)
  let timeLimit = $state(60)
  let caps = $state(false)
  let punctuation = $state(false)
  let scroll = $state(false)
  let remap = $state(true)
  let prompt = $state(createPrompt(layouts.Colemak, 0, defaultWordLimit, false, false))
  let wordIndex = $state(0)
  let entered = $state<string[]>([])
  let attempts = $state(0)
  let hits = $state(0)
  let accepted = $state(0)
  let started = $state<number | null>(null)
  let elapsed = $state(0)
  let finished = $state(false)
  let samples = $state<{ seconds: number; speed: number }[]>([])
  let typingInput = $state<HTMLInputElement>()
  let promptElement = $state<HTMLDivElement>()
  let promptWidth = $state(0)
  let wordMeasure = $state.raw<CanvasRenderingContext2D | null>(null)
  let editor: HTMLDialogElement
  let draftBase = $state('')
  let draftShift = $state('')
  let draftGroups = $state('')
  let editorError = $state('')

  let target = $derived([...(prompt[wordIndex] ?? '')])
  let currentKey = $derived(entered.length < target.length ? target[entered.length] : ' ')
  let keyboard = $derived([...layout.base.join('')])
  let shifted = $derived([...layout.shift.join('')])
  let lessonGroups = $derived(lessonKeys(layout, lesson))
  let promptSymbols = $derived(new Set([...prompt.join('')].filter(key => /[^\p{L}]/u.test(key))))
  let wpm = $derived(elapsed > 0 ? Math.round(accepted * 12 / elapsed) : 0)
  let accuracy = $derived(attempts ? Math.round(hits * 100 / attempts) : 100)
  let preview = $derived.by(() => {
    const style = promptElement && getComputedStyle(promptElement)
    const measure = wordMeasure
    if (style && promptWidth && measure) {
      measure.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
      const gap = parseFloat(style.columnGap)
      const widths = prompt.map(word => measure.measureText(word).width)
      let start = scroll ? Math.max(0, wordIndex - 2) : 0
      let end = twoLineEnd(widths, start, promptWidth, gap)

      while (end <= wordIndex && end < widths.length) {
        start = scroll ? wordIndex : end
        end = twoLineEnd(widths, start, promptWidth, gap)
      }
      return { start, end }
    }
    const start = Math.floor(wordIndex / 24) * 24
    return { start, end: start + 24 }
  })
  let visibleWords = $derived(prompt.slice(preview.start, preview.end))

  function twoLineEnd(widths: number[], start: number, available: number, gap: number) {
    let line = 1
    let used = 0
    let end = start
    while (end < widths.length) {
      const width = Math.min(widths[end], available)
      if (used && used + gap + width > available) {
        if (line === 2) break
        line += 1
        used = 0
      }
      used = used ? used + gap + width : width
      end += 1
    }
    return end
  }

  let chart = $derived.by(() => {
    const maxSpeed = Math.max(10, ...samples.map(point => point.speed))
    const duration = Math.max(1, elapsed)
    return {
      maxSpeed,
      points: [{ seconds: 0, speed: 0 }, ...samples].map(point =>
        `${30 + point.seconds / duration * 460},${100 - point.speed / maxSpeed * 85}`,
      ).join(' '),
    }
  })

  onMount(() => {
    wordMeasure = document.createElement('canvas').getContext('2d')
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null')
      if (saved) {
        const parsed = validateLayout(saved.base.join('\n'), saved.shift.join('\n'), saved.groups.join(' '))
        if (typeof parsed !== 'string') custom = parsed
      }
    } catch {
      // Storage can contain malformed data or be unavailable in private browsing.
    }
    const timer = window.setInterval(updateClock, 100)
    return () => window.clearInterval(timer)
  })

  function recordSpeed() {
    samples = [...samples, { seconds: elapsed, speed: elapsed ? Math.round(accepted * 12 / elapsed) : 0 }]
  }

  function updateClock() {
    if (started === null || finished) return
    elapsed = (performance.now() - started) / 1000
    if (mode === 'time' && elapsed >= timeLimit) {
      elapsed = timeLimit
      finish()
      return
    }
    if (elapsed >= (samples.at(-1)?.seconds ?? 0) + 1) recordSpeed()
  }

  function finish() {
    finished = true
    recordSpeed()
  }

  function reset(focus = false) {
    prompt = createPrompt(layouts[layoutName] ?? custom, lesson, mode === 'words' ? wordLimit : 48, caps, punctuation)
    wordIndex = 0
    entered = []
    attempts = 0
    hits = 0
    accepted = 0
    started = null
    elapsed = 0
    finished = false
    samples = []
    if (focus) void tick().then(() => typingInput?.focus())
  }

  function advance() {
    wordIndex += 1
    entered = []
    if (mode === 'time' && wordIndex >= prompt.length - 48) {
      prompt = [...prompt, ...createPrompt(layout, lesson, 48, caps, punctuation)]
    } else if (wordIndex === prompt.length) {
      elapsed = Math.max(0.001, (performance.now() - started!) / 1000)
      finish()
    }
  }

  function typeCharacter(character: string) {
    if (finished) return
    updateClock()
    if (finished) return
    if (started === null) started = performance.now()
    attempts += 1
    const wordIsComplete = entered.length === target.length && entered.every((key, i) => key === target[i])
    const correct = entered.length < target.length ? character === currentKey : character === ' ' && wordIsComplete
    if (correct) hits += 1
    if (character === ' ' && wordIsComplete) {
      accepted += 1
      advance()
      return
    }
    if (entered.length >= target.length + 8) return
    entered = [...entered, character]
    if (correct && entered.length <= target.length) accepted += 1
    if (mode === 'words' && wordIndex === prompt.length - 1 && entered.length === target.length && entered.every((key, i) => key === target[i])) advance()
  }

  function backspace() {
    const last = entered.length - 1
    if (last < 0 || finished) return
    if (entered[last] === target[last]) accepted -= 1
    entered = entered.slice(0, -1)
  }

  function handleKey(event: KeyboardEvent) {
    if (event.defaultPrevented || editor?.open || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return
    const element = event.target instanceof Element ? event.target : null
    if (element !== typingInput && element?.closest('input, textarea, select, [contenteditable], [role="listbox"], [aria-expanded="true"]')) return
    if (event.key === ' ' && element?.closest('button, a[href]')) return

    if (event.key === 'Escape') {
      event.preventDefault()
      reset()
    } else if (!finished && event.key === 'Backspace') {
      event.preventDefault()
      backspace()
    } else if (!finished && [...event.key].length === 1) {
      event.preventDefault()
      if (element?.closest('button, a[href]')) typingInput?.focus({ preventScroll: true })
      const character = remap ? mappedKey(layout, event.code, event.shiftKey, event.getModifierState('CapsLock')) ?? event.key : event.key
      typeCharacter(character)
    }
  }

  function handleInput(event: Event) {
    const input = event.currentTarget as HTMLInputElement
    const change = event as InputEvent
    if (change.inputType === 'deleteContentBackward') backspace()
    else if (change.inputType !== 'insertFromPaste') for (const character of input.value) typeCharacter(character)
    input.value = ''
  }

  function openEditor() {
    const source = layoutName === 'Custom' ? custom : layout
    draftBase = source.base.join('\n')
    draftShift = source.shift.join('\n')
    draftGroups = source.groups.join(' ')
    editorError = ''
    editor.showModal()
  }

  function saveLayout() {
    const result = validateLayout(draftBase, draftShift, draftGroups)
    if (typeof result === 'string') {
      editorError = result
      return
    }
    try {
      localStorage.setItem(storageKey, JSON.stringify(result))
    } catch {
      editorError = 'Your browser could not save the layout. Allow local storage and try again.'
      return
    }
    custom = result
    layoutName = 'Custom'
    editor.close()
    reset()
  }
</script>

<svelte:window onkeydown={handleKey} />

<header class="site-header">
  <div class="header-inner">
    <h1 class="brand">Learn Colemak</h1>
    <Button class="button subtle" onclick={openEditor}>Edit custom layout</Button>
  </div>
</header>

<main>
  <section class="workspace" aria-label="Typing practice">
    <div class="practice">
      <div class="practice-header">
        <div class="session-controls">
          <PracticeSelect label="Session" items={sessionOptions} value={mode}
            change={(value) => { mode = value === 'time' ? 'time' : 'words'; reset() }} />
          {#if mode === 'words'}
            <PracticeSelect label="Words" items={wordOptions} value={String(wordLimit)}
              change={(value) => { wordLimit = Number(value); reset() }} />
          {:else}
            <PracticeSelect label="Seconds" items={timeOptions} value={String(timeLimit)}
              change={(value) => { timeLimit = Number(value); reset() }} />
          {/if}
        </div>
      </div>

      <dl class="stats" class:complete={finished}>
        {#if finished}
          <div><dt>Speed</dt><dd>{wpm} <small>WPM</small></dd></div>
          <div><dt>Accuracy</dt><dd>{accuracy}<small>%</small></dd></div>
        {/if}
        <div><dt>Elapsed</dt><dd>{Math.floor(elapsed)}<small>s</small></dd></div>
        <div><dt>Words</dt><dd>{wordIndex}{#if mode === 'words'}<small>{' / '}{wordLimit}</small>{/if}</dd></div>
      </dl>

      {#if finished}
        <section class="results" aria-label="Session results">
          <h3>Session complete</h3>
          <svg viewBox="0 0 510 125" role="img" aria-label={`Cumulative typing speed over ${Math.round(elapsed)} seconds, ending at ${wpm} words per minute`}>
            <path d="M30 15V100H490" fill="none" stroke="currentColor" opacity=".4" />
            <text x="0" y="20">{chart.maxSpeed}</text>
            <text x="15" y="104">0</text>
            <text x="30" y="121">0s</text>
            <text x="490" y="121" text-anchor="end">{Math.round(elapsed)}s</text>
            <polyline points={chart.points} fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" />
          </svg>
        </section>
      {:else}
        <div class="typing">
          <label for="typing-input" class="sr-only">Type the practice prompt</label>
          <input id="typing-input" class="typing-input" bind:this={typingInput} oninput={handleInput}
            aria-describedby="prompt typing-help" autocomplete="off" autocapitalize="off" spellcheck="false" />
          <span class="sr-only" id="prompt">{visibleWords.join(' ')}</span>
          <div class="prompt" bind:this={promptElement} bind:clientWidth={promptWidth} aria-hidden="true">
            {#each visibleWords as word, i (preview.start + i)}
              <span class="word" class:done={preview.start + i < wordIndex}>
                {#if preview.start + i === wordIndex}
                  {#each [...word] as key, index (index)}<span class:correct={entered[index] === key} class:wrong={entered[index] !== undefined && entered[index] !== key} class:caret={index === entered.length}>{key}</span>{/each}
                  {#each entered.slice(target.length) as key, index (index)}<span class="wrong">{key === ' ' ? '␣' : key}</span>{/each}
                  {#if entered.length >= target.length}<span class="end-caret"></span>{/if}
                {:else}{word}{/if}
              </span>
            {/each}
          </div>
          <p id="typing-help">{started === null ? 'Type to begin.' : 'Press Esc to restart.'}</p>
        </div>
      {/if}

      <div class="keyboard-area" aria-label="Keyboard guide">
        <div class="keyboard-heading"><h3>Keyboard guide</h3><Button class="button subtle" onclick={() => reset(true)}>Restart</Button></div>
        <div class="keyboard" aria-hidden="true">
          {#each keyRows as row, rowIndex (row)}
            <div class="key-row" class:alpha={rowIndex === 1} class:home={rowIndex === 2} class:bottom={rowIndex === 3}>
              {#if rowIndex > 0}<kbd class="empty leading"></kbd>{/if}
              {#each row as code (code)}
                {@const index = codes.indexOf(code)}
                {@const key = keyboard[index]}
                {@const shiftedKey = shifted[index]}
                {@const newLabel = [key, shiftedKey].find(value => lessonGroups.current.has(value))}
                {@const earlierLabel = [key, shiftedKey].find(value => lessonGroups.previous.has(value))}
                {@const symbol = [key, shiftedKey].find(value => promptSymbols.has(value))}
                {@const label = lesson >= 6 ? [key, shiftedKey].find(value => /\p{L}/u.test(value)) : newLabel ?? earlierLabel ?? symbol}
                <kbd class:current={!!newLabel} class:previous={lesson < 6 && !newLabel && !!earlierLabel}
                  class:empty={!label} class:anchor={!!label && (code === 'KeyF' || code === 'KeyJ')}>{label ?? ''}</kbd>
              {/each}
              {#if rowIndex !== 1}<kbd class="empty trailing"></kbd>{/if}
            </div>
          {/each}
          <div class="key-row space-row">
            <kbd class="empty"></kbd><kbd class="empty"></kbd><kbd class="empty"></kbd>
            <kbd class="spacebar" class:empty={lesson >= 6}>{lesson < 6 ? 'space' : ''}</kbd>
            <kbd class="empty"></kbd><kbd class="empty"></kbd><kbd class="empty"></kbd><kbd class="empty"></kbd>
          </div>
        </div>
      </div>
    </div>
    <aside class="controls" aria-label="Practice settings">
      <PracticeSelect label="Keyboard layout" items={layoutOptions} value={layoutName}
        change={(value) => { layoutName = value; reset() }} />

      <nav aria-label="Lessons">
        <h2>Lessons</h2>
        <div class="lessons">
          {#each lessons as label, i (label)}
            <Button class="lesson" aria-pressed={lesson === i} onclick={() => { lesson = i; reset() }}>
              <span>{label}</span>
              {#if i < 6}<small>{[...layout.groups[i]].join(' ')}</small>{/if}
            </Button>
          {/each}
        </div>
      </nav>

      <div class="options">
        <h2>Options</h2>
        <label><Checkbox aria-label="Capital letters" checked={caps} onCheckedChange={(value) => { caps = value === true; reset() }}><CheckboxIndicator aria-hidden="true" /></Checkbox> Capital letters</label>
        <label><Checkbox aria-label="Punctuation" checked={punctuation} onCheckedChange={(value) => { punctuation = value === true; reset() }}><CheckboxIndicator aria-hidden="true" /></Checkbox> Punctuation</label>
        <label><Checkbox aria-label="Scrolling prompt" bind:checked={scroll}><CheckboxIndicator aria-hidden="true" /></Checkbox> Scrolling prompt</label>
        <label><Checkbox aria-label="Remap physical keys" bind:checked={remap}><CheckboxIndicator aria-hidden="true" /></Checkbox> Remap physical keys</label>
        <p>Turn off if your system already uses the selected layout.</p>
      </div>
    </aside>

  </section>
</main>

<dialog bind:this={editor} aria-labelledby="editor-title">
  <form onsubmit={(event) => { event.preventDefault(); saveLayout() }}>
    <h2 id="editor-title">Custom keyboard layout</h2>
    <p>Enter the keys in physical order, from the number row down. Each layer uses four rows of 13, 13, 11, and 10 keys.</p>
    <div class="editor-layers">
      <label class="field">Base keys <textarea rows="4" bind:value={draftBase} spellcheck="false"></textarea></label>
      <label class="field">Shifted keys <textarea rows="4" bind:value={draftShift} spellcheck="false"></textarea></label>
    </div>
    <label class="field">Lesson groups
      <input bind:value={draftGroups} spellcheck="false" aria-describedby="group-help" />
    </label>
    <p id="group-help">Separate the six groups with spaces. Each lesson adds its group to the keys from earlier lessons.</p>
    {#if editorError}<p class="error" role="alert">{editorError}</p>{/if}
    <div class="dialog-actions">
      <Button class="button subtle" onclick={() => editor.close()}>Discard</Button>
      <Button class="button primary" type="submit">Save layout</Button>
    </div>
  </form>
</dialog>
