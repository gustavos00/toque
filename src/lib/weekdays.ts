// Weekday helpers (ISO: 1 = Monday … 7 = Sunday), Portuguese wording.

export const WEEKDAYS = [
  { day: 1, short: "S", name: "segunda", plural: "segundas" },
  { day: 2, short: "T", name: "terça", plural: "terças" },
  { day: 3, short: "Q", name: "quarta", plural: "quartas" },
  { day: 4, short: "Q", name: "quinta", plural: "quintas" },
  { day: 5, short: "S", name: "sexta", plural: "sextas" },
  { day: 6, short: "S", name: "sábado", plural: "sábados" },
  { day: 7, short: "D", name: "domingo", plural: "domingos" },
] as const;

function joinWithE(items: string[]) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} e ${items.at(-1)}`;
}

/** "Todos os dias", "Todas as segundas e quintas", "Todos os sábados e domingos"… */
export function formatWeekdaySummary(weekdays: readonly number[]) {
  const days = [...new Set(weekdays)].sort();
  if (days.length === 0) return "Escolhe pelo menos um dia";
  if (days.length === 7) return "Todos os dias";
  if (days.join() === "1,2,3,4,5") return "Todos os dias úteis";
  if (days.join() === "6,7") return "Todos os fins de semana";
  const feminine = days.filter((day) => day <= 5).map((day) => WEEKDAYS[day - 1].plural);
  const masculine = days.filter((day) => day >= 6).map((day) => WEEKDAYS[day - 1].plural);
  if (masculine.length === 0) return `Todas as ${joinWithE(feminine)}`;
  if (feminine.length === 0) return `Todos os ${joinWithE(masculine)}`;
  return `Todas as ${joinWithE(feminine)}, e todos os ${joinWithE(masculine)}`;
}

/** Weekday name ("terça") of a "YYYY-MM-DD" local date. */
export function getWeekdayName(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return WEEKDAYS[(weekday + 6) % 7].name;
}
