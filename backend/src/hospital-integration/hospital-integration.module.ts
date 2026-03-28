import { Module } from '@nestjs/common';
import { HospitalIntegrationService } from './hospital-integration.service';

@Module({
  providers: [HospitalIntegrationService],
  exports: [HospitalIntegrationService],
})
export class HospitalIntegrationModule {}
