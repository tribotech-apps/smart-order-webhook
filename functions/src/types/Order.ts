import { Timestamp } from "firebase/firestore";
import { DeliveryMan, QuestionType } from "./Store";
import { Address } from "./User";

export interface OrderWorkflow { flowId: number, minutes: number }

export type PaymentMethodType = 'PIX' | 'CREDIT_CARD' | 'DELIVERY';

export type OrderAlertStatus = 'green' | 'yellow' | 'red';

export interface FlowTimestamps {
  warningTime: Timestamp;    // Horário exato do alerta amarelo
  overdueTime: Timestamp;    // Horário exato do alerta vermelho
}

export interface OrderType {
  _id?: string;
  id: string;
  uid?: string;
  deliveryOption: 'COUNTER' | 'DELIVERY';
  address?: Address;
  analytics?: [{ minutes: number; flowId: string }]
  currentFlow: { hour: Timestamp; flowId: number; }
  customerName: string;
  deliveryPrice: number;
  createdAt: Timestamp;
  items: OrderItemType[],
  paymentMethod?: PaymentMethodType,
  phoneNumber?: string,
  storeId: string,
  total: number,
  workflow?: [OrderWorkflow]
  printed: boolean;
  batchNumber?: number;
  deliveryMan?: DeliveryMan;
  paymentId?: string;
  alertStatus?: OrderAlertStatus;
  flowTimestamps?: { [flowId: string]: FlowTimestamps };
}

export interface OrderItemType {
  id: number;
  menuId: number;
  menuName: string;
  menuImage?: string;
  menuImageUrl?: string;
  comments?: string;
  price: number;
  quantity: number;
  questions?: OrderItemQuestion[];
}

export interface OrderItemQuestion {
  orderItemId: number;
  questionId: number,
  questionName: string,
  questionType: QuestionType,
  minAnswerRequired?: number,
  maxAnswerRequired?: number,
  showQuantity?: boolean
  answers?: OrderItemAnswer[]
}


export interface OrderItemAnswer {
  answerId: number;
  answerName: string;
  quantity?: number;
  price?: number;
}

export type OrderStatus = 'ON_TIME' | 'WARNING' | 'LATE' | 'CANCELED';

export enum OrderFlow {
  QUEUE = 1,
  PREPARATION = 2,
  DELIVERY_ROUTE = 3,
  DELIVERED = 4,
  CANCELED = 5
}

export interface ShoppingCartType extends OrderType { }
