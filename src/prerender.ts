import { render } from 'svelte/server'
import App from './App.svelte'

export function renderApp() {
  return `<div id="app">${render(App).body}</div>`
}
