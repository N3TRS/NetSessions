import { HttpException, HttpStatus } from '@nestjs/common';
import { HttpExceptionFilter } from 'src/common/filters/http-exception.filter';

const makeHost = (method = 'GET', url = '/test') => {
  const response = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  const request = { method, url };

  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
    _response: response,
  };
};

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
  });

  it('handles HttpException with correct status', () => {
    const host = makeHost();
    const exception = new HttpException('Not found', HttpStatus.NOT_FOUND);

    filter.catch(exception, host as any);

    expect(host._response.status).toHaveBeenCalledWith(404);
    expect(host._response.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, message: 'Not found' }),
    );
  });

  it('handles non-HttpException with 500 status', () => {
    const host = makeHost();
    const exception = new Error('Unexpected error');

    filter.catch(exception, host as any);

    expect(host._response.status).toHaveBeenCalledWith(500);
    expect(host._response.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500, message: 'Internal server error' }),
    );
  });

  it('includes timestamp and path in response', () => {
    const host = makeHost('POST', '/v1/sessions');
    const exception = new HttpException('Conflict', HttpStatus.CONFLICT);

    filter.catch(exception, host as any);

    const jsonArg = host._response.json.mock.calls[0][0];
    expect(jsonArg.path).toBe('/v1/sessions');
    expect(jsonArg.timestamp).toBeDefined();
  });

  it('handles non-Error unknown exceptions', () => {
    const host = makeHost();

    filter.catch('string error', host as any);

    expect(host._response.status).toHaveBeenCalledWith(500);
  });
});
