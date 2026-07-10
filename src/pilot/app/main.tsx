import { render } from 'preact'
import '@fontsource-variable/fraunces/index.css'
import '../../styles/tokens.css'
import '../../styles/base.css'
import '../../styles/app.css'
import './pilot.css'
import { PilotApp } from './PilotApp'

render(<PilotApp />, document.getElementById('app')!)
