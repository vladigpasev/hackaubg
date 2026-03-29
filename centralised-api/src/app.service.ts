import { Injectable } from '@nestjs/common';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

export type InstanceRecord = {
  ip: string;
  lat: number;
  lng: number;
};

@Injectable()
export class AppService {
  async orderAdequateHospitals(lat: number, lng: number) {
    const hospitalPort = process.env.HOSPITAL_NODE_PORT?.trim();
    const records = this.getAllRecordsInArea(lat, lng, 20);
    const recordsWithAttachedLoad = await Promise.all(
      records.map(async (record) => {
        const hospitalBaseUrl = this.buildHospitalBaseUrl(record.ip, hospitalPort);
        const url = `${hospitalBaseUrl}/decentralized/current-load`;
        let resp: Response | undefined = undefined;
        try {
          resp = await this.fetchWithTimeout(
            `${url}?lat=${record.lat}&lng=${record.lng}`,
          );
        } catch (e) {
          console.error(`Failed to fetch load from ${url}:`, e);
          return { ...record, load: Infinity };
        }
        const load = await resp.json();
        console.log(`Load from ${url}:`, load);
        return { ...record, load: load };
      }),
    );

    // console.log(recordsWithAttachedLoad);

    return recordsWithAttachedLoad;
  }

  private async fetchWithTimeout(
    url: string,
    timeoutMs = 5000,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  }
  private readonly csvHeader = 'ip,lat,lng';
  private readonly csvFilePath = join(this.getDataDirectory(), 'instances.csv');

  constructor() {
    this.ensureCsvDataStore();
  }

  parseLocalhostIp(ip: string): string {
    if (ip === '::1' || ip === '') return 'http://127.0.0.1';
    return ip;
  }

  getHello(): string {
    return 'Hello World!';
  }

  private getDataDirectory(): string {
    const configuredPath = process.env.INSTANCE_STORE_DIR?.trim();

    if (configuredPath) {
      return configuredPath;
    }

    const volumeMountPath = process.env.RAILWAY_VOLUME_MOUNT_PATH?.trim();

    if (volumeMountPath) {
      return volumeMountPath;
    }

    return join(process.cwd(), 'data');
  }

  private buildHospitalBaseUrl(address: string, hospitalPort?: string): string {
    const trimmedAddress = address.trim().replace(/\/+$/, '');

    if (/^https?:\/\//i.test(trimmedAddress)) {
      const parsed = new URL(trimmedAddress);

      if (!parsed.port && hospitalPort) {
        parsed.port = hospitalPort;
      }

      return parsed.toString().replace(/\/+$/, '');
    }

    const portSuffix = hospitalPort ? `:${hospitalPort}` : '';
    return `http://${trimmedAddress}${portSuffix}`;
  }

  createRecord(record: InstanceRecord): void {
    this.getAllRecords().find((r) => r.ip === record.ip)?.ip &&
      this.deleteRecord(record.ip);

    const csvLine = [
      this.escapeCsvValue(record.ip),
      String(record.lat),
      String(record.lng),
    ].join(',');

    appendFileSync(this.csvFilePath, `${csvLine}\n`, 'utf8');
  }

  private getAllRecordsInArea(
    lat: number,
    lng: number,
    radiusKm: number,
  ): InstanceRecord[] {
    const records = this.getAllRecords();

    return records.filter((record) => {
      const distance = this.calculateDistance(lat, lng, record.lat, record.lng);
      return distance <= radiusKm;
    });
  }

  private calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
    const R = 6371; // Earth radius in kilometers

    const dLat = toRadians(lat2 - lat1);
    const dLng = toRadians(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRadians(lat1)) *
        Math.cos(toRadians(lat2)) *
        Math.sin(dLng / 2) ** 2;

    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }

  getAllRecords(): InstanceRecord[] {
    const fileContent = readFileSync(this.csvFilePath, 'utf8');
    const lines = fileContent
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length <= 1) {
      return [];
    }

    return lines.slice(1).map((line) => {
      const [ip, lat, lng] = this.parseCsvLine(line);

      return {
        ip,
        lat: Number(lat),
        lng: Number(lng),
      };
    });
  }

  deleteRecord(ip: string): boolean {
    const records = this.getAllRecords();
    const filteredRecords = records.filter((record) => record.ip !== ip);

    if (filteredRecords.length === records.length) {
      return false;
    }

    const lines = [
      this.csvHeader,
      ...filteredRecords.map((record) =>
        [
          this.escapeCsvValue(record.ip),
          String(record.lat),
          String(record.lng),
        ].join(','),
      ),
    ];

    writeFileSync(this.csvFilePath, `${lines.join('\n')}\n`, 'utf8');
    return true;
  }

  private ensureCsvDataStore(): void {
    const dataDirectory = this.getDataDirectory();

    if (!existsSync(dataDirectory)) {
      mkdirSync(dataDirectory, { recursive: true });
    }

    if (!existsSync(this.csvFilePath)) {
      writeFileSync(this.csvFilePath, `${this.csvHeader}\n`, 'utf8');
      return;
    }

    const existingContent = readFileSync(this.csvFilePath, 'utf8');

    if (existingContent.trim().length === 0) {
      writeFileSync(this.csvFilePath, `${this.csvHeader}\n`, 'utf8');
      return;
    }

    const firstLine = existingContent.split(/\r?\n/)[0]?.trim();

    if (firstLine !== this.csvHeader) {
      writeFileSync(this.csvFilePath, `${this.csvHeader}\n`, 'utf8');
    }
  }

  private escapeCsvValue(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }

    return value;
  }

  private parseCsvLine(line: string): [string, string, string] {
    const values: string[] = [];
    let current = '';
    let insideQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const character = line[i];
      const nextCharacter = line[i + 1];

      if (character === '"' && insideQuotes && nextCharacter === '"') {
        current += '"';
        i += 1;
        continue;
      }

      if (character === '"') {
        insideQuotes = !insideQuotes;
        continue;
      }

      if (character === ',' && !insideQuotes) {
        values.push(current);
        current = '';
        continue;
      }

      current += character;
    }

    values.push(current);

    const [ip = '', lat = '', lng = ''] = values;
    return [ip, lat, lng];
  }
}
