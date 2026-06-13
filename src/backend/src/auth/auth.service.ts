import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Role } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async register(body: any) {
    const { email, password, role } = body;

    // check if user is existed
    const userExists = await this.prisma.user.findUnique({ where: { email } });
    if (userExists) {
      throw new BadRequestException('This email is existed!');
    }

    // hash raw password
    const salt = await bcrypt.genSalt();
    const passwordHash = await bcrypt.hash(password, salt);

    // create new user
    const newUser = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        role: role || Role.AUDIENCE,
      },
    });

    return {
      id: newUser.id,
      email: newUser.email,
      role: newUser.role,
    };
  }

  async login(body: any) {
    const { email, password } = body;

    // find user by email
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('Email or password is incorrect!');
    }

    // check if password is correct
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Email or password is incorrect!');
    }

    // sign in and create jwt token
    const payload = { sub: user.id, email: user.email, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }
}
