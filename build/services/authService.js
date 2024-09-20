"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const User_1 = __importDefault(require("../models/User"));
const authService = {
    login: (username, password) => __awaiter(void 0, void 0, void 0, function* () {
        const user = yield User_1.default.findByUsername(username);
        if (!user) {
            throw new Error("A user with this username doesn't exist");
        }
        const isPasswordCorrect = bcrypt_1.default.compare(password, user.password);
        if (!isPasswordCorrect) {
            throw new Error("Password incorrect");
        }
        const access_token = jsonwebtoken_1.default.sign({ username: user.username, id: user.id }, process.env.JWT_SECRET, { expiresIn: '30d' });
        yield User_1.default.updateLastLogin(user.id);
        return {
            access_token,
            user: {
                id: user.id,
                username: user.username,
            },
        };
    }),
};
exports.default = authService;
