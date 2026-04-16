export type MatchOutcome = "home" | "draw" | "away";

export type User = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  area?: string;
  createdAt: string;
};

export type Match = {
  id: string;
  dateLabel: string;
  dateVisible: boolean;
  startsAt: string;
  homeTeam: string;
  awayTeam: string;
  result?: MatchResult;
};

export type MatchResult = {
  outcome: MatchOutcome;
  homeScore?: number;
  awayScore?: number;
};

export type Prediction = {
  id: string;
  userId: string;
  matchId: string;
  outcome: MatchOutcome;
  homeScore?: number;
  awayScore?: number;
  updatedAt: string;
};

export type Standing = {
  user: User;
  points: number;
  hits: number;
  predictionsCount: number;
};

export type AppData = {
  users: User[];
  matches: Match[];
  predictions: Prediction[];
};
