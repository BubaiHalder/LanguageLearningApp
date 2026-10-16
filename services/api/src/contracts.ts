import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

/** Language tags the app can select; must match the mobile catalog and the worker's Language type. */
export const LANGUAGE_TAGS = ['en', 'es', 'as', 'bn', 'brx', 'doi', 'gu', 'hi', 'kn', 'ks', 'kok', 'mai', 'ml', 'mni', 'mr',
  'ne', 'or', 'pa', 'sa', 'sat', 'sd', 'ta', 'te', 'ur'];

export class ContextMessage {
  @IsIn(['user', 'assistant']) role!: 'user' | 'assistant';
  @IsString() @MinLength(1) @MaxLength(2000) content!: string;
}
export class TutorRequest {
  @IsString() @MinLength(1) @MaxLength(2000) text!: string;
  @IsIn(LANGUAGE_TAGS) nativeLanguage!: string;
  @IsIn(LANGUAGE_TAGS) targetLanguage!: string;
  @IsOptional() @IsIn(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']) proficiency: string = 'A1';
  @IsOptional() @IsIn(['immediate', 'end']) correctionMode: string = 'immediate';
  @IsOptional() @IsArray() @ArrayMaxSize(12) @ValidateNested({ each: true }) @Type(() => ContextMessage)
  context: ContextMessage[] = [];
}
export class TranscriptionRequest {
  @IsIn(LANGUAGE_TAGS) nativeLanguage!: string;
  @IsIn(LANGUAGE_TAGS) targetLanguage!: string;
  @Type(() => Number) @IsInt() @Min(300) @Max(61000) durationMs!: number;
}
export class SpeechRequest {
  @IsString() @MinLength(1) @MaxLength(2000) text!: string;
  @IsIn(LANGUAGE_TAGS) language!: string;
  @IsString() @MinLength(1) @MaxLength(100) voiceId!: string;
}
