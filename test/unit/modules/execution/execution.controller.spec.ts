import { UnauthorizedException } from '@nestjs/common';
import { ExecutionController } from 'src/modules/execution/execution.controller';
import { ExecutionService } from 'src/modules/execution/execution.service';

describe('ExecutionController', () => {
  let controller: ExecutionController;
  let executionService: jest.Mocked<ExecutionService>;

  beforeEach(() => {
    executionService = {
      runCode: jest.fn(),
    } as unknown as jest.Mocked<ExecutionService>;

    controller = new ExecutionController(executionService);
  });

  const dto = {
    sessionId: 'session-id',
    language: 'javascript',
    code: 'console.log("hello")',
  };

  it('calls service with email and dto', async () => {
    const result = { sessionId: 'session-id', runBy: 'user@test.com', run: { stdout: 'hello\n' } };
    executionService.runCode.mockResolvedValue(result as any);

    const req = { user: { email: 'user@test.com' } } as any;
    const response = await controller.runCode(req, dto);

    expect(executionService.runCode).toHaveBeenCalledWith('user@test.com', dto);
    expect(response).toEqual(result);
  });

  it('throws UnauthorizedException when user email missing', () => {
    const req = { user: {} } as any;

    expect(() => controller.runCode(req, dto)).toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when no user object', () => {
    const req = {} as any;

    expect(() => controller.runCode(req, dto)).toThrow(UnauthorizedException);
  });
});
