/**
 * Orquestador del seed demo (ADR-0011 D8). Siembra cada organización demo con su propio archivo:
 *  - `seed-demo-san-carrillo.ts`: Municipalidad de San Carrillo (sector público).
 *  - `seed-demo-lumbre.ts`: Lumbre Electrodomésticos S.A. (sector privado).
 *
 *   pnpm --filter api build
 *   pnpm --filter api prisma:seed        # node dist/database/seed-demo.js
 */
import { PrismaClient } from '@prisma/client';
import { seedSanCarrillo } from './seed-demo-san-carrillo.js';
import { seedLumbre } from './seed-demo-lumbre.js';

const prisma = new PrismaClient();

async function run(): Promise<void> {
  await seedSanCarrillo(prisma);
  await seedLumbre(prisma);
}

run()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error('[seed] FAILED:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
