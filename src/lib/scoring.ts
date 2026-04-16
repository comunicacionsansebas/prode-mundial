import type { AppData, Match, MatchOutcome, Prediction, Standing, User } from "./types";

export const outcomeLabels: Record<MatchOutcome, string> = {
  home: "Gana local",
  draw: "Empate",
  away: "Gana visitante",
};

export function getOutcomeFromScore(homeScore: number, awayScore: number): MatchOutcome {
  if (homeScore > awayScore) return "home";
  if (homeScore < awayScore) return "away";
  return "draw";
}

export function isMatchClosed(match: Match, now = new Date()): boolean {
  const closesAt = new Date(match.startsAt).getTime() - 60_000;
  return closesAt <= now.getTime();
}

export function scorePrediction(prediction: Prediction, match: Match): number {
  if (!match.result) return 0;
  const predictedBothScores =
    prediction.homeScore !== undefined &&
    prediction.awayScore !== undefined &&
    match.result.homeScore !== undefined &&
    match.result.awayScore !== undefined;

  if (
    predictedBothScores &&
    prediction.homeScore === match.result.homeScore &&
    prediction.awayScore === match.result.awayScore
  ) {
    return 12;
  }

  const outcomePoints = prediction.outcome === match.result.outcome ? 5 : 0;
  const homeScorePoints =
    prediction.homeScore !== undefined &&
    match.result.homeScore !== undefined &&
    prediction.homeScore === match.result.homeScore
      ? 2
      : 0;
  const awayScorePoints =
    prediction.awayScore !== undefined &&
    match.result.awayScore !== undefined &&
    prediction.awayScore === match.result.awayScore
      ? 2
      : 0;

  return outcomePoints + homeScorePoints + awayScorePoints;
}

export function calculateStandings(data: AppData): Standing[] {
  const matchesById = new Map(data.matches.map((match) => [match.id, match]));

  return data.users
    .map((user) => {
      const userPredictions = data.predictions.filter((prediction) => prediction.userId === user.id);
      const points = userPredictions.reduce((total, prediction) => {
        const match = matchesById.get(prediction.matchId);
        return match ? total + scorePrediction(prediction, match) : total;
      }, 0);
      const hits = userPredictions.filter((prediction) => {
        const match = matchesById.get(prediction.matchId);
        return match?.result && prediction.outcome === match.result.outcome;
      }).length;

      return {
        user,
        points,
        hits,
        predictionsCount: userPredictions.length,
      };
    })
    .sort((a, b) => b.points - a.points || b.hits - a.hits || getUserName(a.user).localeCompare(getUserName(b.user)));
}

export function getUserName(user: User): string {
  return `${user.firstName} ${user.lastName}`.trim();
}
