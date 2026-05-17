import { UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth-integration/guards/jwt-auth.guard';

const makeContext = (authHeader?: string) => ({
  switchToHttp: () => ({
    getRequest: () => ({
      headers: { authorization: authHeader },
      user: undefined as unknown,
    }),
  }),
});

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let jwtService: { verifyAsync: jest.Mock };

  beforeEach(() => {
    jwtService = { verifyAsync: jest.fn() };
    guard = new JwtAuthGuard(jwtService as any);
  });

  it('throws UnauthorizedException when no auth header', async () => {
    await expect(guard.canActivate(makeContext() as any)).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when header does not start with Bearer', async () => {
    await expect(guard.canActivate(makeContext('Basic token123') as any)).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when token is empty after Bearer', async () => {
    await expect(guard.canActivate(makeContext('Bearer ') as any)).rejects.toThrow(UnauthorizedException);
  });

  it('verifies token and attaches user to request', async () => {
    const payload = { email: 'user@test.com', sub: 'user-id' };
    jwtService.verifyAsync.mockResolvedValue(payload);

    const ctx = makeContext('Bearer valid-token');
    const result = await guard.canActivate(ctx as any);

    expect(result).toBe(true);
    expect(jwtService.verifyAsync).toHaveBeenCalledWith('valid-token');
  });

  it('throws UnauthorizedException on invalid token', async () => {
    jwtService.verifyAsync.mockRejectedValue(new Error('invalid signature'));

    await expect(guard.canActivate(makeContext('Bearer bad-token') as any)).rejects.toThrow(UnauthorizedException);
  });
});
