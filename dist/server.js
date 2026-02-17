"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = __importDefault(require("./app"));
const db_1 = require("./config/db");
const runMigrations_1 = require("./migrations/runMigrations");
const PORT = process.env.PORT || 5000;
(async () => {
    try {
        await (0, db_1.testConnection)();
        console.log('Connected to MySQL');
        await (0, runMigrations_1.runMigrations)({ alter: true });
        console.log('Migrations completed');
        app_1.default.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    }
    catch (err) {
        console.error('Failed to connect to DB:', err);
        process.exit(1);
    }
})();
