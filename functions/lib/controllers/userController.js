"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateUserAddress = exports.ensureUserExists = exports.createUser = exports.getUser = exports.getUserByPhone = void 0;
const firebase_1 = __importDefault(require("../firebase"));
const firestore_1 = require("firebase/firestore");
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const messagingService_1 = require("../services/messagingService");
const db = (0, firestore_1.getFirestore)(firebase_1.default);
const getUserByPhone = async (phone) => {
    console.log('getUserByPhone ------>', phone);
    try {
        if (!phone?.trim()) {
            return undefined;
        }
        // Verificar se o número de telefone nao contém o símbolo '+', adicionando-o se necessário
        if (!phone.startsWith('+')) {
            console.log(`Número de telefone ajustado para incluir '+': ${phone}`);
            phone = `+${phone}`;
        }
        const usersRef = (0, firestore_1.collection)(db, "Users");
        const usersQuery = (0, firestore_1.query)(usersRef, (0, firestore_1.where)("phone", "==", phone));
        const querySnapshot = await (0, firestore_1.getDocs)(usersQuery);
        if (!querySnapshot || !querySnapshot.size) {
            return undefined;
        }
        const appUser = querySnapshot.docs[0].data();
        return { ...appUser };
    }
    catch (error) {
        // TODO: handle
        return undefined;
    }
};
exports.getUserByPhone = getUserByPhone;
/**
 * Verifica se o usuário existe na tabela Users do Firestore.
 * @param phone Número de telefone do usuário.
 * @returns O usuário encontrado ou `undefined` se não existir.
 */
const getUser = async (phone) => {
    console.log('getUser ------>', phone);
    try {
        if (!phone?.trim()) {
            return undefined;
        }
        // Verificar se o número de telefone nao contém o símbolo '+', adicionando-o se necessário
        if (!phone.startsWith('+')) {
            console.log(`Número de telefone ajustado para incluir '+': ${phone}`);
            phone = `+${phone}`;
        }
        // Buscar o usuário na tabela Users do Firestore
        const usersRef = (0, firestore_1.collection)(db, 'Users');
        const usersQuery = (0, firestore_1.query)(usersRef, (0, firestore_1.where)('phone', '==', phone));
        const querySnapshot = await (0, firestore_1.getDocs)(usersQuery);
        if (!querySnapshot || !querySnapshot.size) {
            return undefined;
        }
        const appUser = querySnapshot.docs[0].data();
        return { ...appUser };
    }
    catch (error) {
        (0, messagingService_1.notifyAdmin)('Erro ao buscar usuário:', error);
        return undefined;
    }
};
exports.getUser = getUser;
/**
 * Cria um novo usuário no Firebase Authentication e na tabela Users do Firestore.
 * @param name Nome do usuário.
 * @param phone Número de telefone do usuário.
 * @param address Endereço do usuário.
 */
const createUser = async (name, phone, address) => {
    try {
        console.log('Criando novo usuário...', {
            phoneNumber: phone,
            displayName: name,
        });
        // Criar o usuário no Firebase Authentication com o provedor Phone
        const firebaseUser = await firebase_admin_1.default.auth().createUser({
            phoneNumber: phone,
            displayName: name,
        });
        console.log('Usuário criado no Firebase Authentication:', firebaseUser.uid);
        // Criar o usuário na tabela Users do Firestore
        const newUser = {
            name,
            roleId: 3, // Customer role
            roleName: 'Customer',
            phone,
            address,
            uid: firebaseUser.uid,
        };
        const usersRef = (0, firestore_1.collection)(db, 'Users');
        const docRef = await (0, firestore_1.addDoc)(usersRef, newUser);
        console.log('Documento criado com ID:', docRef.id);
        console.log('Usuário criado na tabela Users do Firestore:', newUser);
    }
    catch (error) {
        (0, messagingService_1.notifyAdmin)('Erro ao criar usuário:', error.message);
        throw new Error('Erro ao criar usuário.');
    }
};
exports.createUser = createUser;
/**
 * Garante que o usuário exista na tabela Users do Firestore.
 * Se o usuário não existir, ele será criado no Firebase Authentication e na tabela Users.
 * @param name Nome do usuário.
 * @param phone Número de telefone do usuário.
 * @param address Endereço do usuário.
 */
const ensureUserExists = async (name, phoneNumber, address, storeId) => {
    try {
        const usersRef = (0, firestore_1.collection)(db, 'Users');
        const userQuery = (0, firestore_1.query)(usersRef, (0, firestore_1.where)('phone', '==', phoneNumber));
        const userSnapshot = await (0, firestore_1.getDocs)(userQuery);
        console.log('*********************phoneNumber********************', phoneNumber);
        console.log('*********************userSnapshot.empty********************', userSnapshot, userSnapshot.empty);
        if (!userSnapshot.empty) {
            console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
            const userDoc = userSnapshot.docs[0];
            console.log('Usuário encontrado:', userDoc.id);
            return userDoc.id; // Retorna o UID do usuário
        }
        // Criar novo usuário se não existir
        const newUser = {
            name,
            phone: phoneNumber,
            address,
            createdAt: firestore_1.Timestamp.now(),
            storeId
        };
        const newUserRef = await (0, firestore_1.addDoc)(usersRef, newUser);
        console.log('Novo usuário criado:', newUserRef.id);
        return newUserRef.id; // Retorna o UID do novo usuário
    }
    catch (error) {
        (0, messagingService_1.notifyAdmin)('Erro ao garantir que o usuário existe:', error);
        throw new Error('Erro ao garantir que o usuário existe.');
    }
};
exports.ensureUserExists = ensureUserExists;
/**
 * Atualiza o endereço de um usuário na tabela Users do Firestore.
 * @param phone Número de telefone do usuário.
 * @param address Novo endereço do usuário.
 */
const updateUserAddress = async (phone, address) => {
    try {
        if (!phone?.trim()) {
            console.log('Telefone não fornecido para atualizar endereço');
            return;
        }
        // Verificar se o número de telefone não contém o símbolo '+', adicionando-o se necessário
        if (!phone.startsWith('+')) {
            phone = `+${phone}`;
        }
        const usersRef = (0, firestore_1.collection)(db, 'Users');
        const userQuery = (0, firestore_1.query)(usersRef, (0, firestore_1.where)('phone', '==', phone));
        const userSnapshot = await (0, firestore_1.getDocs)(userQuery);
        if (userSnapshot.empty) {
            console.log('Usuário não encontrado para atualizar endereço:', phone);
            return;
        }
        const userDoc = userSnapshot.docs[0];
        const userDocRef = (0, firestore_1.doc)(db, 'Users', userDoc.id);
        await (0, firestore_1.updateDoc)(userDocRef, {
            address: address
        });
        console.log('Endereço do usuário atualizado com sucesso:', phone);
    }
    catch (error) {
        (0, messagingService_1.notifyAdmin)('Erro ao atualizar endereço do usuário:', error);
        console.error('Erro ao atualizar endereço do usuário:', error);
    }
};
exports.updateUserAddress = updateUserAddress;
