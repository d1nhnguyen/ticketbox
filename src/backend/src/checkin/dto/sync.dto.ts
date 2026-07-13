import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsISO8601,
  IsNotEmpty,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class ScanDto {
  @IsUUID()
  clientLogId: string;

  @IsUUID()
  ticketId: string;

  @IsString()
  @IsNotEmpty()
  deviceId: string;

  @IsISO8601()
  scannedAt: string;
}

export class SyncBatchDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ScanDto)
  scans: ScanDto[];
}

export interface SyncResult {
  ticketId: string;
  clientLogId: string;
  result: 'ACCEPTED' | 'DUPLICATE' | 'ALREADY_SYNCED';
}
