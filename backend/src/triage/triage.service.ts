import { Injectable } from '@nestjs/common';
import { REDIS_RESERVED_NAMESPACES } from '../redis/redis.constants';

@Injectable()
export class TriageService {
  readonly reservedNamespaces = REDIS_RESERVED_NAMESPACES.filter((namespace) =>
    namespace.startsWith('triage:'),
  );
}
