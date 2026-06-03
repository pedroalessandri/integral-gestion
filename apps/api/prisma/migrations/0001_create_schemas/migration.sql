-- Migration: 0001_create_schemas
-- Creates the four PostgreSQL schemas used by gestion-publica.
-- All subsequent model migrations will use @@schema() to place tables in the correct schema.

CREATE SCHEMA IF NOT EXISTS "core";
CREATE SCHEMA IF NOT EXISTS "auth";
CREATE SCHEMA IF NOT EXISTS "okr";
CREATE SCHEMA IF NOT EXISTS "audit";
