-- Runs only on first initialisation of the kidlearn-pgdata volume.
-- `kidlearn_test` is the database apps/server/vitest.setup.ts falls back to.
CREATE DATABASE kidlearn_test;
