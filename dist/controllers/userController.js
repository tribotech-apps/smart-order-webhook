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
exports.getStore = exports.getUserByPhone = void 0;
exports.getStoreStatus = getStoreStatus;
const firebase_1 = __importDefault(require("../firebase"));
const firestore_1 = require("firebase/firestore");
const db = (0, firestore_1.getFirestore)(firebase_1.default);
const getUserByPhone = (_a) => __awaiter(void 0, [_a], void 0, function* ({ phone }) {
    try {
        if (!(phone === null || phone === void 0 ? void 0 : phone.trim())) {
            return undefined;
        }
        const usersRef = (0, firestore_1.collection)(db, "Users");
        const usersQuery = (0, firestore_1.query)(usersRef, (0, firestore_1.where)("phone", "==", phone));
        const querySnapshot = yield (0, firestore_1.getDocs)(usersQuery);
        if (!querySnapshot || !querySnapshot.size) {
            return undefined;
        }
        const appUser = querySnapshot.docs[0].data();
        return Object.assign({}, appUser);
    }
    catch (error) {
        // TODO: handle
        return undefined;
    }
});
exports.getUserByPhone = getUserByPhone;
function getStatusByHour(openAt, closeAt) {
    const today = new Date();
    const currentHour = today.getHours();
    const currentMinute = today.getMinutes();
    // console.log(currentHour, currentMinute)
    // console.log(openAt)
    // console.log(closeAt)
    // Current hour between open and close hours
    if (openAt.hour < currentHour && closeAt.hour > currentHour)
        return 'ABERTA';
    // Current hour later than close hours
    if (currentHour > closeAt.hour)
        return 'FECHADA';
    // Current hour earlier than close hours
    if (currentHour < openAt.hour)
        return 'FECHADA';
    // Current hour same as open and close hours
    if (currentHour === openAt.hour && currentHour === closeAt.hour)
        return currentMinute >= openAt.minute && currentMinute <= closeAt.minute ? 'ABERTA' : 'FECHADA';
    // Current hour equal only to open hour
    if (currentHour === openAt.hour)
        return currentMinute >= openAt.minute ? 'ABERTA' : 'FECHADA';
    // Current hour equal only to close hour
    if (currentHour === closeAt.hour)
        return currentMinute < closeAt.minute ? 'ABERTA' : 'FECHADA';
    // TODO: analytics
    return 'FECHADA';
}
function getStoreStatus(storeDb) {
    if (!storeDb) {
        return 'FECHADA';
    }
    const { closed, opened, closingDays, openingVariations, openAt, closeAt } = storeDb;
    const today = new Date();
    const day = today.getDay();
    const variation = openingVariations === null || openingVariations === void 0 ? void 0 : openingVariations.find(e => e.day === day);
    const openedDate = opened === null || opened === void 0 ? void 0 : opened.toDate();
    const closedDate = closed === null || closed === void 0 ? void 0 : closed.toDate();
    // const openingExceptionDate = openingException?.day.toDate();
    // ------ Checking by Day of the Week ------
    openedDate === null || openedDate === void 0 ? void 0 : openedDate.setHours(0, 0, 0, 0);
    closedDate === null || closedDate === void 0 ? void 0 : closedDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    // openingExceptionDate?.setHours(0, 0, 0, 0);
    // Closed Dates Check
    if ((closedDate === null || closedDate === void 0 ? void 0 : closedDate.getDate()) === today.getDate())
        return 'FECHADA';
    if ((openedDate === null || openedDate === void 0 ? void 0 : openedDate.getDate()) === today.getDate())
        return 'ABERTA';
    // console.log('3.....')
    // Opening Exceptions Check
    // if (openingException && openingExceptionDate === today) {
    //   const openingdates = { hour: openingException.openAt.hour, minute: openingException.openAt.minute };
    //   const closingdates = { hour: openingException.closeAt.hour, minute: openingException.closeAt.minute }
    //   // console.log('1......')
    //   const exceptionStatus = getStatusByHour(openingdates, closingdates);
    //   // console.log('4.....', openingException, openingdates, closingdates)
    //   return exceptionStatus;
    //   // if (exceptionStatus === 'FECHADA') return 'FECHADA';
    // }
    // console.log('5.....')
    // Closing Days Check
    if (closingDays === null || closingDays === void 0 ? void 0 : closingDays.includes(day))
        return 'FECHADA';
    // console.log('6.....')
    // Variations Check
    if (variation) {
        // console.log('7......', variation)
        return getStatusByHour(variation.openAt, variation.closeAt);
    }
    // ------ Checking by Hour ------
    // console.log('4......', openAt)
    // console.log('8.....', openAt, closeAt)
    return getStatusByHour(openAt, closeAt);
}
const getStore = (slug) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const usersRef = (0, firestore_1.collection)(db, "Stores");
        const storeQuery = (0, firestore_1.query)(usersRef, (0, firestore_1.where)("slug", "==", slug));
        const querySnapshot = yield (0, firestore_1.getDocs)(storeQuery);
        if (!querySnapshot || !querySnapshot.size) {
            return undefined;
        }
        const store = querySnapshot.docs[0].data();
        return store;
    }
    catch (error) {
        // TODO: handle
        return undefined;
    }
});
exports.getStore = getStore;
