import { ParsedCommand } from '../types';

/**
 * Natural language command parser for Alexa+-style voice and text commands.
 * Handles single actions, timed executions, and recurrence detection.
 */
export function parseVoiceCommand(text: string): ParsedCommand {
  const normalized = text.trim();
  const lower = normalized.toLowerCase();

  // Detect Action: on vs off
  let action: 'on' | 'off' = 'on';
  if (
    lower.includes('turn off') ||
    lower.includes('switch off') ||
    lower.includes('shut off') ||
    lower.includes('power off') ||
    lower.includes('disable')
  ) {
    action = 'off';
  }

  // Detect Recurrence keywords explicitly spoken by user
  let user_said_recurring = false;
  let recurrence: 'once' | 'daily' | 'weekly' | 'weekdays' = 'once';

  if (lower.includes('every weekday') || lower.includes('on weekdays') || lower.includes('weekdays')) {
    user_said_recurring = true;
    recurrence = 'weekdays';
  } else if (lower.includes('every day') || lower.includes('daily') || lower.includes('each day')) {
    user_said_recurring = true;
    recurrence = 'daily';
  } else if (lower.includes('every week') || lower.includes('weekly') || lower.includes('each week')) {
    user_said_recurring = true;
    recurrence = 'weekly';
  }

  // Detect Timing (e.g., "at 8pm", "at 10:30 am", "at 7", "tomorrow at 9:00")
  let isSchedule = false;
  let when_iso: string | undefined = undefined;
  let timeText: string | undefined = undefined;

  const timeMatch = lower.match(/(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i);
  const hasTomorrow = lower.includes('tomorrow');
  const hasToday = lower.includes('today');
  const hasAt = lower.includes(' at ') || lower.includes('at ');

  if (timeMatch && (hasAt || hasTomorrow || hasToday || user_said_recurring)) {
    isSchedule = true;
    timeText = timeMatch[0].trim();

    // Construct a realistic ISO timestamp for the schedule
    const now = new Date();
    const scheduledDate = new Date(now.getTime());

    if (hasTomorrow) {
      scheduledDate.setDate(scheduledDate.getDate() + 1);
    }

    // Parse hour and minute from time string
    const rawTime = timeMatch[1].toLowerCase();
    let hours = 20; // default 8pm
    let minutes = 0;

    const pm = rawTime.includes('pm');
    const am = rawTime.includes('am');
    const cleanNumbers = rawTime.replace(/(am|pm)/g, '').trim();

    if (cleanNumbers.includes(':')) {
      const parts = cleanNumbers.split(':');
      hours = parseInt(parts[0], 10) || 0;
      minutes = parseInt(parts[1], 10) || 0;
    } else {
      hours = parseInt(cleanNumbers, 10) || 12;
    }

    if (pm && hours < 12) hours += 12;
    if (am && hours === 12) hours = 0;

    scheduledDate.setHours(hours, minutes, 0, 0);

    // If the scheduled time is earlier today and not marked tomorrow, push to tomorrow
    if (!hasTomorrow && !hasToday && scheduledDate.getTime() < now.getTime()) {
      scheduledDate.setDate(scheduledDate.getDate() + 1);
    }

    when_iso = scheduledDate.toISOString();
  }

  // Extract target (e.g. "living room", "kitchen", "office lights", "patio")
  // Strip common command verbs and prepositions
  let targetCandidate = lower
    .replace(/^alexa,\s*/, '')
    .replace(/^please\s*/, '')
    .replace(/turn (on|off)\s+/, '')
    .replace(/switch (on|off)\s+/, '')
    .replace(/power (on|off)\s+/, '')
    .replace(/shut off\s+/, '')
    .replace(/^the\s+/, '');

  // Strip trailing schedule/recurrence clauses
  targetCandidate = targetCandidate
    .replace(/\s+at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?.*$/, '')
    .replace(/\s+tomorrow.*$/, '')
    .replace(/\s+today.*$/, '')
    .replace(/\s+every\s+day.*$/, '')
    .replace(/\s+daily.*$/, '')
    .replace(/\s+weekdays.*$/, '')
    .replace(/\s+weekly.*$/, '')
    .trim();

  // Clean trailing "lights" or "the" if isolated
  let target = targetCandidate || 'living room';
  if (target.startsWith('the ')) {
    target = target.slice(4).trim();
  }

  return {
    action,
    target: target || 'living room',
    isSchedule,
    when_iso,
    timeText,
    recurrence,
    user_said_recurring,
    rawText: normalized,
  };
}
