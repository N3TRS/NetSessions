import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  RequestTimeoutException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ALLOWED_LANGUAGES,
  DEFAULT_PISTON_BASE_URL,
  FILE_EXTENSIONS,
} from './constants/piston.constants';
import {
  PistonExecuteRequest,
  PistonExecuteResponse,
} from './interfaces/piston.interfaces';

interface ExecuteInput {
  language: string;
  code: string;
  stdin?: string;
  args?: string[];
}

@Injectable()
export class PistonService {
  constructor(private readonly configService: ConfigService) {}

  async execute(input: ExecuteInput): Promise<PistonExecuteResponse> {
    const normalizedLanguage = input.language.toLowerCase();
    const version = ALLOWED_LANGUAGES[normalizedLanguage];

    if (!version) {
      throw new BadRequestException('Language not allowed');
    }

    const extension = FILE_EXTENSIONS[normalizedLanguage] ?? '.txt';
    const payload: PistonExecuteRequest = {
      language: normalizedLanguage,
      version,
      files: [
        {
          name: `main${extension}`,
          content: input.code,
        },
      ],
      stdin: input.stdin ?? '',
      args: input.args ?? [],
      compile_timeout: 10000,
      run_timeout: 3000,
      compile_memory_limit: -1,
      run_memory_limit: -1,
    };

    const baseUrl =
      this.configService.get<string>('PISTON_API_URL') ?? DEFAULT_PISTON_BASE_URL;

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), 15000);

    try {
      const response = await fetch(`${baseUrl}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new BadGatewayException('Piston execution failed');
      }

      return (await response.json()) as PistonExecuteResponse;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new RequestTimeoutException('Execution request timed out');
      }

      if (error instanceof BadGatewayException) {
        throw error;
      }

      throw new BadGatewayException('Could not reach Piston API');
    } finally {
      clearTimeout(timeout);
    }
  }
}
