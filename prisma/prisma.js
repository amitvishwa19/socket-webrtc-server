import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

const prismaClientSingleton = () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
    const adapter = new PrismaPg(pool)
    return new PrismaClient({ adapter })
}

global.prismaGlobal_V5_Auth = global.prismaGlobal_V5_Auth || prismaClientSingleton();

export const prisma = global.prismaGlobal_V5_Auth;

if (process.env.APP_MODE !== 'prod') globalThis.prismaGlobal_V5_Auth = prisma