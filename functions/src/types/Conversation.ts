import { Address } from "./User";
import { MenuItem, MenuItemQuestion, ShoppingCartItem, Store, StoreCategory } from "./Store";

export type ConversationFlow =
  "WELCOME" |
  "DELIVERY_TYPE" |
  "CHECK_ADDRESS" |
  "ADDRESS_CONFIRMATION" |
  "NEW_ADDRESS" |
  "CATEGORIES" |
  "PRODUCTS" |
  "PRODUCT_QUANTITY" |
  "PRODUCT_QUESTIONS" |
  "ORDER_SUMMARY" |
  "CATALOG" |
  'CONTACT' |
  'EDIT_CART' |
  'ORDER_COMPLETED' |
  'COLLECT_CUSTOMER_NAME' |
  'EDIT_CART_ITEM' |
  'EDIT_CART_ACTION' |
  'COLLECT_CUSTOMER_CPF' |
  'WAITING_DELETE_CONFIRMATION' |
  'EDIT_ITEM_QUANTITY' |
  'COLLECT_CUSTOM_QUANTITY' |
  'MULTIPLE_CHOICE' |
  'CONFIRM_ANSWER' |
  'CHECKBOX_QUESTION' |
  'SELECT_PAYMENT_METHOD' |
  'WAITING_PAYMENT_CONFIRMATION' |
  'QUESTIONS_COMPLETED' |
  'EDIT_OR_REMOVE_SELECTION' |
  'FLOW_STARTED' |
  'COLLECT_PRODUCT_LIST_ITEM' |
  'PRODUCT_SELECTION' |
  'CATEGORY_SELECTION';

export type ConversationStage = 
  'Normal' | 
  'Informando Endereco' | 
  'Validando Resultados' | 
  'Endereco Confirmado';

export interface Conversation {
  docId?: string;
  flowToken?: string;
  date: Date;
  phoneNumber: string;
  flow: ConversationFlow;
  conversationStage?: ConversationStage;
  deliveryOption?: 'delivery' | 'counter'; // Tipo de entrega: delivery ou retirada no balcão
  address?: Address;
  category?: StoreCategory;
  products?: ShoppingCartItem[];
  product?: ShoppingCartItem;
  store?: Store;
  currentPage?: number;
  productId?: number;
  quantity?: number;
  currentQuestionIndex?: number;
  totalPrice?: number;
  questions?: MenuItemQuestion[];
  isLocked?: boolean;
  cartItems?: ShoppingCartItem[];
  paymentStatus?: string;
  previousFlow?: string; // Campo para armazenar o fluxo anterior
  previousScreen?: string; // Campo para armazenar o fluxo anterior
  productBeingAnswered?: string;
  selectedItemIndex?: number;
  selectedAnswers: string[]; // Armazena as respostas selecionadas para perguntas de múltipla escolha
  deliveryPrice?: number;
  customerName?: string; // Nome do cliente
  customerDocument?: string; // CPF do cliente
  currentQuestionId?: number; // Índice da pergunta atual
  currentAnswerIndex?: number; // Índice do item selecionado
  currentAnswerId?: number; // ID da resposta atual
  paymentDetails?: string; // Detalhes do pagamento
  paymentMethod?: 'PIX' | 'CREDIT_CARD' | 'DELIVERY'; // Método de pagamento selecionado
  message?: string;
  history?: string;
  historyAction?: string;
  historyItems?: any[];
}