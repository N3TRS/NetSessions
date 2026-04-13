import { IsMongoId, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class WsLanguageChangedDto {
  @IsMongoId()
  sessionId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  language!: string;
}
