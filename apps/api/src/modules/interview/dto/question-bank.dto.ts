import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsByteLength, IsInt, IsOptional, IsString, IsUrl, Max, Min, ValidateNested } from 'class-validator';

export const QUESTION_BATCH_LIMIT = 20;
export class QuestionDto {
  @IsOptional() @IsString() @IsByteLength(1, 100) questionId?: string;
  @IsString() @IsByteLength(1, 100) position: string;
  @IsOptional() @IsString() @IsByteLength(1, 20) level?: string;
  @IsOptional() @IsString() @IsByteLength(1, 100) category?: string;
  @IsString() @IsByteLength(1, 4000) question: string;
  @IsString() @IsByteLength(1, 8000) answer: string;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) @IsByteLength(1, 40, { each: true }) tags?: string[];
}
export class QuestionBatchDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(QUESTION_BATCH_LIMIT) @ValidateNested({ each: true }) @Type(() => QuestionDto)
  questions: QuestionDto[];
}
export class QuestionSearchDto {
  @IsOptional() @IsString() @IsByteLength(0, 4000) q?: string;
  @IsOptional() @IsString() @IsByteLength(1, 100) position?: string;
  @IsOptional() @IsString() @IsByteLength(1, 20) level?: string;
  @IsOptional() @IsString() @IsByteLength(1, 100) category?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}
export class QuestionImportDto {
  @IsString() @IsByteLength(1, 100) position: string;
  @IsOptional() @IsString() @IsByteLength(1, 20) level?: string;
  @IsOptional() @IsString() @IsByteLength(1, 100) category?: string;
}
export class QuestionUrlDto extends QuestionImportDto {
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true }) @IsByteLength(1, 2000) url: string;
}
export class GenerateQuestionsDto {
  @IsString() @IsByteLength(20, 20000) text: string;
  @IsOptional() @IsString() @IsByteLength(1, 100) position?: string;
  @IsOptional() @IsInt() @Min(1) @Max(12) count?: number;
}
export class GenerateDynamicQuestionsDto {
  @IsString() @IsByteLength(20, 20000) resumeText: string;
  @IsOptional() @IsInt() @Min(1) @Max(12) count?: number;
}
