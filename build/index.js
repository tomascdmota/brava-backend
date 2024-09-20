"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const authRoutes_1 = __importDefault(require("./routes/authRoutes")); // Updated import for TypeScript
const cardRoutes_1 = __importDefault(require("./routes/cardRoutes"));
dotenv_1.default.config();
const app = (0, express_1.default)();
app.use((0, cookie_parser_1.default)());
app.use(express_1.default.json());
const allowedOrigins = [
    'http://localhost:3000',
    'http://192.168.1.155:3000',
    'http://18.133.155.66:3000',
    'https://18.133.155.66:3000',
    'https://app.bravanfc.com',
    'https://brava-bucket.s3.eu-west-2.amazonaws.com',
];
app.use((0, cors_1.default)({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        }
        else {
            callback(new Error('Not allowed by CORS'));
            console.log(origin);
        }
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
    optionsSuccessStatus: 204,
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use('/api/auth', authRoutes_1.default);
app.use('/api/card', cardRoutes_1.default);
const PORT = process.env.PORT || 4001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
