import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { SessionsController } from 'src/modules/sessions/sessions.controller';
import { SessionsService } from 'src/modules/sessions/sessions.service';
import { CollaborationGateway } from 'src/modules/collaboration/collaboration.gateway';
import { JwtAuthGuard } from 'src/modules/auth-integration/guards/jwt-auth.guard';

describe('SessionsController — DI wiring', () => {
  let controller: SessionsController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [SessionsController],
      providers: [
        {
          provide: SessionsService,
          useValue: { createSession: jest.fn(), listSessionsForUser: jest.fn() },
        },
        {
          provide: CollaborationGateway,
          useValue: { emitRoleUpdated: jest.fn() },
        },
        {
          provide: JwtService,
          useValue: { verifyAsync: jest.fn() },
        },
        JwtAuthGuard,
      ],
    }).compile();

    controller = module.get(SessionsController);
  });

  it('instantiates via NestJS DI', () => {
    expect(controller).toBeDefined();
  });
});
