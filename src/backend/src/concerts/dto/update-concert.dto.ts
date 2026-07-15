import {
  IsString,
  IsDateString,
  IsOptional,
  IsEnum,
  IsArray,
} from 'class-validator';
import { ConcertStatus } from '@prisma/client';

export class UpdateConcertDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  venue?: string;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsEnum(ConcertStatus)
  status?: ConcertStatus;

  @IsOptional()
  @IsString()
  artistBio?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  artists?: string[];

  @IsOptional()
  @IsString()
  bioSourceUrl?: string;

  @IsOptional()
  @IsString()
  seatMapSvg?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;
}
