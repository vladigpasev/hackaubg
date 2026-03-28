import { StreamEvent, StreamService } from '../service/stream.service.js';
import { Controller, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';

@Controller()
export class StreamController {
  constructor(readonly streamService: StreamService) {}

  @Sse('stream')
  public stream(): Observable<StreamEvent> {
    return this.streamService.stream;
  }
}
