export interface StreakResult {
  streak: number;
  completedToday: boolean;
  isNewDayIncrement: boolean;
  totalSessions: number;
}

function getLocalDateString(d = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDayDifference(prevDateStr: string, todayDateStr: string): number {
  try {
    const [y1, m1, d1] = prevDateStr.split("-").map(Number);
    const [y2, m2, d2] = todayDateStr.split("-").map(Number);
    const date1 = new Date(y1, m1 - 1, d1);
    const date2 = new Date(y2, m2 - 1, d2);
    return Math.round((date2.getTime() - date1.getTime()) / (1000 * 60 * 60 * 24));
  } catch {
    return 2;
  }
}

export function recordStillnessSession(): StreakResult {
  const today = getLocalDateString();
  let streak = 1;
  let isNewDayIncrement = true;
  let totalSessions = 1;

  try {
    const storedStreak = localStorage.getItem("mochi_streak_count");
    const storedLastDate = localStorage.getItem("mochi_streak_last_date");
    const storedTotal = localStorage.getItem("mochi_total_sessions");

    totalSessions = (storedTotal ? parseInt(storedTotal, 10) : 0) + 1;
    localStorage.setItem("mochi_total_sessions", String(totalSessions));

    if (storedLastDate && storedStreak) {
      const currentStreakVal = parseInt(storedStreak, 10) || 1;
      const diffDays = getDayDifference(storedLastDate, today);

      if (diffDays === 0) {
        streak = currentStreakVal;
        isNewDayIncrement = false;
      } else if (diffDays === 1) {
        streak = currentStreakVal + 1;
        isNewDayIncrement = true;
        localStorage.setItem("mochi_streak_count", String(streak));
        localStorage.setItem("mochi_streak_last_date", today);
      } else {
        streak = 1;
        isNewDayIncrement = true;
        localStorage.setItem("mochi_streak_count", "1");
        localStorage.setItem("mochi_streak_last_date", today);
      }
    } else {
      streak = 1;
      isNewDayIncrement = true;
      localStorage.setItem("mochi_streak_count", "1");
      localStorage.setItem("mochi_streak_last_date", today);
    }
  } catch {
    streak = 1;
  }

  return {
    streak,
    completedToday: true,
    isNewDayIncrement,
    totalSessions,
  };
}
