import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, IsUrl, Matches, Max, MaxLength, Min } from 'class-validator';
export class CreateDataCollectionDto {
  @IsString() @Matches(/\S/) @MaxLength(120) name!: string;
  @IsIn(['QUESTION', 'ARTICLE', 'DOCUMENT']) kind!: 'QUESTION' | 'ARTICLE' | 'DOCUMENT';
}
export class DataPageDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 20;
  @IsOptional() @IsString() @MaxLength(120) q?: string;
  @IsOptional() @IsIn(['QUESTION', 'ARTICLE', 'DOCUMENT']) kind?: 'QUESTION' | 'ARTICLE' | 'DOCUMENT';
}
export class CreateDataRecordDto {
  @IsString() @Matches(/\S/) @MaxLength(120) title!: string;
  @IsString() @Matches(/\S/) @MaxLength(20000) content!: string;
  @IsOptional() @IsUrl({ protocols: ['http', 'https'], require_protocol: true }) @MaxLength(2000) sourceUrl?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(40, { each: true }) tags?: string[];
}
export class UpdateDataRecordDto extends CreateDataRecordDto {
  @IsInt() @Min(1) revision!: number;
}
export class DataGrantDto {
  @IsString() @Matches(/\S/) @MaxLength(100) userId!: string;
  @IsIn(['READ', 'WRITE']) access!: 'READ' | 'WRITE';
}
export class DeleteDataRecordDto {
  @Type(() => Number) @IsInt() @Min(1) revision!: number;
}
