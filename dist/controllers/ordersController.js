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
exports.getUserPendingOrders = void 0;
const firebase_1 = __importDefault(require("../firebase"));
const firestore_1 = require("firebase/firestore");
const db = (0, firestore_1.getFirestore)(firebase_1.default);
const getUserPendingOrders = (_a) => __awaiter(void 0, [_a], void 0, function* ({ uid }) {
    try {
        const ordersRef = (0, firestore_1.collection)(db, "Orders");
        const ordersQuery = (0, firestore_1.query)(ordersRef, (0, firestore_1.where)("uid", "==", uid));
        const querySnapshot = yield (0, firestore_1.getDocs)(ordersQuery);
        if (!querySnapshot || !querySnapshot.size) {
            return [];
        }
        const response = [];
        querySnapshot.forEach((doc) => {
            const orderData = doc.data();
            if (orderData.currentFlow.flowId < 4)
                response.push(Object.assign({}, orderData));
        });
        return response;
    }
    catch (error) {
        // TODO: handle
        return [];
    }
});
exports.getUserPendingOrders = getUserPendingOrders;
