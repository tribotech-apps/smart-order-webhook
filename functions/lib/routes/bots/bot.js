"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const botController_1 = require("../../controllers/botController");
const router = (0, express_1.Router)();
// Iniciar fluxo de vendas
router.post('/start', botController_1.startPurchaseFlow);
exports.default = router;
