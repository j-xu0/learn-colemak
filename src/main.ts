import { mount } from 'svelte'
import "@ui-sdk/core/web.css"
import './app.css'
import './agent'
import App from './App.svelte'

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app
