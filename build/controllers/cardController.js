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
const cardService_1 = __importDefault(require("../services/cardService"));
const cardController = {
    getCard: (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        const { card_id } = req.params; // Changed from req.body to req.params
        try {
            const card = yield cardService_1.default.getCard(card_id);
            res.status(200).send(card); // Directly send the card object
        }
        catch (error) {
            if (error.message.includes("doesn't exist")) {
                res.status(404).json({ message: error.message });
            }
            else {
                res.status(400).json({ message: error.message });
            }
        }
    })
};
exports.default = cardController;
