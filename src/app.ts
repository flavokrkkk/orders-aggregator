import Fastify, { type FastifyInstance } from "fastify";
import type { Container } from "./container.js";
import { AppError } from "./errors.js";
import { customerRoutes } from "./routes/customers.js";
import { syncRoutes } from "./routes/sync.js";
import { webhookRoutes } from "./routes/webhooks.js";

export function buildApp(c: Container, opts: { logger?: boolean } = {}): FastifyInstance {
  const app = Fastify({ logger: opts.logger ?? false });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      return reply.code(err.statusCode).send({ error: err.code, message: err.message });
    }
    // Ошибки самого Fastify по вине клиента (битый JSON, неверный content-type, слишком большое тело) —
    // 4xx, а не 500: иначе отправитель вебхуков будет бесконечно ретраить заведомо плохой запрос
    const status = (err as { statusCode?: number }).statusCode;
    if (status !== undefined && status >= 400 && status < 500) {
      return reply.code(status).send({ error: status === 400 ? "bad_request" : "client_error", message: err.message });
    }
    req.log.error(err);
    return reply.code(500).send({ error: "internal", message: "Internal error" });
  });

  app.get("/health", async () => ({ status: "ok" }));
  syncRoutes(app, c);
  webhookRoutes(app, c);
  customerRoutes(app, c);
  return app;
}
