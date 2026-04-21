import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSessionDto {
  @ApiProperty({
    description: 'Human-readable session name (unique per owner).',
    example: 'Algoritmos - clase 3',
    maxLength: 80,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({
    description: 'Editor language. Defaults to "javascript".',
    example: 'python',
    maxLength: 30,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  language?: string;
}
