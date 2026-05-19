import { NgModule } from '@angular/core'
import { TerminalDecorator } from 'tabby-terminal'

import { ServerStatusDecorator } from './statusDecorator'
import './statusBar.scss'

@NgModule({
    providers: [
        { provide: TerminalDecorator, useClass: ServerStatusDecorator, multi: true },
    ],
})
export default class ServerStatusModule { } // eslint-disable-line @typescript-eslint/no-extraneous-class
