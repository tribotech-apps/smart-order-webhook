import { Timestamp } from "firebase/firestore";
import { Address } from "./User";
import { SelectedAnswer } from "./Conversation";

export interface OpeningException {
  day: Timestamp;
  openAt: HourMinute;
  closeAt: HourMinute;
}

export interface HourMinute {
  hour: number;
  minute: number;
}

export interface OpeningHours {
  day: number;
  openAt: HourMinute;
  closeAt: HourMinute;
}

export interface CurrentStore {
  store: Store;
  day: number;
  openAt?: Date;
  closeAt?: Date;
}

export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface MenuItem {
  menuId: number;
  menuName: string;
  menuImage?: string;
  menuImageUrl?: string;
  menuImageWABAId?: string;
  menuDescription: string;
  categoryId: number;
  servingNumber?: number;
  price: number;
  questions: MenuItemQuestion[];
  allDays: boolean;
  weekdays?: Weekday[];
  maxQuantity?: number;
  minQuantity?: number;
  singleProduct?: boolean;
}

export type QuestionType = 'RADIO' | 'CHECK' | 'QUANTITY';

export interface MenuItemAnswer {
  answerId: number;
  answerName: string;
  price?: number;
  quantity?: number;
}

export interface MenuItemQuestion {
  questionId: number;
  questionName: string;
  questionType: QuestionType;
  minAnswerRequired: number;
  maxAnswerRequired: number;
  answers?: MenuItemAnswer[];
  price?: number;
}

export interface DeliveryMan {
  id: number;
  name: string;
  phoneNumber: string;
}

export interface CancelHistory {
  month: number;
  year: number;
  quantity: number;
  amount: number;
}

export interface WABAEnvironments {
  wabaAccessToken: string;
  wabaPhoneNumber: string;
  wabaPhoneNumberId: string;
  wabaBusinessAccountId: string;
}

export interface Store {
  _id: string;
  code: string;
  cnpj: string;
  address: Address;
  deliveryMaxRadiusKm: number;
  deliveryPrice: number;

  rowTime: number;
  deliveryTime: number;
  productionTime: number;

  deliveryMan: DeliveryMan[];
  openAt: HourMinute;
  closeAt: HourMinute;
  closingDays?: number[];
  description: string;
  logo: string;
  logoUid: string;
  logoWABAId?: string;
  name: string;
  openingVariations?: OpeningHours[];
  openingException?: OpeningException;
  closed?: Timestamp;
  opened?: Timestamp;
  categories: StoreCategory[];
  menu: MenuItem[];
  workflow?: Storeworkflow[];
  historyByMenu?: SalesHistory[];
  historyByOrder?: HistoryByMonth[];
  historyByCanceling?: HistoryByMonth[];
  slug: string;
  salesHistory?: SalesHistory[];
  cancelHistory?: CancelHistory[];
  whatsappNumber?: string;
  wabaEnvironments?: WABAEnvironments;
  singleProduct?: boolean;
  singleProductText?: string;
  flowId?: number;
}

export interface StoreCategory {
  categoryId: number;
  categoryName: string;
}

export interface Storeworkflow {
  flowId: number;
  count: number;
  minutes: number;
}

export interface SalesHistory {
  menuId: number;
  menuName: string;
  month: number;
  year: number;
  quantity: number;
  amount: number;
}

export interface HistoryByMonth {
  month: number;
  year: number;
  quantity: number;
  amount: number;
}

export type StoreStatus = 'ABERTA' | 'FECHADA';


export interface ShoppingCartItem extends MenuItem {
  id: string;
  quantity: number;
  selectedAnswers?: SelectedAnswer[]
}

export interface ShoppingCartItemShort {
  id: string;
  menuId: number;
  menuName: string;
  quantity: number;
  optionals?: string;
}