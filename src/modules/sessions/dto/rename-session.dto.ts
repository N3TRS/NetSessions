import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RenameSessionDto {
  @ApiProperty({
    description: 'New session name (unique per owner).',
    example: 'Algoritmos - clase 3 (renombrada)',
    maxLength: 80,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;
}
