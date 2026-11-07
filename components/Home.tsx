"use client";

/**
 * Gallery-forward home page: create entry, your saved worlds, and community grid.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import { motion } from "framer-motion";
import { ArrowRight, Globe, Lock, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";
import { World } from "@/components/World";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { BrandBanner } from "@/components/BrandBanner";
import { HomePageSkeleton } from "@/components/HomePageSkeleton";
import { MAX_CREATE_IDEA_LENGTH } from "@/lib/constants";
import type { GameListItem, ProfileResponse, VoteTally, VoteValue, WorldVisibility } from "@/lib/types/client";

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/** Authenticated JSON fetch with consistent error handling. */
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
  return data as T;
}

/** Default post-login landing: create CTA, owned worlds, and public gallery. */
export function Home() {
  const router = useRouter();
  const [idea, setIdea] = useState("");
  const [games, setGames] = useState<GameListItem[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [creatingIdea, setCreatingIdea] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  /** Loads the gallery and quota. State is set only in the promise callbacks, so mount can call it. */
  const refresh = useCallback(
    () =>
      Promise.all([
        request<GameListItem[]>("/api/games"),
        request<ProfileResponse>("/api/profile"),
      ])
        .then(([gameList, profile]) => {
          setUserId(profile.userId);
          posthog.identify(profile.userId);
          setGames(gameList);
          setCanCreate(profile.generation.canCreate);
        })
        .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load gallery."))
        .finally(() => setLoading(false)),
    []
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const mine = userId ? games.filter((g) => g.owner === userId) : [];
  // Best-liked community worlds first; ties keep the newest-first order from the API.
  const gallery = (userId ? games.filter((g) => g.owner !== userId) : games)
    .map((g, i) => ({ g, i }))
    .sort((a, b) => b.g.votes.up - b.g.votes.down - (a.g.votes.up - a.g.votes.down) || a.i - b.i)
    .map(({ g }) => g);

  const patchGame = (id: string, change: Partial<GameListItem>) =>
    setGames((list) => list.map((g) => (g.id === id ? { ...g, ...change } : g)));

  /** Owner flips a world between the public gallery and private (only they can open it). */
  const setVisibility = async (game: GameListItem, visibility: WorldVisibility) => {
    patchGame(game.id, { visibility });
    try {
      await request(`/api/games/${game.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility }),
      });
      posthog.capture("world_visibility_changed", { game_id: game.id, visibility });
    } catch (e) {
      patchGame(game.id, { visibility: game.visibility });
      setError(e instanceof Error ? e.message : "Could not change visibility.");
    }
  };

  /** Like or dislike a community world; clicking your current vote again withdraws it. */
  const vote = async (game: GameListItem, pressed: 1 | -1) => {
    const value: VoteValue = game.votes.mine === pressed ? 0 : pressed;
    const { up, down, mine: was } = game.votes;
    // Optimistic: move this human's single vote, then trust the server's tally.
    patchGame(game.id, {
      votes: {
        up: up - (was === 1 ? 1 : 0) + (value === 1 ? 1 : 0),
        down: down - (was === -1 ? 1 : 0) + (value === -1 ? 1 : 0),
        mine: value,
      },
    });
    try {
      const votes = await request<VoteTally>(`/api/games/${game.id}/vote`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
      patchGame(game.id, { votes });
      posthog.capture("world_voted", { game_id: game.id, value });
    } catch (e) {
      patchGame(game.id, { votes: game.votes });
      setError(e instanceof Error ? e.message : "Could not save your vote.");
    }
  };

  const startCreate = () => {
    if (!canCreate) return;
    const text = idea.trim();
    if (!text) return;
    posthog.capture("world_create_started", { idea_length: text.length });
    setCreatingIdea(text);
  };

  const signOut = async () => {
    setSigningOut(true);
    posthog.capture("user_signed_out");
    posthog.reset();
    await fetch("/api/session", { method: "DELETE" });
    router.push("/login");
    router.refresh();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/games/${deleteTarget}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Delete failed.");
      }
      posthog.capture("own_world_delete_confirmed", { game_id: deleteTarget });
      setDeleteTarget(null);
      setLoading(true);
      setError(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
      setDeleteTarget(null);
    }
  };

  if (creatingIdea) {
    return <World mode="create" initialIdea={creatingIdea} />;
  }

  return (
    <div className="mx-auto min-h-dvh max-w-5xl px-6 py-14 md:py-24">
      <motion.header
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE_OUT }}
        className="mb-12 border-b-2 border-border pb-6"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <p className="text-xs font-bold uppercase tracking-widest text-main">
            Community gallery · saved worlds
          </p>
          <Button
            type="button"
            variant="noShadow"
            className="h-auto shrink-0 bg-transparent p-0 text-xs font-bold uppercase tracking-widest text-inksoft hover:translate-x-0 hover:translate-y-0 hover:shadow-shadow hover:text-foreground"
            onClick={signOut}
            disabled={signingOut}
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </Button>
        </div>
        <BrandBanner className="mt-2" />
                    <p className="mt-4 max-w-lg text-lg font-semibold text-foreground">
              Play worlds others have built!
            </p>
      </motion.header>

      {error && (
        <Alert variant="destructive" className="mb-8">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <HomePageSkeleton />
      ) : (
        <>
          {mine.length > 0 && (
            <section className="mb-14">
              <p className="mb-1 text-xs font-bold uppercase tracking-widest text-inksoft">
                Your world{mine.length > 1 ? "s" : ""}
              </p>
              <ul>
                {mine.map((game, i) => (
                  <motion.li
                    key={game.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.4,
                      delay: 0.1 + i * 0.05,
                      ease: EASE_OUT,
                    }}
                  >
                    <div className="group flex w-full items-center gap-4 border-t-2 border-border py-4">
                      <div className="h-14 w-20 shrink-0 overflow-hidden rounded-base border-2 border-border bg-foreground/10">
                        {game.thumbnailUrl ? (
                          <img
                            src={game.thumbnailUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs font-bold text-inksoft">
                            …
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h2 className="font-display text-lg font-bold text-foreground">
                          {game.title}
                        </h2>
                        <p className="text-xs font-medium text-inksoft">
                          {new Date(game.createdAt).toLocaleDateString()}
                          {game.visibility === "public" &&
                            ` · ${game.votes.up} like${game.votes.up === 1 ? "" : "s"} · ${game.votes.down} dislike${game.votes.down === 1 ? "" : "s"}`}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="neutral"
                        size="sm"
                        className="shrink-0"
                        aria-pressed={game.visibility === "private"}
                        onClick={() => setVisibility(game, game.visibility === "public" ? "private" : "public")}
                        title={game.visibility === "public" ? "Public: anyone can play. Click to make private." : "Private: only you can open it. Click to make public."}
                      >
                        {game.visibility === "public" ? <Globe size={14} /> : <Lock size={14} />}
                        {game.visibility === "public" ? "Public" : "Private"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          posthog.capture("own_world_continued", { game_id: game.id });
                          router.push(`/play/${game.id}`);
                        }}
                      >
                        Continue
                      </Button>
                      <Button
                        type="button"
                        variant="neutral"
                        size="icon"
                        className="shrink-0 text-inksoft hover:text-health"
                        onClick={() => setDeleteTarget(game.id)}
                        title="Delete world"
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </motion.li>
                ))}
              </ul>
            </section>
          )}

          <section className="mb-14">
            <p className="mb-4 text-xs font-bold uppercase tracking-widest text-inksoft">
              Community worlds
            </p>
            {gallery.length === 0 ? (
              <p className="text-sm font-medium text-inksoft">
                {canCreate
                  ? "No community worlds yet — be the first to build one."
                  : "No community worlds yet."}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4">
                {gallery.map((game, i) => (
                  <motion.div
                    key={game.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.4,
                      delay: 0.12 + i * 0.04,
                      ease: EASE_OUT,
                    }}
                    className="flex flex-col gap-1.5"
                  >
                  <button
                    type="button"
                    onClick={() => {
                      posthog.capture("community_world_opened", { game_id: game.id });
                      router.push(`/play/${game.id}`);
                    }}
                    className="group relative aspect-4/3 overflow-hidden rounded-base border-2 border-border text-left shadow-shadow transition hover:translate-x-boxShadowX hover:translate-y-boxShadowY hover:shadow-none"
                  >
                    {game.thumbnailUrl ? (
                      <img
                        src={game.thumbnailUrl}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="absolute inset-0 bg-foreground/10" />
                    )}
                    <div className="absolute inset-0 bg-linear-to-t from-ink/90 via-ink/30 to-transparent" />
                    <p className="absolute inset-x-0 bottom-0 px-3 pb-3 font-display text-sm font-bold text-white">
                      {game.title}
                    </p>
                  </button>
                  <div className="flex items-center gap-1.5" role="group" aria-label={`Vote on ${game.title}`}>
                    {([1, -1] as const).map((value) => {
                      const on = game.votes.mine === value;
                      const Icon = value === 1 ? ThumbsUp : ThumbsDown;
                      const count = value === 1 ? game.votes.up : game.votes.down;
                      return (
                        <Button
                          key={value}
                          type="button"
                          size="sm"
                          variant={on ? "default" : "neutral"}
                          aria-pressed={on}
                          aria-label={`${value === 1 ? "Like" : "Dislike"} ${game.title}`}
                          className="h-8 gap-1 px-2 text-xs"
                          onClick={() => vote(game, value)}
                        >
                          <Icon size={13} />
                          {count}
                        </Button>
                      );
                    })}
                  </div>
                  </motion.div>
                ))}
              </div>
            )}
          </section>

          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.06, ease: EASE_OUT }}
          >
            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-inksoft">
              Create
            </p>
            <Card className={canCreate ? undefined : "opacity-60"}>
              <CardContent>
                <Textarea
                  value={idea}
                  onChange={(e) => setIdea(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey))
                      startCreate();
                  }}
                  maxLength={MAX_CREATE_IDEA_LENGTH}
                  rows={3}
                  disabled={!canCreate}
                  placeholder={
                    canCreate
                      ? "e.g. A rain-flooded night market in Mumbai. I'm a courier carrying a sealed tiffin box someone will kill for…"
                      : "Creating new worlds is currently unavailable. We are working on ramping up capacity and will be available soon!"
                  }
                  className="resize-none"
                />
              </CardContent>
              <CardFooter className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-[11px] font-medium text-inksoft/70">
                  {canCreate ? "⌘↵ to build" : "Gallery-only for now"}
                </span>
                <Button onClick={startCreate} disabled={!canCreate || !idea.trim()}>
                  Build a new world
                  <ArrowRight size={15} />
                </Button>
              </CardFooter>
            </Card>
          </motion.section>
        </>
      )}

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this world?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
