import { render } from 'preact'
import '@fontsource-variable/fraunces/index.css'
import './styles/tokens.css'
import { App } from './app/components/App'

render(<App />, document.getElementById('app')!)
