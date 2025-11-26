import { OrderItemType } from "./Order";

/* eslint-disable @typescript-eslint/no-explicit-any */
export declare interface UserInfo {
  /**
   * The display name of the user.
   */
  readonly displayName: string | null;
  /**
   * The email of the user.
   */
  readonly email: string | null;
  /**
   * The phone number normalized based on the E.164 standard (e.g. +16505550101) for the
   * user.
   *
   * @remarks
   * This is null if the user has no phone credential linked to the account.
   */
  readonly phoneNumber: string | null;
  /**
   * The profile photo URL of the user.
   */
  readonly photoURL: string | null;
  /**
   * The provider used to authenticate the user.
   */
  readonly providerId: string;
  /**
   * The user's unique ID, scoped to the project.
   */
  readonly uid: string;
}

export declare interface User extends UserInfo {
  readonly emailVerified: boolean;
  readonly isAnonymous: boolean;
  readonly metadata: any;
  readonly providerData: UserInfo[];
  readonly refreshToken: string;
  readonly tenantId: string | null;
  delete(): Promise<void>;
  getIdToken(forceRefresh?: boolean): Promise<string>;
  getIdTokenResult(forceRefresh?: boolean): Promise<any>;
  reload(): Promise<void>;
  toJSON(): object;
}

export interface Purchases {
  menuId: number;
  menuName: string;
  quantity: number;
}


export interface UserItemsPurchased {
  storeId: string,
  itemsPurchased: ItemPurchased[];
}

export interface UserLastPurchase {
  storeId: string,
  itemsPurchased: OrderItemType[];
}

export interface ItemPurchased {
  menuId: number,
  menuName: string,
  menuImage?: string,
}

export interface AppUser {
  user?: User;
  name: string;
  roleId: number;
  roleName: string;
  storeId?: string;
  phone?: string;
  address?: Address;
  email?: string;
  itemsPurchased?: UserItemsPurchased[];
  lastPurchase?: UserLastPurchase[];
  uid?: string;
}


export interface Address {
  name: string;
  placeId?: string;
  lat?: number;
  lng?: number;
  main: boolean;
  city?: string;
  state?: string;
  street: string; // Rua
  number: string; // Número
  neighborhood: string; // Bairro
  zipCode: string; // CEP
  complement?: string; // Complemento (opcional)
}

// -22.9746788