import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AppService, InstanceRecord } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('api/add-instance')
  addInstance(
    @Req() req: Request,
    @Query('lat') lat: string,
    @Query('lng') lng: string,
  ) {
    const latNum = Number(lat);
    const lngNum = Number(lng);
    const instanceIp = req.ip;

    if (Number.isNaN(latNum) || Number.isNaN(lngNum)) {
      throw new BadRequestException('Invalid latitude or longitude values.');
    }

    const record: InstanceRecord = {
      ip: instanceIp!,
      lat: latNum,
      lng: lngNum,
    };

    this.appService.createRecord(record);
    return { success: true };
  }

  @Get('/api/find-best-fit-hospital')
  async findBestFitHospital(
    @Query('lat') lat: string,
    @Query('lng') lng: string,
  ): Promise<InstanceRecord> {
    const latNum = Number(lat);
    const lngNum = Number(lng);

    if (Number.isNaN(latNum) || Number.isNaN(lngNum)) {
      throw new BadRequestException('Invalid latitude or longitude values.');
    }

    return this.appService.orderAdequateHospitals(latNum, lngNum)[0];
  }
}
