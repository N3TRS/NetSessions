import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateSessionSnapshotDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  language!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200000)
  code!: string;
}
