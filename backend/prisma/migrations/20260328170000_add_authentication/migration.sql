CREATE TABLE "users" (
  "username" TEXT NOT NULL PRIMARY KEY,
  "passwordHash" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "isTester" BOOLEAN NOT NULL DEFAULT false,
  "specialties" TEXT NOT NULL DEFAULT '[]'
);
