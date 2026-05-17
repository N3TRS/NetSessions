import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { CollaborationGateway } from 'src/modules/collaboration/collaboration.gateway';
import { SessionsService } from 'src/modules/sessions/sessions.service';
import { RedisService } from 'src/modules/redis/redis.service';
import { WsJwtGuard } from 'src/modules/collaboration/guards/ws-jwt.guard';

describe('CollaborationGateway — DI wiring', () => {
  let gateway: CollaborationGateway;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        CollaborationGateway,
        {
          provide: SessionsService,
          useValue: { joinSessionById: jest.fn(), markParticipantOffline: jest.fn(), getRolesMap: jest.fn() },
        },
        {
          provide: RedisService,
          useValue: {
            assignSessionColor: jest.fn(),
            getSessionMembers: jest.fn(),
            getSessionState: jest.fn(),
            getSessionColors: jest.fn(),
            publishSessionEvent: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: { verifyAsync: jest.fn() },
        },
        WsJwtGuard,
      ],
    }).compile();

    gateway = module.get(CollaborationGateway);
  });

  it('instantiates via NestJS DI', () => {
    expect(gateway).toBeDefined();
  });
});
