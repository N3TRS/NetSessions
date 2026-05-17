import { Test } from '@nestjs/testing';
import { ExecutionService } from 'src/modules/execution/execution.service';
import { PistonService } from 'src/modules/execution/piston.service';
import { SessionsService } from 'src/modules/sessions/sessions.service';
import { RedisService } from 'src/modules/redis/redis.service';
import { CollaborationGateway } from 'src/modules/collaboration/collaboration.gateway';

describe('ExecutionService — DI wiring', () => {
  let service: ExecutionService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ExecutionService,
        { provide: PistonService, useValue: { execute: jest.fn() } },
        { provide: SessionsService, useValue: { acquireRunLock: jest.fn(), releaseRunLock: jest.fn(), getSessionById: jest.fn() } },
        { provide: RedisService, useValue: { setSessionState: jest.fn() } },
        { provide: CollaborationGateway, useValue: { emitExecutionResult: jest.fn() } },
      ],
    }).compile();

    service = module.get(ExecutionService);
  });

  it('instantiates via NestJS DI', () => {
    expect(service).toBeDefined();
  });
});
