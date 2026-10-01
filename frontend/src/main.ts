import { mount } from 'svelte'
// Self-hosted webfonts (AD-19): bundled by Vite, font-display: swap, no third-party origin.
import '@fontsource/inter/400.css'
import '@fontsource/inter/600.css'
import '@fontsource/jetbrains-mono/400.css'
import './app.css'
import App from './App.svelte'

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app
