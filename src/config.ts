// README предлагает `cp .env.example .env`, но раньше .env никто не читал и сервис молча шёл на дефолты.
// Переменные окружения процесса имеют приоритет над .env; файла может не быть.
try {
  process.loadEnvFile();
} catch {
  // нет .env или Node < 20.12 — работаем на переменных окружения и дефолтах
}

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") {
    throw new Error(`Missing env variable ${name}`);
  }
  return value;
}

export const config = {
  databaseUrl: required("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/orders"),
  ordersApiUrl: required("ORDERS_API_URL", "http://localhost:4000"),
  port: Number(process.env.PORT ?? 3000),
};
