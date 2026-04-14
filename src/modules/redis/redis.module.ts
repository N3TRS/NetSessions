import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import {
  REDIS_PUBLISHER_CLIENT,
  REDIS_SUBSCRIBER_CLIENT,
} from './redis.constants';
import { RedisService } from './redis.service';

function createRedisClient(configService: ConfigService): Redis {
  const redisUrl = configService.get<string>('REDIS_URL');
  const isTest = configService.get<string>('NODE_ENV') === 'test';

  const options = {
    lazyConnect: true,
    enableOfflineQueue: !isTest,
    maxRetriesPerRequest: isTest ? 1 : null,
  };

  return redisUrl ? new Redis(redisUrl, options) : new Redis(options);
}

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_PUBLISHER_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        createRedisClient(configService),
    },
    {
      provide: REDIS_SUBSCRIBER_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        createRedisClient(configService),
    },
    RedisService,
  ],
  exports: [RedisService],
})
export class RedisModule {}
