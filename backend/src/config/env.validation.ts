import Joi from 'joi';

export function validateEnv(config: Record<string, unknown>) {
  const schema = Joi.object({
    PORT: Joi.number().port().default(3000),
    DATABASE_URL: Joi.string().uri({ scheme: ['postgresql', 'postgres'] }).required(),
    REDIS_URL: Joi.string().uri({ scheme: ['redis'] }).required(),
    JWT_SECRET: Joi.string().min(16).required(),
    CORS_ORIGIN: Joi.string().uri({ scheme: ['http', 'https'] }).required(),
    HOSPITAL_API_BASE_URL: Joi.string()
      .uri({ scheme: ['http', 'https'] })
      .default('https://hospital-system.example.com'),
    VITE_API_URL: Joi.string()
      .uri({ scheme: ['http', 'https'] })
      .optional(),
  }).unknown(true);

  const validationResult = schema.validate(config, {
    abortEarly: false,
    convert: true,
  });

  if (validationResult.error) {
    throw new Error(
      `Environment validation failed: ${validationResult.error.message}`,
    );
  }

  return validationResult.value as Record<string, unknown>;
}
