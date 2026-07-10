import { render } from 'preact'
import '@fontsource-variable/fraunces/index.css'
import './styles/tokens.css'
import './styles/base.css'
import './styles/app.css'
import { App } from './app/components/App'
import { createLedgerApp } from './app/state'

const app = createLedgerApp(localStorage)
render(<App app={app} />, document.getElementById('app')!)
