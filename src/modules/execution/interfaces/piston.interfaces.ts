export interface PistonExecuteFile {
  name: string;
  content: string;
}

export interface PistonExecuteRequest {
  language: string;
  version: string;
  files: PistonExecuteFile[];
  stdin: string;
  args: string[];
  compile_timeout: number;
  run_timeout: number;
  compile_memory_limit: number;
  run_memory_limit: number;
}

export interface PistonRunResult {
  stdout: string;
  stderr: string;
  code: number;
  signal: string | null;
  output: string;
}

export interface PistonExecuteResponse {
  run: PistonRunResult;
  language: string;
  version: string;
}
