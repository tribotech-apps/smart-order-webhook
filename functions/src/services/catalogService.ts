import { updateConversation } from '../controllers/conversationController';
import { Conversation } from '../types/Conversation';
import { MenuItem, ShoppingCartItem, StoreCategory, WABAEnvironments, Weekday } from '../types/Store';
import { uploadImageToWABA } from './imageService';
import { delay, notifyAdmin, sendMessage } from './messagingService';


export async function sendCategoriesMessage(to: string, categories: StoreCategory[], menu: MenuItem[], wabaEnvironments: WABAEnvironments, currentConversation: Conversation) {
  const today = new Date().getDay() + 1; // Dias da semana no formato 1 (domingo) a 7 (sábado)

  // Filtrar categorias que possuem produtos disponíveis hoje
  const filteredCategories = categories.filter((category) => {
    const productsInCategory = menu.filter((product) => {
      if (product.categoryId !== category.categoryId) return false;

      // Verificar se o produto está disponível todos os dias ou no dia atual
      if (!product.allDays && product.weekdays && !product.weekdays.includes(today as Weekday)) {
        return false;
      }

      return true;
    });

    // console.log(`Produtos disponíveis na categoria "${category.categoryName}":`, productsInCategory);
    return productsInCategory.length > 0; // Retorna apenas categorias com produtos disponíveis
  });

  // console.log('Categorias filtradas:', filteredCategories);

  // Verificar se há categorias disponíveis
  if (filteredCategories.length === 0) {
    await sendMessage({
      messaging_product: 'whatsapp',
      to: "+" + to,
      type: 'text',
      text: {
        body: 'Desculpe, não há categorias disponíveis no momento.',
      },
    }, wabaEnvironments);
    return;
  }

  // Criar a lista de categorias para enviar
  const categoryRows = filteredCategories.map((category) => ({
    id: category.categoryId.toString(),
    title: category.categoryName.slice(0, 20) || '', // Limitar o título a 20 caracteres
  }));

  // Enviar a lista de categorias

  // Criar o texto do corpo da mensagem


  // caso ja exista item no carrinho, devemos acrescentar o texto 'A qualquer momento você pode: 
  // - Ver o menu de categorias - digite 'menu'  
  // - Finalizar a compra - digite 'comta'
  const bodyText = `Selecione uma categoria para ver os produtos disponíveis. '\n\nA qualquer momento você pode: \n- Digitar "conta" para receber o resumo e finalizar o pedido.`;

  // Atualizar o fluxo da conversa para "CATEGORIES"
  await updateConversation(currentConversation, {
    flow: 'CATEGORIES',
  });

  await sendMessage({
    messaging_product: 'whatsapp',
    to: "+" + to,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: {
        type: 'text',
        text: 'Selecionar Categorias',
      },
      body: {
        text: bodyText,
      },
      action: {
        button: 'Selecionar',
        sections: [
          {
            title: 'Categorias',
            rows: categoryRows,
          },
        ],
      },
    },
  }, wabaEnvironments);
}

export async function sendProductCard(to: string, product: MenuItem | ShoppingCartItem, wabaEnvironments: WABAEnvironments) {
  const bodyText = `${product.menuDescription}\n\nPreço: R$ ${product.price.toFixed(2)}`;

  try {
    // Verificar se o campo menuImageWABAId é válido
    if (!product.menuImageWABAId) {
      console.log(`O campo menuImageWABAId está ausente ou inválido para o produto: ${product.menuName}. Tentando fazer upload da imagem...`);

      try {
        // Tentar fazer o upload da imagem para o WABA
        if (product.menuImageUrl) {
          const uploadResponse = await uploadImageToWABA(product.menuImageUrl, wabaEnvironments);
          product.menuImageWABAId = uploadResponse.id; // Atualizar o campo com o ID retornado
          console.log(`Imagem do produto "${product.menuName}" enviada com sucesso. ID: ${product.menuImageWABAId}`);
        } else {
          console.warn(`URL da imagem ausente para o produto: ${product.menuName}. Prosseguindo sem imagem.`);
        }
      } catch (uploadError: any) {
        console.warn(`Erro ao fazer upload da imagem para o produto: ${product.menuName}. Prosseguindo sem imagem.`);
      }
    }

    // Enviar o card do produto
    await sendMessage({
      messaging_product: 'whatsapp',
      to: "+" + to,
      type: 'interactive',
      interactive: {
        type: 'button',
        header: product.menuImageWABAId
          ? {
            type: 'image',
            image: {
              id: product.menuImageWABAId, // ID da imagem no WABA
            },
          }
          : undefined, // Se não houver imagem, o header será omitido
        body: {
          text: bodyText, // Descrição do produto e preço
        },
        footer: {
          text: 'Clique em Comprar para adicionar ao carrinho:', // Rodapé ajustado para múltiplas opções
        },
        action: {
          buttons: [
            {
              type: 'reply',
              reply: {
                id: `product_${product.menuId}`, // ID único do produto
                title: 'Comprar', // Nome do botão
              },
            },
          ],
        },
      },
    }, wabaEnvironments);

    console.log(`Mensagem enviada com sucesso para ${to} com o produto ${product.menuName}`);
  } catch (error: any) {
    if (error.response?.data?.error?.code === 131056) {
      console.warn('Rate limit atingido. Tentando novamente após 1 segundo...');
      await delay(1000); // Aguardar 1 segundo antes de tentar novamente
      return sendProductCard(to, product, wabaEnvironments); // Tentar novamente
    }

    notifyAdmin('Erro ao enviar o card do produto:', error.response?.data || error.message);
    throw new Error('Erro ao enviar o card do produto.');
  }
}

export async function sendProductsWithPagination(
  to: string,
  products: MenuItem[],
  currentPage: number = 1,
  wabaEnvironments: WABAEnvironments
) {
  const itemsPerPage = 5; // Número de produtos por página
  const totalPages = Math.ceil(products.length / itemsPerPage);

  // Garantir que a página atual esteja dentro dos limites
  if (currentPage < 1) currentPage = 1;
  if (currentPage > totalPages) currentPage = totalPages;

  // Calcular os índices de início e fim para os produtos da página atual
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const productsOnPage = products.slice(startIndex, endIndex);

  // console.log(`Enviando produtos de ${startIndex + 1} a ${Math.min(endIndex, products.length)}`);

  // Enviar os produtos da página atual com atraso
  for (const product of productsOnPage) {
    try {
      await sendProductCard(to, product, wabaEnvironments);
      // verficar se for o ultimo item,nao enviar a mensagem
      await delay(300);

      if (product !== productsOnPage[productsOnPage.length - 1]) {
        await sendMessage({
          messaging_product: 'whatsapp',
          to: "+" + to,
          type: 'text',
          text: {
            body: 'Enviando o próximo produto...\n',
          },
        }, wabaEnvironments);

        await delay(500); // Adicionar um atraso de 500ms entre cada mensagem
      }
    } catch (error: any) {
      notifyAdmin('Erro:', error.response?.data || error.message);
      throw error;
    }
  }

  await delay(1000); // Atraso de 1 segundo

  const message = startIndex + 1 !== Math.min(endIndex, products.length) ?
    `Exibindo ${startIndex + 1}-${Math.min(endIndex, products.length)} de ${products.length} produtos.` :
    'Não há mais produtos para exibir nesta categoria.';

  // Criar botões de navegação
  const buttons = [];

  if (currentPage < totalPages) {
    buttons.push({
      type: 'reply',
      reply: {
        id: `more_${currentPage + 1}`, // Próxima página
        title: 'Ver mais produtos',
      },
    });
  }

  buttons.push({
    type: 'reply',
    reply: {
      id: 'change_category', // Trocar de categoria
      title: 'Trocar categoria',
    },
  });


  // Enviar os botões de navegação
  await sendMessage({
    messaging_product: 'whatsapp',
    to: "+" + to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: {
        text: message,
      },
      action: {
        buttons,
      },
    },
  }, wabaEnvironments);
}

export function getProductsByCategory(menu: MenuItem[], categoryId: number): ShoppingCartItem[] {
  const today = new Date().getDay() + 1; // Dias da semana no formato 1 (domingo) a 7 (sábado)

  return menu.filter((item) => {
    if (item.categoryId !== categoryId) return false;

    // Verificar se o produto é vendido todos os dias ou apenas em dias específicos
    if (!item.allDays && item.weekdays && !item.weekdays.includes(today as Weekday)) {
      return false;
    }

    return true;
  }) as ShoppingCartItem[];
}

export function getSingleProduct(menu: MenuItem[]): ShoppingCartItem[] {
  const today = new Date().getDay() + 1; // Dias da semana no formato 1 (domingo) a 7 (sábado)

  return menu.filter((item) => {
    if (!item.singleProduct) return false;

    // Verificar se o produto é vendido todos os dias ou apenas em dias específicos
    if (!item.allDays && item.weekdays && !item.weekdays.includes(today as Weekday)) {
      return false;
    }

    return true;
  }) as ShoppingCartItem[];
}

export function filterProductsByKeyword(products: MenuItem[], keyword: string): MenuItem[] {
  const lowerKeyword = keyword.toLowerCase();

  return products.filter((product) =>
    product.menuName.toLowerCase().includes(lowerKeyword) ||
    product.menuDescription.toLowerCase().includes(lowerKeyword)
  );
}






export async function sendProductsListWithPagination(
  to: string,
  products: MenuItem[],
  currentPage: number = 1,
  wabaEnvironments: WABAEnvironments,
  currentConversation: Conversation,
): Promise<void> {
  const itemsPerPage = 8; // Número de produtos por página
  const totalPages = Math.ceil(products.length / itemsPerPage);

  // Garantir que a página atual esteja dentro dos limites
  if (currentPage < 1) currentPage = 1;
  if (currentPage > totalPages) currentPage = totalPages;

  // Calcular os índices de início e fim para os produtos da página atual
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage - 2; // Reservar 2 itens para "Ver mais produtos" e "Trocar categoria"
  const productsOnPage = products.slice(startIndex, endIndex);

  // Criar os itens da lista interativa
  const rows = productsOnPage.map((product) => ({
    id: `product_${product.menuId}`, // ID único do produto
    title: product.menuName.slice(0, 20), // Limitar o título a 20 caracteres
    description: `${product.menuDescription.slice(0, 50)}\nPreço: R$ ${product.price.toFixed(2)}`, // Adicionar o preço na descrição
  }));

  // Adicionar o botão "Ver mais produtos" se houver mais páginas
  if (currentPage < totalPages) {
    rows.push({
      id: `more_${currentPage + 1}`, // Próxima página
      title: 'Ver mais produtos',
      description: 'Exibir mais produtos desta categoria.',
    });
  }

  // Adicionar o botão "Trocar categoria"
  rows.push({
    id: 'change_category', // Trocar de categoria
    title: 'Trocar categoria',
    description: 'Escolher outra categoria.',
  });

  // Criar o texto do corpo da mensagem
  const bodyText = `Lista de Produtos, favor selecione um produto na lista.\n\nA qualquer momento você pode:\n- Digitar "conta" para receber o resumo e finalizar o pedido.`;

  // Enviar a lista interativa
  await sendMessage({
    messaging_product: 'whatsapp',
    to: "+" + to,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: {
        type: 'text',
        text: 'Produtos Disponíveis',
      },
      body: {
        text: bodyText,
      },
      action: {
        button: 'Selecionar',
        sections: [
          {
            title: 'Produtos',
            rows,
          },
        ],
      },
    },
  }, wabaEnvironments);

  // Atualizar conversation.flow para COLLECT_PRODUCT_LIST_ITEM
  await updateConversation(currentConversation, { flow: 'COLLECT_PRODUCT_LIST_ITEM' });
}