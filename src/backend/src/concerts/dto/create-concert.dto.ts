import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsOptional,
  IsEnum,
  IsArray,
} from 'class-validator';
import { ConcertStatus } from '@prisma/client';

export class CreateConcertDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  slug: string;

  @IsString()
  @IsNotEmpty()
  venue: string;

  @IsDateString()
  startsAt: string;

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
