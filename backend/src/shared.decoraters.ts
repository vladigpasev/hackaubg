import { BadRequestException, PipeTransform } from '@nestjs/common';
import z, { ZodError } from 'zod';

export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: z.ZodType<T>) {}

  transform(value: unknown): T {
    try {
      return this.schema.parse(value);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new BadRequestException({
          message: 'Invalid request payload',
          errors: error.flatten().fieldErrors,
        });
      }

      throw error;
    }
  }
}
