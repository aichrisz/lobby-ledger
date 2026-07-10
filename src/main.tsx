import { render } from 'preact'
import '@fontsource-variable/fraunces/index.css'
import './styles/tokens.css'
import './styles/base.css'
import './styles/app.css'
import './styles/print.css'
import { App } from './app/components/App'
import { createLedgerApp } from './app/state'

import { registerSW } from './app/sw-register'

const app = createLedgerApp(localStorage)
render(<App app={app} />, document.getElementById('app')!)
if (import.meta.env.PROD && !new URLSearchParams(location.search).has('e2e')) registerSW()
