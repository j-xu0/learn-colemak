import { hydrate } from 'svelte'
import './agent'
import App from './App.svelte'
import { restorePromptMarkup, startup } from './startup-prompt'

restorePromptMarkup()
hydrate(App, {
  target: document.getElementById('app')!,
  props: { startup },
})
