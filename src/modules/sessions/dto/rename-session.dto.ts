import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RenameSessionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;
}
