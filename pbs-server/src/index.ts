import "dotenv/config";
import { buildServer } from "./app.js";
import { env } from "./config/index.js";

const start = async () => {
  const server = await buildServer();

  try {
    await server.listen({
      host: env.HOST,
      port: env.PORT,
    });
    server.log.info(`PBS server listening on ${env.HOST}:${env.PORT}`);
  } catch (error) {
    server.log.error(error);
    process.exit(1);
  }
};

void start();
