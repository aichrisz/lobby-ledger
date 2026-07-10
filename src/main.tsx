import { render } from 'preact'
import '@fontsource-variable/fraunces/index.css'
import './styles/tokens.css'
import './styles/base.css'
import './styles/app.css'
import { App } from './app/components/App'

render(<App />, document.getElementById('app')!)
