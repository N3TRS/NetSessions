import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length } from 'class-validator';

export class JoinSessionDto {
  @ApiProperty({
    description: '8-character hex invite code (uppercase).',
    example: 'A1B2C3D4',
    minLength: 8,
    maxLength: 8,
  })
  @IsString()
  @IsNotEmpty()
  @Length(8, 8)
  inviteCode!: string;
}
