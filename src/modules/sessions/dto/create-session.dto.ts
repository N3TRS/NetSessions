import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSessionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  language?: string;
}
