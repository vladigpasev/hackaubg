import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class HospitalIntegrationService {
  constructor(private readonly configService: ConfigService) {}

  getBoundary() {
    return {
      enabled: false,
      baseUrl: this.configService.get<string>('HOSPITAL_API_BASE_URL') ?? null,
    };
  }
}
