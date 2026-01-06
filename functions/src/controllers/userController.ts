import firebase from '../firebase';
import {
  getFirestore,
  collection,
  getDocs,
  query,
  where,
  addDoc,
  updateDoc,
  doc,
  Timestamp,
} from 'firebase/firestore';
import { Address, AppUser } from '../types/User';

import admin from 'firebase-admin';
import { notifyAdmin } from '../services/messagingService';
const db = getFirestore(firebase);

export const getUserByPhone = async (phone: string) => {
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


    const usersRef = collection(db, "Users")
    const usersQuery = query(usersRef, where("phone", "==", phone));

    const querySnapshot = await getDocs(usersQuery);

    if (!querySnapshot || !querySnapshot.size) {
      return undefined
    }

    const appUser = querySnapshot.docs[0].data() as AppUser;
    return { ...appUser };
  } catch (error) {
    // TODO: handle
    return undefined
  }
};

/**
 * Verifica se o usuário existe na tabela Users do Firestore.
 * @param phone Número de telefone do usuário.
 * @returns O usuário encontrado ou `undefined` se não existir.
 */
export const getUser = async (phone: string): Promise<AppUser | undefined> => {
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

    const usersRef = collection(db, 'Users');
    const usersQuery = query(usersRef, where('phone', '==', phone));
    const querySnapshot = await getDocs(usersQuery);

    if (!querySnapshot || !querySnapshot.size) {
      return undefined;
    }

    const appUser = querySnapshot.docs[0].data() as AppUser;
    return { ...appUser };
  } catch (error) {
    notifyAdmin('Erro ao buscar usuário:', error);
    return undefined;
  }
};

/**
 * Cria um novo usuário no Firebase Authentication e na tabela Users do Firestore.
 * @param name Nome do usuário.
 * @param phone Número de telefone do usuário.
 * @param address Endereço do usuário.
 */
export const createUser = async (name: string, phone: string, address?: Address): Promise<void> => {
  try {
    console.log('Criando novo usuário...', {
      phoneNumber: phone,
      displayName: name,
    });

    // Criar o usuário no Firebase Authentication com o provedor Phone
    const firebaseUser = await admin.auth().createUser({
      phoneNumber: phone,
      displayName: name,
    });

    console.log('Usuário criado no Firebase Authentication:', firebaseUser.uid);

    // Criar o usuário na tabela Users do Firestore
    const newUser: AppUser = {
      name,
      roleId: 3, // Customer role
      roleName: 'Customer',
      phone,
      address,
      uid: firebaseUser.uid,
    };

    const usersRef = collection(db, 'Users');
    const docRef = await addDoc(usersRef, newUser);

    console.log('Documento criado com ID:', docRef.id);
    console.log('Usuário criado na tabela Users do Firestore:', newUser);
  } catch (error: any) {
    notifyAdmin('Erro ao criar usuário:', error.message);
    throw new Error('Erro ao criar usuário.');
  }
};


/**
 * Garante que o usuário exista na tabela Users do Firestore.
 * Se o usuário não existir, ele será criado no Firebase Authentication e na tabela Users.
 * @param name Nome do usuário.
 * @param phone Número de telefone do usuário.
 * @param address Endereço do usuário.
 */
export const ensureUserExists = async (name: string, phoneNumber: string, address: Address, storeId: string): Promise<string> => {
  try {
    const usersRef = collection(db, 'Users');
    const userQuery = query(usersRef, where('phone', '==', phoneNumber));
    const userSnapshot = await getDocs(userQuery);

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
      createdAt: Timestamp.now(),
      storeId
    };

    const newUserRef = await addDoc(usersRef, newUser);
    console.log('Novo usuário criado:', newUserRef.id);
    return newUserRef.id; // Retorna o UID do novo usuário
  } catch (error) {
    notifyAdmin('Erro ao garantir que o usuário existe:', error);
    throw new Error('Erro ao garantir que o usuário existe.');
  }
};

/**
 * Atualiza o endereço de um usuário na tabela Users do Firestore.
 * @param phone Número de telefone do usuário.
 * @param address Novo endereço do usuário.
 */
export const updateUserAddress = async (phone: string, address: Address): Promise<void> => {
  try {
    if (!phone?.trim()) {
      console.log('Telefone não fornecido para atualizar endereço');
      return;
    }

    // Verificar se o número de telefone não contém o símbolo '+', adicionando-o se necessário
    if (!phone.startsWith('+')) {
      phone = `+${phone}`;
    }

    const usersRef = collection(db, 'Users');
    const userQuery = query(usersRef, where('phone', '==', phone));
    const userSnapshot = await getDocs(userQuery);

    if (userSnapshot.empty) {
      console.log('Usuário não encontrado para atualizar endereço:', phone);
      return;
    }

    const userDoc = userSnapshot.docs[0];
    const userDocRef = doc(db, 'Users', userDoc.id);

    await updateDoc(userDocRef, {
      address: address
    });

    console.log('Endereço do usuário atualizado com sucesso:', phone);
  } catch (error) {
    notifyAdmin('Erro ao atualizar endereço do usuário:', error);
    console.error('Erro ao atualizar endereço do usuário:', error);
  }
};