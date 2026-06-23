import {
  IsString,
  IsDateString,
  IsOptional,
  IsEnum,
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
  @IsString()
  bioSourceUrl?: string;

  @IsOptional()
  @IsString()
  seatMapSvg?: string;
}
