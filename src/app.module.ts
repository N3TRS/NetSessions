import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './modules/health/health.module';
import { AuthIntegrationModule } from './modules/auth-integration/auth-integration.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { CollaborationModule } from './modules/collaboration/collaboration.module';
import { ExecutionModule } from './modules/execution/execution.module';
import { RedisModule } from './modules/redis/redis.module';
import { PersistenceModule } from './modules/persistence/persistence.module';
import { YjsModule } from './modules/yjs/yjs.module';
import { MetricsController } from './metrics/metrics.controller';
import { MetricsService } from './metrics/metrics.service';
import { MetricsInterceptor } from './metrics/metrics.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      expandVariables: true,
    }),

    HealthModule,
    AuthIntegrationModule,
    SessionsModule,
    CollaborationModule,
    ExecutionModule,
    RedisModule,
    PersistenceModule,
    YjsModule,
  ],

  controllers: [MetricsController],

  providers: [
    MetricsService,

    {
      provide: APP_INTERCEPTOR,
      useClass: MetricsInterceptor,
    },
  ],
})
export class AppModule {}