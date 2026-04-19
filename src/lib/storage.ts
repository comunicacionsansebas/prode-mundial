"use client";

import { demoData } from "./demoData";
import { argentinaLeagueFixtures } from "./argentinaLeagueFixtures";
import { groupStageFixtures } from "./groupStageFixtures";
import type { AppData, Match, MatchOutcome, Prediction, User } from "./types";

type DbUser = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  area: string | null;
  created_at: string;
};

type DbMatch = {
  id: string;
  date_label: string;
  date_visible: boolean;
  starts_at: string;
  home_team: string;
  away_team: string;
};

type DbResult = {
  match_id: string;
  outcome: MatchOutcome;
  home_score: number | null;
  away_score: number | null;
};

type DbPrediction = {
  id: string;
  user_id: string;
  match_id: string;
  outcome: MatchOutcome;
  home_score: number | null;
  away_score: number | null;
  updated_at: string;
};

const currentUserKey = "prode-mundial-current-user-v1";

function getConfig() {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const url = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}.supabase.co`;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

  if (!rawUrl || !key) {
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
  }

  return { url, key };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { url, key } = getConfig();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...init.headers,
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Supabase respondio con estado ${response.status}.`);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function toUser(user: DbUser): User {
  return {
    id: user.id,
    firstName: user.first_name,
    lastName: user.last_name,
    email: user.email,
    area: user.area ?? undefined,
    createdAt: user.created_at,
  };
}

function toMatch(match: DbMatch, resultsByMatchId: Map<string, DbResult>): Match {
  const result = resultsByMatchId.get(match.id);
  return {
    id: match.id,
    dateLabel: match.date_label,
    dateVisible: match.date_visible,
    startsAt: match.starts_at,
    homeTeam: match.home_team,
    awayTeam: match.away_team,
    result: result
      ? {
          outcome: result.outcome,
          homeScore: result.home_score ?? undefined,
          awayScore: result.away_score ?? undefined,
        }
      : undefined,
  };
}

function toPrediction(prediction: DbPrediction): Prediction {
  return {
    id: prediction.id,
    userId: prediction.user_id,
    matchId: prediction.match_id,
    outcome: prediction.outcome,
    homeScore: prediction.home_score ?? undefined,
    awayScore: prediction.away_score ?? undefined,
    updatedAt: prediction.updated_at,
  };
}

function toDbMatch(match: Match) {
  return {
    date_label: match.dateLabel,
    date_visible: match.dateVisible,
    starts_at: match.startsAt,
    home_team: match.homeTeam,
    away_team: match.awayTeam,
  };
}

export async function getInitialData(): Promise<AppData> {
  const [users, matches, results, predictions] = await Promise.all([
    request<DbUser[]>("users?select=*&order=created_at.asc"),
    request<DbMatch[]>("matches?select=*&order=starts_at.asc"),
    request<DbResult[]>("results?select=*"),
    request<DbPrediction[]>("predictions?select=*&order=updated_at.asc"),
  ]);

  const resultsByMatchId = new Map(results.map((result) => [result.match_id, result]));

  return {
    users: users.map(toUser),
    matches: matches.map((match) => toMatch(match, resultsByMatchId)),
    predictions: predictions.map(toPrediction),
  };
}

export function getCurrentUserId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(currentUserKey);
}

export function setCurrentUserId(userId: string): void {
  window.localStorage.setItem(currentUserKey, userId);
}

export function clearCurrentUserId(): void {
  window.localStorage.removeItem(currentUserKey);
}

export async function registerUser(
  data: AppData,
  input: Omit<User, "id" | "createdAt">,
  authUserId?: string,
): Promise<{ data: AppData; user: User }> {
  const normalizedEmail = input.email.trim().toLowerCase();
  const existing = data.users.find((user) => user.email.toLowerCase() === normalizedEmail);

  if (existing) {
    setCurrentUserId(existing.id);
    return { data, user: existing };
  }

  const [dbUser] = await request<DbUser[]>("users?on_conflict=email", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({
      ...(authUserId ? { id: authUserId } : {}),
      first_name: input.firstName.trim(),
      last_name: input.lastName.trim(),
      email: normalizedEmail,
      area: input.area?.trim() || null,
    }),
  });
  const user = toUser(dbUser);
  setCurrentUserId(user.id);
  return { data: await getInitialData(), user };
}

export async function upsertPrediction(
  _data: AppData,
  userId: string,
  matchId: string,
  homeScore: number,
  awayScore: number,
): Promise<AppData> {
  await request<DbPrediction[]>("predictions?on_conflict=user_id,match_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({
      user_id: userId,
      match_id: matchId,
      outcome: homeScore > awayScore ? "home" : homeScore < awayScore ? "away" : "draw",
      home_score: homeScore,
      away_score: awayScore,
      updated_at: new Date().toISOString(),
    }),
  });

  return getInitialData();
}

export async function updateMatch(_data: AppData, match: Match): Promise<AppData> {
  await request<DbMatch[]>(`matches?id=eq.${match.id}`, {
    method: "PATCH",
    body: JSON.stringify(toDbMatch(match)),
  });

  if (match.result) {
    await request<DbResult[]>("results?on_conflict=match_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({
        match_id: match.id,
        outcome: match.result.outcome,
        home_score: match.result.homeScore ?? null,
        away_score: match.result.awayScore ?? null,
        updated_at: new Date().toISOString(),
      }),
    });
  } else {
    await request<void>(`results?match_id=eq.${match.id}`, { method: "DELETE" });
  }

  return getInitialData();
}

export async function updateMatchResults(matches: Match[]): Promise<AppData> {
  if (!matches.length) return getInitialData();

  await request<DbResult[]>("results?on_conflict=match_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(
      matches
        .filter((match) => match.result)
        .map((match) => ({
          match_id: match.id,
          outcome: match.result?.outcome,
          home_score: match.result?.homeScore ?? null,
          away_score: match.result?.awayScore ?? null,
          updated_at: new Date().toISOString(),
        })),
    ),
  });

  return getInitialData();
}

export async function upsertMatches(matches: Match[]): Promise<AppData> {
  if (!matches.length) return getInitialData();

  const current = await getInitialData();
  const currentByPairAndStart = new Map(
    current.matches.map((match) => [
      `${match.homeTeam.trim().toLowerCase()}|${match.awayTeam.trim().toLowerCase()}|${match.startsAt}`,
      match.id,
    ]),
  );

  const payload = matches.map((match) => {
    const existingId = currentByPairAndStart.get(
      `${match.homeTeam.trim().toLowerCase()}|${match.awayTeam.trim().toLowerCase()}|${match.startsAt}`,
    );
    return {
      id: existingId ?? match.id,
      ...toDbMatch(match),
    };
  });

  await request<DbMatch[]>("matches?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(payload),
  });

  return getInitialData();
}

export async function addDemoMatches(_data: AppData): Promise<AppData> {
  const current = await getInitialData();
  const existing = new Set(current.matches.map((match) => `${match.homeTeam}-${match.awayTeam}-${match.startsAt}`));
  const missing = demoData.matches
    .filter((match) => !existing.has(`${match.homeTeam}-${match.awayTeam}-${match.startsAt}`))
    .map(toDbMatch);

  if (missing.length) {
    await request<DbMatch[]>("matches", {
      method: "POST",
      body: JSON.stringify(missing),
    });
  }

  return getInitialData();
}

async function replaceFixtures(matches: Match[]): Promise<AppData> {
  await request<void>("predictions?id=not.is.null", { method: "DELETE" });
  await request<void>("results?match_id=not.is.null", { method: "DELETE" });
  await request<void>("matches?id=not.is.null", { method: "DELETE" });

  await request<DbMatch[]>("matches", {
    method: "POST",
    body: JSON.stringify(matches.map(toDbMatch)),
  });

  return getInitialData();
}

export async function loadGroupStageFixtures(): Promise<AppData> {
  return replaceFixtures(groupStageFixtures);
}

export async function loadArgentinaLeagueFixtures(): Promise<AppData> {
  return replaceFixtures(argentinaLeagueFixtures);
}

export async function resetDemoData(): Promise<AppData> {
  await request<void>("predictions?id=not.is.null", { method: "DELETE" });
  await request<void>("results?match_id=not.is.null", { method: "DELETE" });
  await request<void>("matches?id=not.is.null", { method: "DELETE" });
  await request<void>("users?id=not.is.null", { method: "DELETE" });

  const insertedUsers = await request<DbUser[]>("users", {
    method: "POST",
    body: JSON.stringify(
      demoData.users.map((user) => ({
        first_name: user.firstName,
        last_name: user.lastName,
        email: user.email,
        area: user.area ?? null,
        created_at: user.createdAt,
      })),
    ),
  });

  const insertedMatches = await request<DbMatch[]>("matches", {
    method: "POST",
    body: JSON.stringify(demoData.matches.map(toDbMatch)),
  });

  const usersByDemoId = new Map(
    demoData.users.map((demoUser) => [
      demoUser.id,
      insertedUsers.find((user) => user.email === demoUser.email)?.id,
    ]),
  );
  const matchesByDemoId = new Map(
    demoData.matches.map((demoMatch) => [
      demoMatch.id,
      insertedMatches.find(
        (match) =>
          match.home_team === demoMatch.homeTeam &&
          match.away_team === demoMatch.awayTeam &&
          match.starts_at === demoMatch.startsAt,
      )?.id,
    ]),
  );

  const predictions = demoData.predictions
    .map((prediction) => ({
      user_id: usersByDemoId.get(prediction.userId),
      match_id: matchesByDemoId.get(prediction.matchId),
      outcome: prediction.outcome,
      updated_at: prediction.updatedAt,
    }))
    .filter((prediction) => prediction.user_id && prediction.match_id);

  if (predictions.length) {
    await request<DbPrediction[]>("predictions", {
      method: "POST",
      body: JSON.stringify(predictions),
    });
  }

  window.localStorage.removeItem(currentUserKey);
  return getInitialData();
}
