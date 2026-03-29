import { Controller, Get } from '@nestjs/common';
import { PatientService } from 'src/patient/patient.service';

@Controller('decentralized')
export class DecentralizedController {
  constructor(private patientService: PatientService) {}

  @Get('current-load')
  async curentLoad() {
    return this.patientService.currentLoad();
  }
}
