import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;

export const sequelize = connectionString
  ? new Sequelize(connectionString, {
      dialect: 'postgres',
      logging: false,
      dialectOptions: {
        // Neon requires SSL; rejectUnauthorized:false avoids certificate issues in serverless envs
        ssl: { require: true, rejectUnauthorized: false },
      },
    })
  : new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASS, {
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT || 5432),
      dialect: 'postgres',
      logging: false,
    });

export async function connectDB() {
  await sequelize.authenticate();
  await sequelize.sync({ alter: true });
  console.log('✅ DB connected & synced');
}
