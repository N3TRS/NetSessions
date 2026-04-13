export const DEFAULT_PISTON_BASE_URL = 'http://localhost:2000/api/v2';

export const ALLOWED_LANGUAGES: Record<string, string> = {
  javascript: '18.15.0',
  typescript: '5.0.3',
  python: '3.12.0',
  java: '15.0.2',
};

export const FILE_EXTENSIONS: Record<string, string> = {
  javascript: '.js',
  typescript: '.ts',
  python: '.py',
  java: '.java',
};

export const MAX_CODE_LENGTH = 200000;
export const MAX_ARGS_LENGTH = 10;
export const MAX_STDIN_LENGTH = 20000;
