import express, { RequestHandler } from 'express';
import { defaultLogger, HeartbeatGroup } from '@orml/util';

const logger = defaultLogger.createLogger('api');

const createServer = (options: { port: number | string; heartbeats: HeartbeatGroup }) => {
  try {
    const app = express();

    app.get('/health', (req, res) => {
      if (options.heartbeats.isAlive()) {
        res.send(options.heartbeats.summary());
      } else {
        res.status(503).send(options.heartbeats.summary());
      }
    });

    app.listen(options.port, () => {
      logger.info('API server started at port', options.port);
    });

    return app;
  } catch (error) {
    logger.error('Failed to start API server', error);
    throw error;
  }
};

export default createServer;
