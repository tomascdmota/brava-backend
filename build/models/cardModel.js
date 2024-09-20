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
const db_1 = __importDefault(require("../lib/db"));
const CardModel = {
    findCardById: (card_id) => __awaiter(void 0, void 0, void 0, function* () {
        const query = "SELECT * FROM cards WHERE card_id = ?";
        const [rows] = yield db_1.default.query(query, [card_id]);
        if (rows.length === 0) {
            return null;
        }
        return rows[0]; // This returns the first user or null if the card doesnt exist
    })
};
exports.default = CardModel;
