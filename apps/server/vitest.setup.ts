process.env.NODE_ENV ??= "test";
process.env.DATABASE_URL ??=
  "postgresql://postgres:password@localhost:5432/kidlearn_test";
process.env.WEB_ORIGIN ??= "http://localhost:3000";
process.env.LOG_LEVEL ??= "fatal";
process.env.BETTER_AUTH_URL ??= "http://localhost:4000";
process.env.BETTER_AUTH_SECRET ??= "test-secret-at-least-32-chars-long!!";
process.env.GOOGLE_CLIENT_ID ??= "test-google-client-id";
process.env.GOOGLE_CLIENT_SECRET ??= "test-google-client-secret";
process.env.CRON_SECRET ??= "test-cron-secret-value";
process.env.CLOUDINARY_CLOUD_NAME ??= "test-cloud";
process.env.CLOUDINARY_API_KEY ??= "test-api-key";
process.env.CLOUDINARY_API_SECRET ??= "test-api-secret";
process.env.GEMINI_API_KEY ??= "test-gemini-key";
process.env.GOOGLE_TTS_API_KEY ??= "test-google-tts-key";
