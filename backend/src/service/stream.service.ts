import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';

export type StreamEvent = {
  type: string;
  data: any;
};

@Injectable()
export class StreamService {
  private readonly _stream = new Subject<StreamEvent>();
  readonly stream = this._stream.asObservable();

  pushEvent(event: StreamEvent) {
    this._stream.next(event);
  }
}
