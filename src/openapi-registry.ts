import { OpenAPIRegistry, extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

// On ajoute les méthodes .openapi() à Zod
extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();


export const IdSchema = z.union([z.string(), z.number()]).openapi({
  description: 'Identifiant unique, peut être une chaîne ou un nombre',
  example: '12345',
});


export const ConversationKindSchema = z.enum(['direct', 'group']).openapi({
  description: 'Type de conversation, direct ou groupe',
  example: 'direct',
});

export const PresenceSchema = z.enum(['online', 'offline', 'away']).openapi({
  description: 'Présence de l’utilisateur, en ligne, hors ligne ou absent',
  example: 'online',
});

export const MessageDirectionSchema = z.enum(['incoming', 'outgoing']).openapi({
  description: 'Direction du message, entrant ou sortant',
  example: 'incoming',
});

export const CurrentUserDtoSchema = z.object({
  id: IdSchema,
  name: z.string().max(100).openapi({
    description: 'Nom complet de l’utilisateur actuel',
    example: 'Alice Dupont',
  }),
  email: z.string().email().optional(),
  role: z.string().optional(),
  avatarUrl: z.string().url().optional(),
  phone: z.string().optional(),
  service: z.string().optional(),
  position: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  lastConnection: z.string().optional(),
}).openapi({
  description: 'Utilisateur actuellement connecté',
});


export const ConversationDtoSchema = z.object({
  id: IdSchema,
  name: z.string().openapi({
    description: 'Nom de la conversation',
    example: 'Discussion de groupe',
  }),
  department: z.string().optional().openapi({
    description: 'Département associé à la conversation',
    example: 'Marketing',
  }),
  kind: ConversationKindSchema.optional().openapi({
    description: 'Type de conversation, direct ou groupe',
    example: 'direct',
  }),
  avatarUrl: z.string().url().optional().openapi({
    description: 'URL de l’avatar de la conversation',
    example: 'https://example.com/avatar.png',
  }),
  initials: z.string().optional().openapi({
    description: 'Initiales de la conversation',
    example: 'DG',
  }),
  presence: PresenceSchema.optional().openapi({
    description: 'Présence de l’utilisateur, en ligne, hors ligne ou absent',
    example: 'online',
  }),
  lastMessage: z.string().optional().openapi({
    description: 'Dernier message de la conversation',
    example: 'Bonjour à tous !',
  }),
  lastMessageAt: z.string().optional().openapi({
    description: 'Date et heure du dernier message (format ISO)',
    example: '2026-06-23T12:32:00Z',
  }),
  unreadCount: z.number().int().optional().openapi({
    description: 'Nombre de messages non lus dans la conversation',
    example: 5,
  }),
}).openapi({
  description: 'Représentation d’une conversation',
});




export const AttachmentDtoSchema = z.object({
  id: IdSchema,
  name: z.string().openapi({
    description: 'Nom de la pièce jointe',
    example: 'document.pdf',
  }),
  size: z.number().int().optional().openapi({
    description: 'Taille de la pièce jointe en octets',
    example: 102400,
  }),
  type: z.string().optional().openapi({
    description: 'Type MIME de la pièce jointe',
    example: 'application/pdf',
  }),
  url: z.string().url().optional().openapi({
    description: 'URL pour accéder à la pièce jointe',
    example: 'https://example.com/document.pdf',
  }),
}).openapi({
  description: 'Représentation d’une pièce jointe',
});


export const MentionDtoSchema = z.object({
  id: IdSchema,
  name: z.string().openapi({
    description: 'Nom de la mention',
    example: 'Alice Dupont',
  }),
  kind: ConversationKindSchema.optional().openapi({
    description: 'Type de conversation associé à la mention',
    example: 'direct',
  }),
  description: z.string().optional().openapi({
    description: 'Description de la mention',
    example: 'Mention d’un utilisateur dans un message',
  }),
}).openapi({
  description: 'Représentation d’une mention',
});

export const MessageDtoSchema = z.object({
  id: IdSchema,
  conversationId: IdSchema,
  content: z.string().openapi({
    description: 'Contenu du message',
    example: 'Bonjour à tous !',
  }),
  sentAt: z.string().openapi({
    description: 'Date et heure d’envoi du message (format ISO)',
    example: '2026-06-23T12:32:00Z',
  }),
  authorId: IdSchema,
  authorName: z.string().optional().openapi({
    description: 'Nom de l’auteur du message',
    example: 'Alice Dupont',
  }),
  direction: MessageDirectionSchema.optional().openapi({
    description: 'Direction du message, entrant ou sortant',
    example: 'incoming',
  }),
  attachments: z.array(AttachmentDtoSchema).optional().openapi({
    description: 'Liste des pièces jointes du message',
    example: [],
  }),
  mentions: z.array(MentionDtoSchema).optional().openapi({
    description: 'Liste des mentions dans le message',
    example: [],
  }),
}).openapi({
  description: 'Représentation d’un message',
});


export const ContactDtoSchema = z.object({
  id: IdSchema,
  name: z.string().openapi({
    description: 'Nom du contact',
    example: 'Alice Dupont',
  }),
  email: z.string().email().optional().openapi({
    description: 'Adresse email du contact',
    example: 'alice.dupont@mairie360.fr',
  }),
  department: z.string().optional().openapi({
    description: 'Département associé au contact',
    example: 'Marketing',
  }),
  avatarUrl: z.string().url().optional().openapi({
    description: 'URL de l’avatar du contact',
    example: 'https://example.com/avatar.png',
  }),
  initials: z.string().optional().openapi({
    description: 'Initiales du contact',
    example: 'AD',
  }),
  presence: PresenceSchema.optional().openapi({
    description: 'Présence du contact, en ligne, hors ligne ou absent',
    example: 'online',
  }),
}).openapi({
  description: 'Représentation d’un contact',
});

export const ConversationIdParams = z.object({
  conversationId: IdSchema.openapi({
    description: 'Identifiant unique de la conversation',
    example: '12345',
  }),
}).openapi({
  description: 'Paramètres pour identifier une conversation',
});


export const ConversationsQuery = z.object({
  search: z.string().optional().openapi({
    description: 'Terme de recherche pour filtrer les conversations',
    example: 'Marketing',
  }),
  limit: z.coerce.number().int().optional().openapi({
    description: 'Nombre maximum de conversations à retourner',
    example: 10,
  }),
  cursor: z.string().optional().openapi({
    description: 'Curseur pour la pagination des résultats',
    example: 'abc123',
  }),
}).openapi({
  description: 'Paramètres de requête pour filtrer et paginer les conversations',
}); 


export const MessagesQuery = z.object({
  limit: z.coerce.number().int().optional().openapi({
    description: 'Nombre maximum de messages à retourner',
    example: 20,
  }),
  before: z.string().optional().openapi({
    description: 'Curseur pour récupérer les messages avant un certain point',
    example: '2026-06-23T12:32:00Z',
  }),
  after: z.string().optional().openapi({
    description: 'Curseur pour récupérer les messages après un certain point',
    example: '2026-06-23T12:32:00Z',
  }),
}).openapi({
  description: 'Paramètres de requête pour filtrer et paginer les messages',
});

export const ContactsQuery = z.object({
    search: z.string().optional().openapi({
        description: 'Terme de recherche pour filtrer les contacts',
        example: 'Alice'
    }),
    limit: z.coerce.number().int().optional().openapi({
        description: 'Nombre maximum de contacts à retourner',
        example: 10
    }),
}).openapi({
    description: 'Paramètres de requête pour filtrer les contacts',
});

// Requête 

export const SendMessageBody = z.object({
  content: z.string().openapi({
    description: 'Contenu du message à envoyer',
    example: 'Bonjour à tous !',
  }),
  attachmentIds: z.array(IdSchema).optional().openapi({
    description: 'Liste des identifiants des pièces jointes du message',
    example: [],
  }),
  mentionIds: z.array(IdSchema).optional().openapi({
    description: 'Liste des identifiants des mentions dans le message',
    example: [],
  }),
}).openapi({
  description: 'Corps de la requête pour envoyer un message',
});

export const NewDirectMessageBody = z.object({
  recipientId: IdSchema.openapi({
    description: 'Identifiant unique du destinataire du message direct',
    example: '67890',
  }),
  message: z.string().openapi({
    description: 'Contenu du message direct à envoyer',
    example: 'Salut ! Comment ça va ?',
  }),
}).openapi({
  description: 'Corps de la requête pour créer un nouveau message direct',
});

export const CreateGroupBody = z.object({
    name: z.string().openapi({
        description: 'Nom du groupe à créer',
        example: 'Équipe Marketing',
    }),
    description: z.string().optional().openapi({
        description: 'Description du groupe à créer',
        example: 'Groupe pour l’équipe marketing',
    }),
    memberIds: z.array(IdSchema).openapi({
        description: 'Liste des identifiants des membres à ajouter au groupe',
        example: ['12345', '67890'],
    }),
}).openapi({
    description: 'Corps de la requête pour créer un nouveau groupe',
});

export const MarkConversationAsReadBody = z.object({
    readUntilMessageId: IdSchema.optional().openapi({
        description: 'Identifiant du dernier message lu dans la conversation',
        example: '54321',
    }),
}).openapi({
    description: 'Corps de la requête pour marquer une conversation comme lue',
});

export const UploadAttachmentBody = z.object({
    files: z.any().openapi({
        description: 'Fichier à télécharger en tant que pièce jointe',
        example: 'fichier.pdf',
    }),
}).openapi({
    description: 'Corps de la requête pour télécharger une pièce jointe',
});

// Réponse

export const CurrentUserResponse = z.object({
  currentUser: CurrentUserDtoSchema,
}).openapi({
  description: 'Réponse contenant l’utilisateur actuel',
});

export const UpdateCurrentUserBody = z.object({
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
}).openapi({
  description: 'Champs éditables du profil utilisateur',
});

export const UpdateCurrentUserResponse = z.object({
  currentUser: CurrentUserDtoSchema,
}).openapi({
  description: 'Réponse contenant l’utilisateur actuel mis à jour',
});


export const ConversationsResponse = z.object({
  conversations: z.array(ConversationDtoSchema).openapi({
    description: 'Liste des conversations',
  }),
  nextCursor: z.string().optional().openapi({
    description: 'Curseur pour la pagination des résultats',
    example: 'abc123',
  }),
}).openapi({
  description: 'Réponse contenant la liste des conversations et un curseur pour la pagination',
});

export const MessagesResponse = z.object({
  conversation: ConversationDtoSchema.openapi({
    description: 'Détails de la conversation associée aux messages',
  }),
  messages: z.array(MessageDtoSchema).openapi({
    description: 'Liste des messages',
  }),
  nextCursor: z.string().optional().openapi({
    description: 'Curseur pour la pagination des résultats',
    example: 'def456',
  }),
}).openapi({
  description: 'Réponse contenant la liste des messages et un curseur pour la pagination',
});

export const ContactsResponse = z.object({
    contacts: z.array(ContactDtoSchema).openapi({
        description: 'Liste des contacts',
    }),
}).openapi({
    description: 'Réponse contenant la liste des contacts',
});

export const SendMessageResponse = z.object({
  message: MessageDtoSchema.openapi({
    description: 'Message envoyé',
  }),
  conversation: ConversationDtoSchema.optional().openapi({
    description: 'Détails de la conversation associée au message envoyé',
  }),
}).openapi({
  description: 'Réponse contenant le message envoyé et les détails de la conversation associée',
});

export const NewDirectMessageResponse = z.object({
    conversation: ConversationDtoSchema.openapi({
        description: 'Détails de la conversation directe créée',
    }),
    message: MessageDtoSchema.openapi({
        description: 'Message direct envoyé',
    }),
}).openapi({
    description: 'Réponse contenant les détails de la conversation directe créée et le message envoyé',
});

export const CreateGroupResponse = z.object({
    conversation: ConversationDtoSchema.openapi({
        description: 'Détails du groupe créé',
    }),
}).openapi({
    description: 'Réponse contenant les détails du groupe créé',
});

export const DeleteConversationResponse = z.object({
    deleted: z.literal(true).openapi({
        description: 'Indique si la conversation a été supprimée avec succès',
        example: true,
    }),
    conversationId: IdSchema.optional().openapi({
        description: 'Identifiant de la conversation supprimée',
        example: '12345',
    }),
}).openapi({
    description: 'Réponse indiquant si la conversation a été supprimée avec succès',
});

export const MarkConversationAsReadResponse = z.object({
    conversationId: IdSchema.openapi({
        description: 'Identifiant de la conversation marquée comme lue',
        example: '12345',
    }),
    unreadCount: z.number().int().openapi({
        description: 'Nombre de messages non lus restant dans la conversation après la mise à jour',
        example: 0,
    }),
}).openapi({
    description: 'Réponse contenant l’identifiant de la conversation et le nombre de messages non lus restant après la mise à jour',
});

export const UploadAttachmentResponse = z.object({
    attachments: z.array(AttachmentDtoSchema).openapi({
        description: 'Liste des pièces jointes téléchargées',
    }),
}).openapi({
    description: 'Réponse contenant la liste des pièces jointes téléchargées',
});

export const MessagingBootstrapResponse = z.object({
    currentUser: CurrentUserDtoSchema,
    conversations: z.array(ConversationDtoSchema),
    activeConversationId: IdSchema.optional(),
    messages: z.array(MessageDtoSchema),
}).openapi({
    description: 'Réponse contenant les données de base pour le démarrage de la messagerie',
});

// Api error

export const ApiErrorResponse = z.object({
    code: z.string().openapi({
        description: 'Code d’erreur unique',
        example: 'USER_NOT_FOUND',
    }),
    message: z.string().openapi({
        description: 'Message d’erreur détaillé',
        example: 'L’utilisateur spécifié est introuvable.',
    }),
    details: z.any().optional().openapi({
        description: 'Détails supplémentaires sur l’erreur',
        example: { userId: '12345' },
    }),
}).openapi({
    description: 'Réponse contenant les informations sur l’erreur de l’API',
});

registry.register('IdSchema', IdSchema);
registry.register('CurrentUserDtoSchema', CurrentUserDtoSchema);
registry.register('ContactDtoSchema', ContactDtoSchema);
registry.register('ConversationDtoSchema', ConversationDtoSchema);
registry.register('MessageDtoSchema', MessageDtoSchema);
registry.register('AttachmentDtoSchema', AttachmentDtoSchema);
registry.register('MentionDtoSchema', MentionDtoSchema);
registry.register('ConversationsResponse', ConversationsResponse);
registry.register('MessagesResponse', MessagesResponse);
registry.register('ContactsResponse', ContactsResponse);
registry.register('SendMessageResponse', SendMessageResponse);
registry.register('NewDirectMessageResponse', NewDirectMessageResponse);
registry.register('CreateGroupResponse', CreateGroupResponse);
registry.register('DeleteConversationResponse', DeleteConversationResponse);
registry.register('MarkConversationAsReadResponse', MarkConversationAsReadResponse);
registry.register('UploadAttachmentResponse', UploadAttachmentResponse);
registry.register('MessagingBootstrapResponse', MessagingBootstrapResponse);
registry.register('CurrentUserResponse', CurrentUserResponse);
registry.register('UpdateCurrentUserResponse', UpdateCurrentUserResponse);
registry.register('ApiErrorResponse', ApiErrorResponse);
registry.register('UpdateCurrentUserBody', UpdateCurrentUserBody);
registry.register('SendMessageBody', SendMessageBody);
registry.register('NewDirectMessageBody', NewDirectMessageBody);
registry.register('CreateGroupBody', CreateGroupBody);
registry.register('MarkConversationAsReadBody', MarkConversationAsReadBody);
registry.register('UploadAttachmentBody', UploadAttachmentBody);
registry.register('ConversationsQuery', ConversationsQuery);
registry.register('MessagesQuery', MessagesQuery);
registry.register('ContactsQuery', ContactsQuery);
registry.register('ConversationIdParams', ConversationIdParams);
