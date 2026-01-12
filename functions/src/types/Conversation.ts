import { Address } from "./User";
import { MenuItem, MenuItemQuestion, ShoppingCartItem, Store, StoreCategory } from "./Store";

export type ConversationFlow =
  "WELCOME" |
  "DELIVERY_TYPE" |
  "CHECK_ADDRESS" |
  "ADDRESS_CONFIRMATION" |
  "NEW_ADDRESS" |
  "NEIGHBORHOOD_DETECTION" |
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
  'CATEGORY_SELECTION' |
  'ORDER_REFINMENT' |
  'ORDER_REFINMENT_CONFIRMATION';

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
  product?: ShoppingCartItem | null;
  store?: Store;
  currentPage?: number;
  productId?: number;
  quantity?: number;
  currentQuestionIndex?: number | null;
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
  refinmentItems?: ExtractionResult
  lastMessage?: string;
  pendingAnswerConfirmation?: {
    questionIndex: number;
    selectedAnswer?: any; // mantém compatibilidade com código antigo
    selectedAnswers?: any[]; // nova funcionalidade para múltiplas respostas
  } | null;
  pendingProductsQueue?: ResolvedItem[]; // fila de produtos que ainda precisam ter perguntas respondidas
  currentProcessingProduct?: ResolvedItem | null; // produto atualmente sendo processado
  returnToPayment?: boolean;
  pendingAddress?: string | null; // endereço pendente de confirmação
  pendingAddressObj?: {
    street?: string;
    number?: string;
    neighborhood?: string;
    complement?: string;
  } | null
}

export interface ResolvedItem {
  menuId: number;
  menuName: string;
  quantity: number;
  palavra: string;
  price: number;
  selectedAnswers?: SelectedAnswer[];
}

export interface SelectedAnswer {
  questionId: number;
  answerId: number;
  answerName: string;
  quantity?: number;
}

export interface AmbiguousItems {
  menuId: number;
  menuName: string;
  price: number;
  refining?: boolean;
}

export interface AmbiguityGroup {
  id: string;                    // ID único para controle no bot
  palavra: string;               // O que o cliente disse (ex: "marmitas", "cocas")
  quantity: number;
  refining?: boolean;
  items: AmbiguousItems[];
}

export interface ExtractionResult {
  items: ResolvedItem[];
  ambiguidades: AmbiguityGroup[];
}
