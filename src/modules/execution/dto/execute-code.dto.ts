import {
  ArrayMaxSize,
  IsArray,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  MAX_ARGS_LENGTH,
  MAX_CODE_LENGTH,
  MAX_STDIN_LENGTH,
} from '../constants/piston.constants';

export class ExecuteCodeDto {
  @IsMongoId()
  sessionId!: string;

  @IsString()
  @MaxLength(30)
  language!: string;

  @IsString()
  @MaxLength(MAX_CODE_LENGTH)
  code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_STDIN_LENGTH)
  stdin?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_ARGS_LENGTH)
  @IsString({ each: true })
  args?: string[];
}
