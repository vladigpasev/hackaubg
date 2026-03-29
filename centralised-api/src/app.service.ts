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
  private readonly csvHeader = 'ip,lat,lng';
  private readonly csvFilePath = join(process.cwd(), 'data', 'instances.csv');

  constructor() {
    this.ensureCsvDataStore();
  }

  getHello(): string {
    return 'Hello World!';
  }

  createRecord(record: InstanceRecord): void {
    const csvLine = [
      this.escapeCsvValue(record.ip),
      String(record.lat),
      String(record.lng),
    ].join(',');

    appendFileSync(this.csvFilePath, `${csvLine}\n`, 'utf8');
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
    const dataDirectory = join(process.cwd(), 'data');

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
