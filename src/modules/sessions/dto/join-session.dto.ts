import { IsNotEmpty, IsString, Length } from 'class-validator';

export class JoinSessionDto {
  @IsString()
  @IsNotEmpty()
  @Length(8, 8)
  inviteCode!: string;
}
