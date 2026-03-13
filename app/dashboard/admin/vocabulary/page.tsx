"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Folder = {
   id: string;
   slug: string;
   title: string;
   description: string | null;
   sort_order: number;
   created_at: string;
};

type Deck = {
   id: string;
   title: string;
   description: string | null;
   is_public: boolean;
   requires_premium: boolean;
   created_at: string;
   folder_id: string | null;
   folder: {
      id: string;
      slug: string;
      title: string;
   } | null;
};

type Card = {
   id: string;
   front: string;
   back: string;
   example_sentence: string | null;
   transcription: string | null;
};

type CardDraft = {
   front: string;
   back: string;
   exampleSentence: string;
   transcription: string;
};

async function getAccessToken() {
   const { data, error } = await supabase.auth.getSession();
   if (error || !data.session?.access_token) {
      throw new Error("You must be logged in.");
   }

   return data.session.access_token;
}

export default function AdminVocabularyPage() {
   const router = useRouter();
   const [folders, setFolders] = useState<Folder[]>([]);
   const [decks, setDecks] = useState<Deck[]>([]);
   const [cards, setCards] = useState<Card[]>([]);
   const [selectedDeckId, setSelectedDeckId] = useState("");
   const [loading, setLoading] = useState(true);
   const [cardsLoading, setCardsLoading] = useState(false);
   const [error, setError] = useState<string | null>(null);
   const [success, setSuccess] = useState<string | null>(null);

   const [folderTitle, setFolderTitle] = useState("");
   const [folderSlug, setFolderSlug] = useState("");
   const [folderDescription, setFolderDescription] = useState("");
   const [folderSortOrder, setFolderSortOrder] = useState("0");
   const [folderSaving, setFolderSaving] = useState(false);
   const [deletingFolderId, setDeletingFolderId] = useState<string | null>(null);

   const [deckTitle, setDeckTitle] = useState("");
   const [deckDescription, setDeckDescription] = useState("");
   const [deckFolderId, setDeckFolderId] = useState("");
   const [deckIsPublic, setDeckIsPublic] = useState(true);
   const [deckRequiresPremium, setDeckRequiresPremium] = useState(false);
   const [deckSaving, setDeckSaving] = useState(false);
   const [deckUpdating, setDeckUpdating] = useState(false);
   const [deletingDeckId, setDeletingDeckId] = useState<string | null>(null);
   const [copiedDeckId, setCopiedDeckId] = useState<string | null>(null);

   const [cardFront, setCardFront] = useState("");
   const [cardBack, setCardBack] = useState("");
   const [cardExample, setCardExample] = useState("");
   const [cardTranscription, setCardTranscription] = useState("");
   const [cardSaving, setCardSaving] = useState(false);
   const [deletingCardId, setDeletingCardId] = useState<string | null>(null);
   const [editingCardId, setEditingCardId] = useState<string | null>(null);
   const [editingCardDraft, setEditingCardDraft] = useState<CardDraft | null>(
      null
   );

   const selectedDeck = useMemo(
      () => decks.find((deck) => deck.id === selectedDeckId) || null,
      [decks, selectedDeckId]
   );

   useEffect(() => {
      const load = async () => {
         try {
            setLoading(true);
            setError(null);
            const token = await getAccessToken();
            const response = await fetch("/api/admin/vocabulary", {
               headers: {
                  Authorization: `Bearer ${token}`,
               },
               cache: "no-store",
            });
            const payload = await response.json();

            if (!response.ok) {
               if (response.status === 401 || response.status === 403) {
                  router.replace("/dashboard");
                  return;
               }

               throw new Error(payload.error || "Failed to load admin data.");
            }

            const nextFolders = (payload.folders || []) as Folder[];
            const nextDecks = (payload.decks || []) as Deck[];
            setFolders(nextFolders);
            setDecks(nextDecks);
            const initialDeckId = nextDecks[0]?.id || "";
            setSelectedDeckId((current) => current || initialDeckId);
         } catch (requestError) {
            setError(
               requestError instanceof Error
                  ? requestError.message
                  : "Failed to load admin data."
            );
         } finally {
            setLoading(false);
         }
      };

      load();
   }, [router]);

   useEffect(() => {
      const loadCards = async () => {
         if (!selectedDeckId) {
            setCards([]);
            return;
         }

         try {
            setCardsLoading(true);
            setError(null);
            const token = await getAccessToken();
            const response = await fetch(
               `/api/admin/vocabulary/decks/${selectedDeckId}/cards`,
               {
                  headers: {
                     Authorization: `Bearer ${token}`,
                  },
                  cache: "no-store",
               }
            );
            const payload = await response.json();

            if (!response.ok) {
               if (response.status === 401 || response.status === 403) {
                  router.replace("/dashboard");
                  return;
               }

               throw new Error(payload.error || "Failed to load cards.");
            }

            setCards((payload.cards || []) as Card[]);
         } catch (requestError) {
            setError(
               requestError instanceof Error
                  ? requestError.message
                  : "Failed to load cards."
            );
         } finally {
            setCardsLoading(false);
         }
      };

      loadCards();
   }, [router, selectedDeckId]);

   useEffect(() => {
      if (!selectedDeck) {
         setDeckTitle("");
         setDeckDescription("");
         setDeckFolderId("");
         setDeckIsPublic(true);
         setDeckRequiresPremium(false);
         return;
      }

      setDeckTitle(selectedDeck.title);
      setDeckDescription(selectedDeck.description || "");
      setDeckFolderId(selectedDeck.folder_id || "");
      setDeckIsPublic(selectedDeck.is_public);
      setDeckRequiresPremium(selectedDeck.requires_premium);
   }, [selectedDeck]);

   const handleCreateFolder = async (event: FormEvent) => {
      event.preventDefault();

      try {
         setFolderSaving(true);
         setError(null);
         setSuccess(null);
         const token = await getAccessToken();
         const response = await fetch("/api/admin/vocabulary", {
            method: "POST",
            headers: {
               "Content-Type": "application/json",
               Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
               type: "folder",
               title: folderTitle,
               slug: folderSlug,
               description: folderDescription,
               sortOrder: Number(folderSortOrder || 0),
            }),
         });
         const payload = await response.json();

         if (!response.ok) {
            throw new Error(payload.error || "Failed to create folder.");
         }

         setFolders((prev) =>
            [...prev, payload.folder as Folder].sort(
               (a, b) => a.sort_order - b.sort_order
            )
         );
         setFolderTitle("");
         setFolderSlug("");
         setFolderDescription("");
         setFolderSortOrder("0");
         setSuccess("Folder created.");
      } catch (requestError) {
         setError(
            requestError instanceof Error
               ? requestError.message
               : "Failed to create folder."
         );
      } finally {
         setFolderSaving(false);
      }
   };

   const handleCreateDeck = async (event: FormEvent) => {
      event.preventDefault();

      try {
         setDeckSaving(true);
         setError(null);
         setSuccess(null);
         const token = await getAccessToken();
         const response = await fetch("/api/admin/vocabulary", {
            method: "POST",
            headers: {
               "Content-Type": "application/json",
               Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
               type: "deck",
               title: deckTitle,
               description: deckDescription,
               folderId: deckIsPublic ? deckFolderId || null : null,
               isPublic: deckIsPublic,
               requiresPremium: deckRequiresPremium,
            }),
         });
         const payload = await response.json();

         if (!response.ok) {
            throw new Error(payload.error || "Failed to create deck.");
         }

         const createdDeck = payload.deck as Deck;
         setDecks((prev) => [createdDeck, ...prev]);
         setSelectedDeckId(createdDeck.id);
         setSuccess("Deck created.");
      } catch (requestError) {
         setError(
            requestError instanceof Error
               ? requestError.message
               : "Failed to create deck."
         );
      } finally {
         setDeckSaving(false);
      }
   };

   const handleDeleteFolder = async (folderId: string) => {
      const confirmed = window.confirm(
         "Delete this folder? Decks inside it will become ungrouped."
      );
      if (!confirmed) return;

      try {
         setDeletingFolderId(folderId);
         setError(null);
         setSuccess(null);
         const token = await getAccessToken();
         const response = await fetch(`/api/admin/vocabulary/folders/${folderId}`, {
            method: "DELETE",
            headers: {
               Authorization: `Bearer ${token}`,
            },
         });
         const payload = await response.json();

         if (!response.ok) {
            throw new Error(payload.error || "Failed to delete folder.");
         }

         setFolders((prev) => prev.filter((folder) => folder.id !== folderId));
         setDecks((prev) =>
            prev.map((deck) =>
               deck.folder_id === folderId
                  ? { ...deck, folder_id: null, folder: null }
                  : deck
            )
         );
         if (deckFolderId === folderId) {
            setDeckFolderId("");
         }
         setSuccess("Folder deleted.");
      } catch (requestError) {
         setError(
            requestError instanceof Error
               ? requestError.message
               : "Failed to delete folder."
         );
      } finally {
         setDeletingFolderId(null);
      }
   };

   const handleUpdateDeck = async (event: FormEvent) => {
      event.preventDefault();
      if (!selectedDeckId) return;

      try {
         setDeckUpdating(true);
         setError(null);
         setSuccess(null);
         const token = await getAccessToken();
         const response = await fetch(
            `/api/admin/vocabulary/decks/${selectedDeckId}`,
            {
               method: "PATCH",
               headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
               },
               body: JSON.stringify({
                  title: deckTitle,
                  description: deckDescription,
                  folderId: deckIsPublic ? deckFolderId || null : null,
                  isPublic: deckIsPublic,
                  requiresPremium: deckRequiresPremium,
               }),
            }
         );
         const payload = await response.json();

         if (!response.ok) {
            throw new Error(payload.error || "Failed to update deck.");
         }

         const updatedDeck = payload.deck as Deck;
         setDecks((prev) =>
            prev.map((deck) => (deck.id === updatedDeck.id ? updatedDeck : deck))
         );
         setSuccess("Deck updated.");
      } catch (requestError) {
         setError(
            requestError instanceof Error
               ? requestError.message
               : "Failed to update deck."
         );
      } finally {
         setDeckUpdating(false);
      }
   };

   const handleDeleteDeck = async (deckId: string) => {
      const confirmed = window.confirm(
         "Delete this deck? Its cards will be removed as well."
      );
      if (!confirmed) return;

      try {
         setDeletingDeckId(deckId);
         setError(null);
         setSuccess(null);
         const token = await getAccessToken();
         const response = await fetch(`/api/admin/vocabulary/decks/${deckId}`, {
            method: "DELETE",
            headers: {
               Authorization: `Bearer ${token}`,
            },
         });
         const payload = await response.json();

         if (!response.ok) {
            throw new Error(payload.error || "Failed to delete deck.");
         }

         setDecks((prev) => prev.filter((deck) => deck.id !== deckId));
         if (selectedDeckId === deckId) {
            const remainingDeck = decks.find((deck) => deck.id !== deckId);
            setSelectedDeckId(remainingDeck?.id || "");
            setCards([]);
            setEditingCardId(null);
            setEditingCardDraft(null);
         }
         setSuccess("Deck deleted.");
      } catch (requestError) {
         setError(
            requestError instanceof Error
               ? requestError.message
               : "Failed to delete deck."
         );
      } finally {
         setDeletingDeckId(null);
      }
   };

   const handleCopyDeckId = async (deckId: string) => {
      try {
         await navigator.clipboard.writeText(deckId);
         setCopiedDeckId(deckId);
         window.setTimeout(() => {
            setCopiedDeckId((current) => (current === deckId ? null : current));
         }, 1500);
      } catch {
         setError("Could not copy the deck ID.");
      }
   };

   const handleCreateCard = async (event: FormEvent) => {
      event.preventDefault();
      if (!selectedDeckId) return;

      try {
         setCardSaving(true);
         setError(null);
         setSuccess(null);
         const token = await getAccessToken();
         const response = await fetch(
            `/api/admin/vocabulary/decks/${selectedDeckId}/cards`,
            {
               method: "POST",
               headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
               },
               body: JSON.stringify({
                  front: cardFront,
                  back: cardBack,
                  exampleSentence: cardExample,
                  transcription: cardTranscription,
               }),
            }
         );
         const payload = await response.json();

         if (!response.ok) {
            throw new Error(payload.error || "Failed to create card.");
         }

         setCards((prev) => [...prev, payload.card as Card]);
         setCardFront("");
         setCardBack("");
         setCardExample("");
         setCardTranscription("");
         setSuccess("Card created.");
      } catch (requestError) {
         setError(
            requestError instanceof Error
               ? requestError.message
               : "Failed to create card."
         );
      } finally {
         setCardSaving(false);
      }
   };

   const handleDeleteCard = async (cardId: string) => {
      if (!selectedDeckId) return;

      const confirmed = window.confirm("Delete this word from the deck?");
      if (!confirmed) return;

      try {
         setDeletingCardId(cardId);
         setError(null);
         setSuccess(null);
         const token = await getAccessToken();
         const response = await fetch(
            `/api/admin/vocabulary/decks/${selectedDeckId}/cards?cardId=${encodeURIComponent(cardId)}`,
            {
               method: "DELETE",
               headers: {
                  Authorization: `Bearer ${token}`,
               },
            }
         );
         const payload = await response.json();

         if (!response.ok) {
            throw new Error(payload.error || "Failed to delete card.");
         }

         setCards((prev) => prev.filter((card) => card.id !== cardId));
         setSuccess("Card deleted.");
      } catch (requestError) {
         setError(
            requestError instanceof Error
               ? requestError.message
               : "Failed to delete card."
         );
      } finally {
         setDeletingCardId(null);
      }
   };

   const startEditingCard = (card: Card) => {
      setEditingCardId(card.id);
      setEditingCardDraft({
         front: card.front,
         back: card.back,
         exampleSentence: card.example_sentence || "",
         transcription: card.transcription || "",
      });
   };

   const cancelEditingCard = () => {
      setEditingCardId(null);
      setEditingCardDraft(null);
   };

   const handleSaveCard = async (cardId: string) => {
      if (!selectedDeckId || !editingCardDraft) return;

      try {
         setDeletingCardId(cardId);
         setError(null);
         setSuccess(null);
         const token = await getAccessToken();
         const response = await fetch(
            `/api/admin/vocabulary/decks/${selectedDeckId}/cards?cardId=${encodeURIComponent(cardId)}`,
            {
               method: "PATCH",
               headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
               },
               body: JSON.stringify(editingCardDraft),
            }
         );
         const payload = await response.json();

         if (!response.ok) {
            throw new Error(payload.error || "Failed to update card.");
         }

         const updatedCard = payload.card as Card;
         setCards((prev) =>
            prev.map((card) => (card.id === cardId ? updatedCard : card))
         );
         setEditingCardId(null);
         setEditingCardDraft(null);
         setSuccess("Card updated.");
      } catch (requestError) {
         setError(
            requestError instanceof Error
               ? requestError.message
               : "Failed to update card."
         );
      } finally {
         setDeletingCardId(null);
      }
   };

   return (
      <div className="space-y-8">
         <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">
               Admin
            </p>
            <h1 className="text-3xl font-semibold">Vocabulary admin</h1>
            <p className="max-w-3xl text-sm text-slate-400">
               Create folders, publish decks into folders, and add cards inside
               each deck from one place.
            </p>
            <Link
               href="/dashboard/vocabulary"
               className="inline-flex text-sm text-slate-400 transition hover:text-slate-200">
               Back to vocabulary
            </Link>
         </div>

         {error && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
               {error}
            </div>
         )}

         {success && (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
               {success}
            </div>
         )}

         {loading ? (
            <p className="text-sm text-slate-400">Loading admin panel...</p>
         ) : (
            <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
               <div className="space-y-6">
                  <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
                     <div className="mb-4 space-y-1">
                        <h2 className="text-xl font-semibold">Create folder</h2>
                        <p className="text-sm text-slate-400">
                           Folders are used only for student-facing public deck
                           browsing.
                        </p>
                     </div>

                     <form onSubmit={handleCreateFolder} className="grid gap-3">
                        <input
                           value={folderTitle}
                           onChange={(event) => setFolderTitle(event.target.value)}
                           placeholder="Folder title"
                           className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                        />
                        <input
                           value={folderSlug}
                           onChange={(event) => setFolderSlug(event.target.value)}
                           placeholder="folder-slug"
                           className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                        />
                        <textarea
                           value={folderDescription}
                           onChange={(event) =>
                              setFolderDescription(event.target.value)
                           }
                           placeholder="Folder description"
                           rows={3}
                           className="resize-none rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                        />
                        <input
                           value={folderSortOrder}
                           onChange={(event) => setFolderSortOrder(event.target.value)}
                           type="number"
                           placeholder="Sort order"
                           className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                        />
                        <button
                           type="submit"
                           disabled={folderSaving}
                           className="cursor-pointer rounded-full bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60">
                           {folderSaving ? "Creating..." : "Create folder"}
                        </button>
                     </form>

                     {folders.length > 0 && (
                        <div className="mt-6 grid gap-3">
                           {folders.map((folder) => (
                              <div
                                 key={folder.id}
                                 className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                                 <div className="flex items-start justify-between gap-3">
                                    <div>
                                       <p className="font-semibold text-slate-100">
                                          {folder.title}
                                       </p>
                                       <p className="mt-1 text-xs text-slate-500">
                                          Slug: {folder.slug} | Sort:{" "}
                                          {folder.sort_order}
                                       </p>
                                       {folder.description && (
                                          <p className="mt-2 text-sm text-slate-400">
                                             {folder.description}
                                          </p>
                                       )}
                                    </div>
                                    <button
                                       type="button"
                                       onClick={() => handleDeleteFolder(folder.id)}
                                       disabled={deletingFolderId === folder.id}
                                       className="cursor-pointer rounded-full border border-red-500/40 px-3 py-1.5 text-xs font-medium text-red-300 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50">
                                       {deletingFolderId === folder.id
                                          ? "Deleting..."
                                          : "Delete"}
                                    </button>
                                 </div>
                              </div>
                           ))}
                        </div>
                     )}
                  </section>

                  <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
                     <div className="mb-4 space-y-1">
                        <h2 className="text-xl font-semibold">Decks</h2>
                        <p className="text-sm text-slate-400">
                           Create a new deck or select one to edit its folder,
                           visibility, and premium settings.
                        </p>
                     </div>

                     <form onSubmit={handleCreateDeck} className="grid gap-3">
                        <input
                           value={deckTitle}
                           onChange={(event) => setDeckTitle(event.target.value)}
                           placeholder="Deck title"
                           className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                        />
                        <textarea
                           value={deckDescription}
                           onChange={(event) => setDeckDescription(event.target.value)}
                           placeholder="Deck description"
                           rows={3}
                           className="resize-none rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                        />
                        <select
                           value={deckFolderId}
                           onChange={(event) => setDeckFolderId(event.target.value)}
                           disabled={!deckIsPublic}
                           className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-500 disabled:opacity-50">
                           <option value="">No folder</option>
                           {folders.map((folder) => (
                              <option key={folder.id} value={folder.id}>
                                 {folder.title}
                              </option>
                           ))}
                        </select>
                        <label className="flex items-center gap-3 text-sm text-slate-300">
                           <input
                              type="checkbox"
                              checked={deckIsPublic}
                              onChange={(event) => setDeckIsPublic(event.target.checked)}
                           />
                           Public deck
                        </label>
                        <label className="flex items-center gap-3 text-sm text-slate-300">
                           <input
                              type="checkbox"
                              checked={deckRequiresPremium}
                              onChange={(event) =>
                                 setDeckRequiresPremium(event.target.checked)
                              }
                           />
                           Requires premium
                        </label>
                        <div className="flex flex-wrap gap-3">
                           <button
                              type="submit"
                              disabled={deckSaving}
                              className="cursor-pointer rounded-full bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60">
                              {deckSaving ? "Creating..." : "Create deck"}
                           </button>
                           <button
                              type="button"
                              onClick={() => {
                                 setDeckTitle("");
                                 setDeckDescription("");
                                 setDeckFolderId("");
                                 setDeckIsPublic(true);
                                 setDeckRequiresPremium(false);
                                 setSelectedDeckId("");
                              }}
                              className="cursor-pointer rounded-full border border-slate-700 px-5 py-3 text-sm text-slate-300 transition hover:bg-slate-800">
                              New deck form
                           </button>
                        </div>
                     </form>

                     <div className="mt-6 grid gap-3">
                        {decks.map((deck) => (
                           <div
                              key={deck.id}
                              className={`rounded-2xl border p-4 transition ${
                                 selectedDeckId === deck.id
                                    ? "border-emerald-500 bg-emerald-500/10"
                                    : "border-slate-800 bg-slate-950/60 hover:border-slate-700"
                              }`}>
                              <button
                                 type="button"
                                 onClick={() => setSelectedDeckId(deck.id)}
                                 className="w-full text-left">
                                 <div className="flex items-start justify-between gap-3">
                                    <div>
                                       <p className="font-semibold text-slate-100">
                                          {deck.title}
                                       </p>
                                       {deck.description && (
                                          <p className="mt-1 text-sm text-slate-400">
                                             {deck.description}
                                          </p>
                                       )}
                                    </div>
                                    <span className="text-xs text-slate-500">
                                       {deck.is_public ? "Public" : "Private"}
                                    </span>
                                 </div>
                                 <p className="mt-3 text-xs text-slate-500">
                                    Folder: {deck.folder?.title || "None"} | Premium:{" "}
                                    {deck.requires_premium ? "Yes" : "No"}
                                 </p>
                                 <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                                    <span className="break-all">
                                       Deck ID: {deck.id}
                                    </span>
                                    <button
                                       type="button"
                                       onClick={(event) => {
                                          event.stopPropagation();
                                          handleCopyDeckId(deck.id);
                                       }}
                                       className="cursor-pointer rounded-full border border-slate-700 px-2 py-0.5 text-[10px] text-slate-300 transition hover:bg-slate-800">
                                       {copiedDeckId === deck.id ? "Copied" : "Copy ID"}
                                    </button>
                                 </div>
                              </button>
                              <div className="mt-3 flex justify-end">
                                 <button
                                    type="button"
                                    onClick={() => handleDeleteDeck(deck.id)}
                                    disabled={deletingDeckId === deck.id}
                                    className="cursor-pointer rounded-full border border-red-500/40 px-3 py-1.5 text-xs font-medium text-red-300 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50">
                                    {deletingDeckId === deck.id
                                       ? "Deleting..."
                                       : "Delete deck"}
                                 </button>
                              </div>
                           </div>
                        ))}
                     </div>
                  </section>
               </div>

               <div className="space-y-6">
                  <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
                     <div className="mb-4 space-y-1">
                        <h2 className="text-xl font-semibold">Edit selected deck</h2>
                        <p className="text-sm text-slate-400">
                           {selectedDeck
                              ? `Editing ${selectedDeck.title}.`
                              : "Select a deck from the list first."}
                        </p>
                     </div>

                     <form onSubmit={handleUpdateDeck} className="grid gap-3">
                        <input
                           value={deckTitle}
                           onChange={(event) => setDeckTitle(event.target.value)}
                           disabled={!selectedDeck}
                           placeholder="Deck title"
                           className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-500 disabled:opacity-50"
                        />
                        <textarea
                           value={deckDescription}
                           onChange={(event) => setDeckDescription(event.target.value)}
                           disabled={!selectedDeck}
                           placeholder="Deck description"
                           rows={3}
                           className="resize-none rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-500 disabled:opacity-50"
                        />
                        <select
                           value={deckFolderId}
                           onChange={(event) => setDeckFolderId(event.target.value)}
                           disabled={!selectedDeck || !deckIsPublic}
                           className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-500 disabled:opacity-50">
                           <option value="">No folder</option>
                           {folders.map((folder) => (
                              <option key={folder.id} value={folder.id}>
                                 {folder.title}
                              </option>
                           ))}
                        </select>
                        <label className="flex items-center gap-3 text-sm text-slate-300">
                           <input
                              type="checkbox"
                              checked={deckIsPublic}
                              disabled={!selectedDeck}
                              onChange={(event) => setDeckIsPublic(event.target.checked)}
                           />
                           Public deck
                        </label>
                        <label className="flex items-center gap-3 text-sm text-slate-300">
                           <input
                              type="checkbox"
                              checked={deckRequiresPremium}
                              disabled={!selectedDeck}
                              onChange={(event) =>
                                 setDeckRequiresPremium(event.target.checked)
                              }
                           />
                           Requires premium
                        </label>
                        <button
                           type="submit"
                           disabled={!selectedDeck || deckUpdating}
                           className="cursor-pointer rounded-full border border-emerald-500 px-5 py-3 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-60">
                           {deckUpdating ? "Saving..." : "Save deck changes"}
                        </button>
                     </form>
                  </section>

                  <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
                     <div className="mb-4 space-y-1">
                        <h2 className="text-xl font-semibold">Cards</h2>
                        <p className="text-sm text-slate-400">
                           {selectedDeck
                              ? `Add cards to ${selectedDeck.title}.`
                              : "Select a deck before adding cards."}
                        </p>
                     </div>

                     <form onSubmit={handleCreateCard} className="grid gap-3">
                        <input
                           value={cardFront}
                           onChange={(event) => setCardFront(event.target.value)}
                           disabled={!selectedDeck}
                           placeholder="Word / front"
                           className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-500 disabled:opacity-50"
                        />
                        <textarea
                           value={cardBack}
                           onChange={(event) => setCardBack(event.target.value)}
                           disabled={!selectedDeck}
                           rows={3}
                           placeholder="Definition / back"
                           className="resize-none rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-500 disabled:opacity-50"
                        />
                        <textarea
                           value={cardExample}
                           onChange={(event) => setCardExample(event.target.value)}
                           disabled={!selectedDeck}
                           rows={2}
                           placeholder="Example sentence"
                           className="resize-none rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-500 disabled:opacity-50"
                        />
                        <input
                           value={cardTranscription}
                           onChange={(event) =>
                              setCardTranscription(event.target.value)
                           }
                           disabled={!selectedDeck}
                           placeholder="Transcription"
                           className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-500 disabled:opacity-50"
                        />
                        <button
                           type="submit"
                           disabled={!selectedDeck || cardSaving}
                           className="cursor-pointer rounded-full bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60">
                           {cardSaving ? "Saving..." : "Add card"}
                        </button>
                     </form>

                     <div className="mt-6 space-y-3">
                        {cardsLoading ? (
                           <p className="text-sm text-slate-500">Loading cards...</p>
                        ) : cards.length === 0 ? (
                           <p className="text-sm text-slate-500">
                              No cards in this deck yet.
                           </p>
                        ) : (
                           cards.map((card) => (
                              <div
                                 key={card.id}
                                 className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                                 {editingCardId === card.id && editingCardDraft ? (
                                    <div className="space-y-3">
                                       <input
                                          value={editingCardDraft.front}
                                          onChange={(event) =>
                                             setEditingCardDraft((prev) =>
                                                prev
                                                   ? {
                                                        ...prev,
                                                        front: event.target.value,
                                                     }
                                                   : prev
                                             )
                                          }
                                          className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                                       />
                                       <textarea
                                          value={editingCardDraft.back}
                                          onChange={(event) =>
                                             setEditingCardDraft((prev) =>
                                                prev
                                                   ? {
                                                        ...prev,
                                                        back: event.target.value,
                                                     }
                                                   : prev
                                             )
                                          }
                                          rows={3}
                                          className="w-full resize-none rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                                       />
                                       <textarea
                                          value={editingCardDraft.exampleSentence}
                                          onChange={(event) =>
                                             setEditingCardDraft((prev) =>
                                                prev
                                                   ? {
                                                        ...prev,
                                                        exampleSentence:
                                                           event.target.value,
                                                     }
                                                   : prev
                                             )
                                          }
                                          rows={2}
                                          className="w-full resize-none rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                                       />
                                       <input
                                          value={editingCardDraft.transcription}
                                          onChange={(event) =>
                                             setEditingCardDraft((prev) =>
                                                prev
                                                   ? {
                                                        ...prev,
                                                        transcription:
                                                           event.target.value,
                                                     }
                                                   : prev
                                             )
                                          }
                                          className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                                       />
                                       <div className="flex justify-end gap-2">
                                          <button
                                             type="button"
                                             onClick={cancelEditingCard}
                                             className="cursor-pointer rounded-full border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800">
                                             Cancel
                                          </button>
                                          <button
                                             type="button"
                                             onClick={() => handleSaveCard(card.id)}
                                             disabled={deletingCardId === card.id}
                                             className="cursor-pointer rounded-full border border-emerald-500/40 px-3 py-1.5 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-50">
                                             {deletingCardId === card.id
                                                ? "Saving..."
                                                : "Save"}
                                          </button>
                                       </div>
                                    </div>
                                 ) : (
                                    <>
                                       <div className="flex items-start justify-between gap-3">
                                          <div>
                                             <p className="font-semibold text-slate-100">
                                                {card.front}
                                             </p>
                                             <p className="mt-1 text-sm text-slate-400">
                                                {card.back}
                                             </p>
                                          </div>
                                          {card.transcription && (
                                             <span className="text-xs text-emerald-300">
                                                /{card.transcription}/
                                             </span>
                                          )}
                                       </div>
                                       {card.example_sentence && (
                                          <p className="mt-2 text-xs italic text-slate-500">
                                             {card.example_sentence}
                                          </p>
                                       )}
                                       <div className="mt-3 flex justify-end gap-2">
                                          <button
                                             type="button"
                                             onClick={() => startEditingCard(card)}
                                             className="cursor-pointer rounded-full border border-emerald-500/40 px-3 py-1.5 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/10">
                                             Edit
                                          </button>
                                          <button
                                             type="button"
                                             onClick={() => handleDeleteCard(card.id)}
                                             disabled={deletingCardId === card.id}
                                             className="cursor-pointer rounded-full border border-red-500/40 px-3 py-1.5 text-xs font-medium text-red-300 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50">
                                             {deletingCardId === card.id
                                                ? "Deleting..."
                                                : "Delete"}
                                          </button>
                                       </div>
                                    </>
                                 )}
                              </div>
                           ))
                        )}
                     </div>
                  </section>
               </div>
            </div>
         )}
      </div>
   );
}
