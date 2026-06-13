import { Module } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { PrismaService } from "../prisma.service";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { JwtStrategy } from "./jwt.strategy"; // thêm

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: "SUPER_SECRET_KEY_CHOOSE_YOUR_OWN",
      signOptions: { expiresIn: "1d" },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, PrismaService, JwtStrategy], // thêm JwtStrategy
})
export class AuthModule {}
