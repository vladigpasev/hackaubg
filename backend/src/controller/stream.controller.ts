import { Controller, Sse, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { AUTH_COOKIE_NAME } from '../auth/auth.constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StreamEvent, StreamService } from '../service/stream.service';

@ApiTags('stream')
@ApiCookieAuth(AUTH_COOKIE_NAME)
@UseGuards(JwtAuthGuard)
@Controller()
export class StreamController {
  constructor(readonly streamService: StreamService) {}

  @Sse('stream')
  public stream(): Observable<StreamEvent> {
    return this.streamService.stream;
  }
}
