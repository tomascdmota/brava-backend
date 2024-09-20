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
const authService_1 = __importDefault(require("../services/authService"));
const authController = {
    login: (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        const { username, password } = req.body;
        try {
            const { access_token, user } = yield authService_1.default.login(username, password);
            res.cookie('session_token', access_token, {
                maxAge: 60 * 60 * 24 * 30 * 1000, // 30 days
                secure: process.env.NODE_ENV === 'production',
                httpOnly: true,
                sameSite: 'none',
            });
            res.status(200).send({
                access_token, user
            });
        }
        catch (error) {
            res.status(400).json({ message: error.message });
        }
    })
};
exports.default = authController;
