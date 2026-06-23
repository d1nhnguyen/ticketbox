import {
  IsString,
  IsInt,
  IsPositive,
  IsDateString,
  IsOptional,
  Min,
} from 'class-validator';

export class UpdateTicketTypeDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  price?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  totalQty?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxPerUser?: number;

  @IsOptional()
  @IsDateString()
  saleStartsAt?: string;
}
