"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const cardController_1 = __importDefault(require("../controllers/cardController"));
const router = (0, express_1.Router)();
router.get('/:id', cardController_1.default.getCard);
exports.default = router;
