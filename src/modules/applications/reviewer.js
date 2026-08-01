import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { GoogleGenAI } from '@google/genai';
import { google } from 'googleapis';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import client from '../../core/client.js';
import { styledEmbed } from '../../core/embeds.js';
import config from '../../core/config.js';

const REVIEWER_REQUIRED_ENV = [
  'DISCORD_CHANNEL_ID',
  'GOOGLE_FORM_ID',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REFRESH_TOKEN',
  'GEMINI_API_KEY'
];

const APPLICATION_EMBED_DESCRIPTION_LIMIT = 3900;

const pollIntervalMs = Number(process.env.POLL_INTERVAL_SECONDS || 60) * 1000;
const applicationPostDelayMs = Number(process.env.APPLICATION_POST_DELAY_SECONDS || 30) * 1000;
const processExistingResponses = process.env.PROCESS_EXISTING_RESPONSES === 'true';
const threadAutoArchiveMinutes = Number(process.env.THREAD_AUTO_ARCHIVE_MINUTES || 1440);
const geminiModel = config.reviewer.geminiModel;
const geminiMaxOutputTokens = config.reviewer.geminiMaxOutputTokens;

const gemini = config.reviewer.enabled ? new GoogleGenAI({ apiKey: config.reviewer.geminiApiKey }) : null;
const oauth2 = config.reviewer.enabled
  ? new google.auth.OAuth2(config.reviewer.googleClientId, config.reviewer.googleClientSecret)
  : null;
if (oauth2) {
  oauth2.setCredentials({ refresh_token: config.reviewer.googleRefreshToken });
}
const forms = oauth2 ? google.forms({ version: 'v1', auth: oauth2 }) : null;

const requiredReviewerChannelPermissions = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.CreatePublicThreads,
  PermissionFlagsBits.SendMessagesInThreads
];

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

globalThis.__HALLOWS_REVIEWER_ENABLED__ = config.reviewer.enabled;

if (!globalThis.__HALLOWS_REVIEWER_STATE__) {
  globalThis.__HALLOWS_REVIEWER_STATE__ = { lastSubmittedTime: null, processedResponseIds: [] };
}
if (globalThis.__HALLOWS_IS_POLLING__ === undefined) {
  globalThis.__HALLOWS_IS_POLLING__ = false;
}
if (globalThis.__HALLOWS_REVIEWER_AUTH_INVALID_LOGGED__ === undefined) {
  globalThis.__HALLOWS_REVIEWER_AUTH_INVALID_LOGGED__ = false;
}

function logDiagnosticPass(feature) {
  console.log(`${feature} = yay`);
}

function logDiagnosticFail(feature, detail) {
  console.warn(`${feature} = no yay (${detail})`);
}

export function isGoogleInvalidGrantError(error) {
  return error?.response?.data?.error === 'invalid_grant' || error?.code === 'invalid_grant';
}

export function googleInvalidGrantMessage() {
  return [
    'Google OAuth refresh token is expired or revoked.',
    'Run `npm run google:auth`, replace GOOGLE_REFRESH_TOKEN with the new value, then restart the bot.'
  ].join(' ');
}

export function reviewerTruncate(text, maxLength) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

export function extractQuestions(items = []) {
  const questions = [];

  for (const item of items) {
    if (item.questionItem?.question?.questionId) {
      questions.push({
        id: item.questionItem.question.questionId,
        title: item.title || item.questionItem.question.questionId
      });
    }

    if (item.questionGroupItem?.questions) {
      for (const question of item.questionGroupItem.questions) {
        if (!question.questionId) continue;
        const rowTitle = question.rowQuestion?.title || question.questionId;
        questions.push({
          id: question.questionId,
          title: item.title ? `${item.title} - ${rowTitle}` : rowTitle
        });
      }
    }
  }

  return questions;
}

export function answerToText(answer) {
  if (!answer) return 'No answer provided.';

  if (answer.textAnswers?.answers?.length) {
    return answer.textAnswers.answers
      .map((entry) => entry.value)
      .filter(Boolean)
      .join(', ') || 'No answer provided.';
  }

  if (answer.fileUploadAnswers?.answers?.length) {
    return answer.fileUploadAnswers.answers
      .map((entry) => entry.fileName || entry.fileId || 'Uploaded file')
      .join(', ');
  }

  return reviewerTruncate(JSON.stringify(answer), 900);
}

export function isDiscordIdQuestion(questionTitle) {
  return (
    /\b(user|discord|account|member)\s*id\b/i.test(questionTitle) ||
    /\bid\b/i.test(questionTitle) && /discord|user|account|member/i.test(questionTitle)
  );
}

export function isDiscordUserId(answer) {
  return /^\d{15,25}$/.test(answer);
}

export function analyzeAnswerQuality(questions, formResponse) {
  const notes = [];

  for (const question of questions) {
    const questionTitle = question.title.toLowerCase();
    const answer = answerToText(formResponse.answers?.[question.id]).trim();

    if (isDiscordIdQuestion(questionTitle)) {
      if (isDiscordUserId(answer)) continue;

      if (answer && answer !== 'No answer provided.') {
        notes.push(`Weakness: "${question.title}" appears to contain a username instead of a numeric Discord user ID. Answer given: "${reviewerTruncate(answer, 120)}".`);
      } else {
        notes.push(`Weakness: "${question.title}" is missing a numeric Discord user ID.`);
      }
    }
  }

  return notes;
}

export function buildApplicationLines(questions, formResponse) {
  return questions.map((question, index) => {
    const answer = answerToText(formResponse.answers?.[question.id]);
    return `**${index + 1}. ${question.title}**\n"${answer}"`;
  });
}

export function splitTextForEmbedDescription(text) {
  const chunks = [];
  let remaining = text;

  while (remaining.length > APPLICATION_EMBED_DESCRIPTION_LIMIT) {
    const splitAt = remaining.lastIndexOf('\n', APPLICATION_EMBED_DESCRIPTION_LIMIT);
    const end = splitAt > 500 ? splitAt : APPLICATION_EMBED_DESCRIPTION_LIMIT;
    chunks.push(remaining.slice(0, end));
    remaining = remaining.slice(end).trimStart();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

export function buildApplicationEmbeds(lines, formResponse) {
  const chunks = [];
  let chunk = '';

  for (const line of lines) {
    const lineChunks = splitTextForEmbedDescription(line);

    for (const lineChunk of lineChunks) {
      const next = chunk ? `${chunk}\n\n${lineChunk}` : lineChunk;
      if (next.length > APPLICATION_EMBED_DESCRIPTION_LIMIT) {
        if (chunk) chunks.push(chunk);
        chunk = lineChunk;
      } else {
        chunk = next;
      }
    }
  }

  if (chunk) chunks.push(chunk);

  return chunks.map((description, index) => {
    const title = chunks.length > 1
      ? `New Application (${index + 1}/${chunks.length})`
      : 'New Application';

    return new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(config.style.color)
      .setFooter({ text: `Response ID: ${applicationResponseKey(formResponse)}` })
      .setTimestamp(new Date(formResponse.lastSubmittedTime || formResponse.createTime));
  });
}

export function applicationResponseKey(formResponse) {
  if (formResponse.responseId) return formResponse.responseId;

  const submittedAt = formResponse.lastSubmittedTime || formResponse.createTime || 'unknown-time';
  return [
    'missing-response-id',
    submittedAt,
    JSON.stringify(formResponse.answers || {})
  ].join(':');
}

export function findApplicantName(questions, formResponse) {
  const nameQuestion = questions.find((question) => /name|username|discord/i.test(question.title));
  if (!nameQuestion) return 'New Applicant';

  return reviewerTruncate(answerToText(formResponse.answers?.[nameQuestion.id]).replaceAll('\n', ' '), 70);
}

export async function createAiOpinion(lines, qualityNotes = []) {
  if (!gemini) throw new Error('Gemini is not configured.');

  const applicationText = lines.join('\n\n');
  const qualityText = qualityNotes.length
    ? qualityNotes.map((note) => `- ${note}`).join('\n')
    : '- No automatic answer-quality notes were detected.';

  const response = await gemini.models.generateContent({
    model: geminiModel,
    contents: [
      'You are reviewing a Discord staff application.',
      'Write a useful review for human moderators, not a one-sentence answer.',
      'Use the automatic answer-quality notes as important context.',
      'If a note says an answer is a weakness, include that issue under "Weaknesses of this application".',
      'Use exactly these three section headings and no other headings:',
      'Strengths of this application',
      'Weaknesses of this application',
      'Recommended choice of action',
      'Under strengths, write exactly 3 short bullet points.',
      'Under weaknesses, write exactly 3 short bullet points. If there are no major weaknesses, mention what information is still missing.',
      'Under recommended choice of action, write exactly 2 complete sentences and include one clear final choice: Hire, Interview, or Deny.',
      'Keep the full response under 220 words.',
      'Keep every sentence complete.',
      'Be fair and specific. Do not claim certainty.',
      '',
      'Automatic answer-quality notes:',
      qualityText,
      '',
      'Review this application:',
      '',
      applicationText
    ].join('\n'),
    config: {
      maxOutputTokens: geminiMaxOutputTokens,
      temperature: 0.2
    }
  });

  const finishReason = response.candidates?.[0]?.finishReason;
  if (finishReason && finishReason !== 'STOP') {
    console.warn(`Gemini finished with reason: ${finishReason}`);
  }

  const text = response.text?.trim();
  if (!text) return 'AI review did not return any text.';

  if (finishReason === 'MAX_TOKENS') {
    return `${text}\n\nNote: Gemini hit the configured output limit. Increase GEMINI_MAX_OUTPUT_TOKENS if this happens repeatedly.`;
  }

  return text;
}

export async function fetchFormAndResponses() {
  if (!forms) throw new Error('Google Forms is not configured.');

  const [formResult, responsesResult] = await Promise.all([
    forms.forms.get({ formId: config.reviewer.formId }),
    forms.forms.responses.list({
      formId: config.reviewer.formId,
      pageSize: 100
    })
  ]);

  const questions = extractQuestions(formResult.data.items);
  const responses = responsesResult.data.responses || [];
  responses.sort((a, b) => {
    const aTime = new Date(a.lastSubmittedTime || a.createTime).getTime();
    const bTime = new Date(b.lastSubmittedTime || b.createTime).getTime();
    return aTime - bTime;
  });

  return { questions, responses };
}

export async function sendLongThreadMessage(thread, text) {
  const chunks = [];
  let remaining = text;

  while (remaining.length > 1900) {
    const splitAt = remaining.lastIndexOf('\n', 1900);
    const end = splitAt > 500 ? splitAt : 1900;
    chunks.push(remaining.slice(0, end));
    remaining = remaining.slice(end).trimStart();
  }

  if (remaining) chunks.push(remaining);

  for (const chunk of chunks) {
    await thread.send(chunk);
  }
}

export async function postApplication(channel, questions, formResponse) {
  const lines = buildApplicationLines(questions, formResponse);
  const qualityNotes = analyzeAnswerQuality(questions, formResponse);
  const embeds = buildApplicationEmbeds(lines, formResponse);
  let message = null;

  for (const embed of embeds) {
    const sentMessage = await channel.send({ embeds: [embed] });
    if (!message) message = sentMessage;
  }

  if (!message) {
    message = await channel.send('New application received, but no supported answers were found.');
  }

  try {
    const applicantName = findApplicantName(questions, formResponse);
    const thread = await message.startThread({
      name: reviewerTruncate(`Application - ${applicantName}`, 100),
      autoArchiveDuration: threadAutoArchiveMinutes,
      reason: 'New Google Form application received'
    });

    const opinion = await createAiOpinion(lines, qualityNotes);
    await sendLongThreadMessage(thread, `**AI opinion**\n${opinion}`);
  } catch (error) {
    console.error(`Application response ${applicationResponseKey(formResponse)} was posted, but the review thread failed:`, error);
  }
}

export async function loadReviewerState() {
  if (!existsSync(config.paths.reviewerStateFile)) {
    globalThis.__HALLOWS_REVIEWER_STATE__ = { lastSubmittedTime: null, processedResponseIds: [] };
    await saveReviewerState();
    console.log(processExistingResponses
      ? 'Reviewer state initialized: existing responses will be processed.'
      : 'Reviewer state initialized: existing responses will be marked as seen.');
    return;
  }

  const raw = await fs.readFile(config.paths.reviewerStateFile, 'utf8');
  globalThis.__HALLOWS_REVIEWER_STATE__ = { ...globalThis.__HALLOWS_REVIEWER_STATE__, ...JSON.parse(raw) };
  console.log(`Loaded reviewer state with ${globalThis.__HALLOWS_REVIEWER_STATE__.processedResponseIds.length} processed response(s).`);
}

export async function saveReviewerState() {
  const nextState = {
    ...globalThis.__HALLOWS_REVIEWER_STATE__,
    processedResponseIds: globalThis.__HALLOWS_REVIEWER_STATE__.processedResponseIds.slice(-500)
  };
  await fs.mkdir('./data', { recursive: true });
  await fs.writeFile(config.paths.reviewerStateFile, `${JSON.stringify(nextState, null, 2)}\n`);
}

globalThis.__HALLOWS_SAVE_REVIEWER_STATE__ = saveReviewerState;

export async function checkForNewApplications({ markExistingOnFirstRun = false } = {}) {
  if (!config.reviewer.enabled) {
    throw new Error('Application reviewer is not configured.');
  }

  const channel = await client.channels.fetch(config.reviewer.channelId);
  if (!channel?.isTextBased() || !channel.send) {
    throw new Error('DISCORD_CHANNEL_ID must point to a text channel where the bot can send messages.');
  }

  const { questions, responses } = await fetchFormAndResponses();
  const processedResponseIds = new Set(globalThis.__HALLOWS_REVIEWER_STATE__.processedResponseIds);
  const newResponses = responses.filter((response) => !processedResponseIds.has(applicationResponseKey(response)));
  console.log(`Application poll complete: found ${responses.length} response(s), ${newResponses.length} new.`);

  if (
    markExistingOnFirstRun &&
    !processExistingResponses &&
    !globalThis.__HALLOWS_REVIEWER_STATE__.lastSubmittedTime &&
    globalThis.__HALLOWS_REVIEWER_STATE__.processedResponseIds.length === 0
  ) {
    globalThis.__HALLOWS_REVIEWER_STATE__.processedResponseIds = responses.map((response) => applicationResponseKey(response));
    globalThis.__HALLOWS_REVIEWER_STATE__.lastSubmittedTime = responses.at(-1)?.lastSubmittedTime || responses.at(-1)?.createTime || new Date().toISOString();
    await saveReviewerState();
    console.log(`Marked ${responses.length} existing application response(s) as seen.`);
    return {
      found: responses.length,
      new: 0,
      posted: 0,
      markedExisting: responses.length
    };
  }

  let posted = 0;
  for (const response of newResponses) {
    if (posted > 0 && applicationPostDelayMs > 0) {
      console.log(`Waiting ${applicationPostDelayMs / 1000} second(s) before posting the next application.`);
      await sleep(applicationPostDelayMs);
    }

    const responseKey = applicationResponseKey(response);
    console.log(`Posting application response ${responseKey}.`);
    await postApplication(channel, questions, response);

    globalThis.__HALLOWS_REVIEWER_STATE__.processedResponseIds.push(responseKey);
    globalThis.__HALLOWS_REVIEWER_STATE__.lastSubmittedTime = response.lastSubmittedTime || response.createTime || new Date().toISOString();
    await saveReviewerState();
    posted += 1;
  }

  return {
    found: responses.length,
    new: newResponses.length,
    posted,
    markedExisting: 0
  };
}

export async function pollApplications() {
  if (!config.reviewer.enabled || globalThis.__HALLOWS_IS_POLLING__) return;
  globalThis.__HALLOWS_IS_POLLING__ = true;

  try {
    await checkForNewApplications({ markExistingOnFirstRun: true });
  } catch (error) {
    if (isGoogleInvalidGrantError(error)) {
      if (!globalThis.__HALLOWS_REVIEWER_AUTH_INVALID_LOGGED__) {
        console.error(`Application polling failed: ${googleInvalidGrantMessage()}`);
        globalThis.__HALLOWS_REVIEWER_AUTH_INVALID_LOGGED__ = true;
      }
    } else {
      console.error('Application polling failed:', error);
    }
  } finally {
    globalThis.__HALLOWS_IS_POLLING__ = false;
  }
}

export async function runReviewerStartupDiagnostics() {
  for (const key of REVIEWER_REQUIRED_ENV) {
    if (process.env[key]) {
      logDiagnosticPass(`reviewer env ${key}`);
    } else {
      logDiagnosticFail(`reviewer env ${key}`, 'missing');
    }
  }

  if (!config.reviewer.enabled) {
    logDiagnosticFail('application reviewer', 'missing reviewer environment values');
    return;
  }

  try {
    await saveReviewerState();
    await fs.access(config.paths.reviewerStateFile);
    logDiagnosticPass(`reviewer state storage ${config.paths.reviewerStateFile}`);
  } catch (error) {
    logDiagnosticFail(`reviewer state storage ${config.paths.reviewerStateFile}`, error.message);
  }

  try {
    const channel = await client.channels.fetch(config.reviewer.channelId);
    if (!channel?.isTextBased() || !channel.send) {
      throw new Error('DISCORD_CHANNEL_ID is not a sendable text channel');
    }

    const permissions = channel.guild ? channel.permissionsFor(client.user.id) : null;
    const missingPermissions = requiredReviewerChannelPermissions.filter((permission) => !permissions?.has(permission));
    if (missingPermissions.length) {
      throw new Error(`missing ${missingPermissions.length} required channel permission(s)`);
    }

    logDiagnosticPass(`reviewer Discord channel #${channel.name}`);
  } catch (error) {
    logDiagnosticFail('reviewer Discord channel', error.message);
  }

  try {
    const { questions } = await fetchFormAndResponses();
    if (!questions.length) {
      throw new Error('form was found, but no supported questions were detected');
    }
    logDiagnosticPass(`reviewer Google Form ${questions.length} questions`);
  } catch (error) {
    logDiagnosticFail('reviewer Google Form', isGoogleInvalidGrantError(error) ? googleInvalidGrantMessage() : error.message);
  }

  try {
    const aiCheck = await createAiOpinion([
      '1. name\n"Test Applicant"',
      '2. why do you want to be mod\n"I want to help the community."'
    ], []);

    if (!aiCheck) throw new Error('no AI review text returned');
    logDiagnosticPass(`reviewer Gemini ${geminiModel}`);
  } catch (error) {
    logDiagnosticFail('reviewer Gemini', error.message);
  }
}

export async function sendApplicationDecisionLog({ action, targetUser, moderator }) {
  if (!process.env.TRANSCRIPT_CHANNEL_ID) return;

  const logChannel = await client.channels.fetch(process.env.TRANSCRIPT_CHANNEL_ID).catch(() => null);
  if (!logChannel?.isTextBased() || !logChannel.send) return;

  await logChannel.send({
    embeds: [
      styledEmbed(
        `Application ${action}`,
        [
          `**Applicant:** ${targetUser.tag} (\`${targetUser.id}\`)`,
          `**Handled By:** ${moderator.tag} (\`${moderator.id}\`)`
        ].join('\n')
      )
    ],
    allowedMentions: { parse: [] }
  }).catch(() => null);
}
