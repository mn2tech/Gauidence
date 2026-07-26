import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CHAT_MODEL,
  createLlmClient,
  runChatCompletionStream,
} from "@/lib/analysis/llm";
import { generateVaultChatTitle } from "@/lib/chat/generateVaultChatTitle";
import { shouldGenerateVaultChatTitle } from "@/lib/chat/vaultChatTitle";
import {
  selectCitationsForAnswer,
  selectImageCitationsFromChunks,
  markImageCitations,
  dedupeVaultCitations,
} from "@/lib/vault/indexDocument";
import { wantsShowPictures, wantsSingleImageFocus } from "@/lib/vault/images";
import {
  buildVaultScopePayload,
  chatScopedProfilePayload,
  resolveGideonWriteVault,
  type VaultScopeCandidate,
} from "@/lib/vault/detectVaultScope";
import type { AttachedVaultDocument } from "@/lib/vault/attachedDocument";
import type { RetrievedChunk } from "@/lib/vault/retrieve";
import {
  VAULT_CHAT_STREAM_CONTENT_TYPE,
  type VaultChatStreamChatSummary,
  type VaultChatStreamMessage,
} from "@/lib/vault/vaultChatStream";
import { parseProposedReminder } from "@/lib/reminders/propose";
import { withLlmUsage } from "@/lib/usage/record";
import { refreshUserAwards } from "@/lib/awards/grant";

export type VaultChatStreamArgs = {
  supabase: SupabaseClient;
  userId: string;
  chatId: string;
  active: { id: string; display_name: string };
  chatHomeProfileId: string;
  chatScopedProfileId: string | null;
  userMsg: VaultChatStreamMessage;
  question: string;
  history: { role: "user" | "assistant"; content: string }[];
  system: string;
  maxTokens: number;
  chunks: RetrievedChunk[];
  attachedDoc: AttachedVaultDocument | null;
  showPictures: boolean;
  accessibleProfiles: VaultScopeCandidate[];
  isFirstExchange: boolean;
  attachedFileName?: string;
  userTz: string;
  listChats: (
    supabase: SupabaseClient,
    userId: string,
    profileId: string
  ) => Promise<VaultChatStreamChatSummary[]>;
  updateVaultChatRow: (
    supabase: SupabaseClient,
    chatId: string,
    updates: {
      updated_at: string;
      title?: string;
      scoped_profile_id?: string | null;
    }
  ) => Promise<void>;
};

export function createVaultChatStreamResponse(
  args: VaultChatStreamArgs
): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (payload: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
      };

      try {
        write({
          type: "meta",
          chatId: args.chatId,
          userMsg: args.userMsg,
        });

        const client = createLlmClient();
        let answer = "";

        await withLlmUsage(
          { userId: args.userId, feature: "vault_chat" },
          async () => {
            answer = await runChatCompletionStream(client, {
              system: args.system,
              model: CHAT_MODEL,
              maxTokens: args.maxTokens,
              messages: [...args.history, { role: "user", content: args.question }],
              ...(args.attachedDoc?.isImage && args.attachedDoc.imageBase64
                ? {
                    attachedImage: {
                      mimeType: args.attachedDoc.mimeType,
                      base64: args.attachedDoc.imageBase64,
                      fileName: args.attachedDoc.fileName,
                    },
                  }
                : {}),
              onDelta: (text) => write({ type: "delta", text }),
            });
          }
        );

        if (!answer) {
          answer =
            "I found potentially relevant information, but it needs verification before I can give you a reliable answer.";
        }

        let selected = selectCitationsForAnswer(answer, args.chunks);
        if (args.attachedDoc) {
          const attachedCitation = {
            documentId: args.attachedDoc.documentId,
            fileName: args.attachedDoc.fileName,
            ...(args.attachedDoc.profileName
              ? { profileName: args.attachedDoc.profileName }
              : {}),
            ...(args.attachedDoc.isImage ? { isImage: true } : {}),
          };
          const seen = new Set(selected.map((c) => c.documentId));
          if (!seen.has(args.attachedDoc.documentId)) {
            selected = [attachedCitation, ...selected];
          }
        }
        if (args.showPictures) {
          const imageLimit = wantsSingleImageFocus(args.question) ? 1 : 4;
          const imageOnes = selectImageCitationsFromChunks(args.chunks, imageLimit);
          const seen = new Set(selected.map((c) => c.documentId));
          for (const img of imageOnes) {
            if (seen.has(img.documentId)) continue;
            selected.push(img);
            seen.add(img.documentId);
          }
          if (selected.length === 0 && imageOnes.length > 0) {
            selected = imageOnes;
          }
        }
        const citations = markImageCitations(dedupeVaultCitations(selected));

        const resolvedWriteVault = resolveGideonWriteVault({
          question: args.question,
          activeProfileId: args.active.id,
          accessibleProfiles: args.accessibleProfiles,
          retrievedChunks: args.chunks,
        });
        const responseVaultScope = buildVaultScopePayload({
          writeVault: resolvedWriteVault,
          activeProfile: {
            id: args.active.id,
            display_name: args.active.display_name,
          },
        });

        const { data: assistantMsg, error: assistantError } =
          await args.supabase
            .from("vault_chat_messages")
            .insert({
              chat_id: args.chatId,
              user_id: args.userId,
              role: "assistant",
              content: answer,
              citations,
            })
            .select("id, role, content, citations, created_at")
            .single();

        if (assistantError || !assistantMsg) {
          write({
            type: "error",
            error: "Answer generated but couldn't be saved.",
          });
          controller.close();
          return;
        }

        const chatUpdates: {
          updated_at: string;
          title?: string;
          scoped_profile_id?: string | null;
        } = {
          updated_at: new Date().toISOString(),
        };

        if (
          shouldGenerateVaultChatTitle({
            isFirstExchange: args.isFirstExchange,
            question: args.question,
          })
        ) {
          try {
            const generatedTitle = await withLlmUsage(
              { userId: args.userId, feature: "vault_chat" },
              () =>
                generateVaultChatTitle({
                  question: args.question,
                  answer,
                  attachmentFileName: args.attachedFileName,
                })
            );
            if (generatedTitle) {
              chatUpdates.title = generatedTitle;
            }
          } catch (err) {
            console.error(
              "Vault chat title generation failed:",
              err instanceof Error ? err.message : "error"
            );
          }
        }

        let persistedScopedProfileId = args.chatScopedProfileId;
        if (responseVaultScope) {
          chatUpdates.scoped_profile_id = responseVaultScope.profileId;
          persistedScopedProfileId = responseVaultScope.profileId;
        }

        await args.updateVaultChatRow(args.supabase, args.chatId, chatUpdates);

        const chats = await args.listChats(
          args.supabase,
          args.userId,
          args.active.id
        );
        const proposedReminder = parseProposedReminder(
          answer,
          Date.now(),
          args.userTz
        );
        const newlyGranted = await refreshUserAwards(
          args.userId,
          args.supabase
        );

        const persistedChatScopedProfile = chatScopedProfilePayload({
          scopedProfileId: persistedScopedProfileId,
          accessibleProfiles: args.accessibleProfiles,
          chatHomeProfileId: args.chatHomeProfileId,
        });

        write({
          type: "done",
          chatId: args.chatId,
          chats,
          messages: [
            args.userMsg,
            { ...assistantMsg, vaultScope: responseVaultScope },
          ],
          proposedReminder,
          newlyGranted,
          vaultScope: responseVaultScope,
          writeProfile: {
            profileId: resolvedWriteVault.id,
            profileName: resolvedWriteVault.display_name,
          },
          chatScopedProfile: persistedChatScopedProfile,
        });
      } catch (err) {
        console.error(
          "Vault chat stream failed:",
          err instanceof Error ? err.name : "error"
        );
        write({
          type: "error",
          error:
            "I couldn't complete that request right now. Please try again.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": VAULT_CHAT_STREAM_CONTENT_TYPE,
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
