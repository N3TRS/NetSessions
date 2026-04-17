import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateSessionSnapshotDto {
  @ApiProperty({
    description: 'Language the snapshot was saved with.',
    example: 'javascript',
    maxLength: 30,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  language!: string;

  @ApiProperty({
    description: 'Full source code at save time (up to 200k characters).',
    example: 'console.log("hello");',
    maxLength: 200000,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200000)
  code!: string;
}
