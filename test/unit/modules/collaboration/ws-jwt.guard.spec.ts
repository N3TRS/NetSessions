import { UnauthorizedException } from '@nestjs/common';
import { WsJwtGuard } from 'src/modules/collaboration/guards/ws-jwt.guard';

const makeClient = (auth?: Record<string, string>, headers?: Record<string, string>) => ({
  data: {} as Record<string, unknown>,
  handshake: {
    auth: auth ?? {},
    headers: headers ?? {},
  },
});

const makeContext = (client: ReturnType<typeof makeClient>) => ({
  switchToWs: () => ({
    getClient: () => client,
  }),
});

describe('WsJwtGuard', () => {
  let guard: WsJwtGuard;
  let jwtService: { verifyAsync: jest.Mock };

  beforeEach(() => {
    jwtService = { verifyAsync: jest.fn() };
    guard = new WsJwtGuard(jwtService as any);
  });

  it('throws UnauthorizedException when no token provided', async () => {
    const client = makeClient();
    const ctx = makeContext(client);

    await expect(guard.canActivate(ctx as any)).rejects.toThrow(UnauthorizedException);
  });

  it('verifies token from handshake auth.token', async () => {
    const payload = { email: 'user@test.com' };
    jwtService.verifyAsync.mockResolvedValue(payload);

    const client = makeClient({ token: 'auth-token' });
    const ctx = makeContext(client);

    const result = await guard.canActivate(ctx as any);

    expect(result).toBe(true);
    expect(jwtService.verifyAsync).toHaveBeenCalledWith('auth-token');
    expect(client.data.user).toEqual(payload);
  });

  it('verifies token from Authorization header', async () => {
    const payload = { email: 'user@test.com' };
    jwtService.verifyAsync.mockResolvedValue(payload);

    const client = makeClient({}, { authorization: 'Bearer header-token' });
    const ctx = makeContext(client);

    const result = await guard.canActivate(ctx as any);

    expect(result).toBe(true);
    expect(jwtService.verifyAsync).toHaveBeenCalledWith('header-token');
  });

  it('throws UnauthorizedException on invalid token', async () => {
    jwtService.verifyAsync.mockRejectedValue(new Error('expired'));

    const client = makeClient({ token: 'bad-token' });
    const ctx = makeContext(client);

    await expect(guard.canActivate(ctx as any)).rejects.toThrow(UnauthorizedException);
  });

  it('ignores non-Bearer authorization header', async () => {
    const client = makeClient({}, { authorization: 'Basic sometoken' });
    const ctx = makeContext(client);

    await expect(guard.canActivate(ctx as any)).rejects.toThrow(UnauthorizedException);
  });

  it('prefers auth.token over Authorization header', async () => {
    const payload = { email: 'user@test.com' };
    jwtService.verifyAsync.mockResolvedValue(payload);

    const client = makeClient({ token: 'auth-token' }, { authorization: 'Bearer header-token' });
    const ctx = makeContext(client);

    await guard.canActivate(ctx as any);

    expect(jwtService.verifyAsync).toHaveBeenCalledWith('auth-token');
  });
});
