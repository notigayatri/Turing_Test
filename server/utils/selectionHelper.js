const Team = require('../models/Team');
const R1Response = require('../models/R1Response');
const Response = require('../models/Response');

async function getCandidateTeams(limit = null, thresholdPercent = null) {
  limit = limit ? Number(limit) : null;
  thresholdPercent = thresholdPercent ? Number(thresholdPercent) : null;

  // Compute R1 Scores
  const r1Responses = await R1Response.find().populate('teamId');
  const r1Scores = {};
  r1Responses.forEach(r => {
    if (!r.teamId) return;
    const tid = r.teamId._id.toString();
    if (!r1Scores[tid]) r1Scores[tid] = 0;
    r1Scores[tid] += r.score || 0;
  });

  // Compute R2 Base Scores (Selection Accuracy)
  const r2Responses = await Response.find().populate('questionId').populate('teamId');
  const r2BaseScores = {};
  r2Responses.forEach(r => {
    if (!r.teamId || !r.questionId) return;
    const tid = r.teamId._id.toString();
    if (!r2BaseScores[tid]) r2BaseScores[tid] = 0;
    
    // R2 correct option points
    const isCorrect = r.selection === r.questionId.correctOption;
    if (isCorrect) {
      r2BaseScores[tid] += 10;
    }
  });

  // Combine R1 and R2 Base
  const allTeamIds = new Set([...Object.keys(r1Scores), ...Object.keys(r2BaseScores)]);
  const teamRankings = [];
  allTeamIds.forEach(tid => {
    const total = (r1Scores[tid] || 0) + (r2BaseScores[tid] || 0);
    teamRankings.push({ teamId: tid, score: total });
  });

  // Sort descending by score
  teamRankings.sort((a, b) => b.score - a.score);

  let numToSelect = limit || teamRankings.length;
  if (thresholdPercent) {
    const percentCount = Math.ceil(teamRankings.length * (thresholdPercent / 100));
    numToSelect = limit ? Math.min(limit, percentCount) : percentCount;
  }

  // Handle ties at the threshold
  if (numToSelect > 0 && numToSelect < teamRankings.length) {
    const cutoffScore = teamRankings[numToSelect - 1].score;
    while (numToSelect < teamRankings.length && teamRankings[numToSelect].score === cutoffScore) {
      numToSelect++;
    }
  }

  const selectedTeams = new Set(teamRankings.slice(0, numToSelect).map(t => t.teamId));
  return selectedTeams;
}

module.exports = { getCandidateTeams };
