import { BadGatewayException, BadRequestException, RequestTimeoutException } from '@nestjs/common';
import { PistonService } from 'src/modules/execution/piston.service';

const mockConfigService = {
  get: jest.fn().mockReturnValue('http://piston.test/api/v2'),
};

describe('PistonService', () => {
  let service: PistonService;

  beforeEach(() => {
    service = new PistonService(mockConfigService as any);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('throws BadRequestException for unsupported language', async () => {
    await expect(
      service.execute({ language: 'cobol', code: 'DISPLAY "hello"' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('calls fetch with correct payload and returns result', async () => {
    const pistonResponse = {
      language: 'javascript',
      version: '18.15.0',
      run: { stdout: 'hello\n', stderr: '', code: 0, signal: null, output: 'hello\n' },
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(pistonResponse),
    } as any);

    const result = await service.execute({ language: 'javascript', code: 'console.log("hello")' });

    expect(fetch).toHaveBeenCalledWith(
      'http://piston.test/api/v2/execute',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(result).toEqual(pistonResponse);
  });

  it('uses default base URL when config returns undefined', async () => {
    mockConfigService.get.mockReturnValueOnce(undefined);
    const pistonResponse = { language: 'python', version: '3.12.0', run: { stdout: '', stderr: '', code: 0, signal: null, output: '' } };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(pistonResponse),
    } as any);

    await service.execute({ language: 'python', code: 'print()' });

    expect((fetch as jest.Mock).mock.calls[0][0]).toContain('localhost:2000');
  });

  it('throws BadGatewayException when response is not ok', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
    } as any);

    await expect(
      service.execute({ language: 'javascript', code: 'code' }),
    ).rejects.toThrow(BadGatewayException);
  });

  it('throws RequestTimeoutException on abort', async () => {
    global.fetch = jest.fn().mockImplementation(() => {
      const err = new Error('fetch aborted');
      err.name = 'AbortError';
      return Promise.reject(err);
    });

    await expect(
      service.execute({ language: 'javascript', code: 'code' }),
    ).rejects.toThrow(RequestTimeoutException);
  });

  it('throws BadGatewayException on network error', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(
      service.execute({ language: 'javascript', code: 'code' }),
    ).rejects.toThrow(BadGatewayException);
  });

  it('passes stdin and args to piston payload', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({}),
    } as any);

    await service.execute({
      language: 'python',
      code: 'print(input())',
      stdin: 'hello',
      args: ['--flag'],
    });

    const body = JSON.parse((fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.stdin).toBe('hello');
    expect(body.args).toEqual(['--flag']);
  });

  it('uses correct file extension per language', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({}),
    } as any);

    await service.execute({ language: 'typescript', code: 'const x = 1;' });

    const body = JSON.parse((fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.files[0].name).toBe('main.ts');
  });

  it('falls back to .txt extension when language has no mapped extension', async () => {
    // Temporarily inject a language into ALLOWED_LANGUAGES without a FILE_EXTENSIONS entry
    const constants = require('src/modules/execution/constants/piston.constants');
    const originalAllowed = { ...constants.ALLOWED_LANGUAGES };
    const originalExts = { ...constants.FILE_EXTENSIONS };

    constants.ALLOWED_LANGUAGES['brainfuck'] = '2.7.3';
    delete constants.FILE_EXTENSIONS['brainfuck'];

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({}),
    } as any);

    await service.execute({ language: 'brainfuck', code: '+++.' });

    const body = JSON.parse((fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.files[0].name).toBe('main.txt');

    // Restore
    Object.keys(constants.ALLOWED_LANGUAGES).forEach((k) => delete constants.ALLOWED_LANGUAGES[k]);
    Object.assign(constants.ALLOWED_LANGUAGES, originalAllowed);
    Object.keys(constants.FILE_EXTENSIONS).forEach((k) => delete constants.FILE_EXTENSIONS[k]);
    Object.assign(constants.FILE_EXTENSIONS, originalExts);
  });
});
