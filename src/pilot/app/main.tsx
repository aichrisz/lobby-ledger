import { render } from 'preact'
import '@fontsource-variable/fraunces/index.css'
import '../../styles/tokens.css'
import '../../styles/base.css'
import '../../styles/app.css'
import './pilot.css'
import { PilotApp } from './PilotApp'
import { createPilotClient } from '../api/client'
import { createSession } from '../api/session'
import { createPilotApi } from '../api/rpc'

const client = createPilotClient()
render(
  <PilotApp deps={{
    session: createSession(client),
    api: createPilotApi(client),
    storage: localStorage,
    now: () => new Date(),
  }} />,
  document.getElementById('app')!,
)
