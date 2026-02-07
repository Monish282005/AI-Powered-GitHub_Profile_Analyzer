import React, { useEffect, useMemo, useRef, useState } from "react";
import styles from "./GithubInputPage.module.css";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts";

const VALIDATION_TIMEOUT = 8000;
const PROFILE_TIMEOUT = 120000;
const AI_TIMEOUT = 150000;
const PIE_COLORS = ["#60a5fa", "#34d399", "#c084fc", "#fbbf24", "#f472b6", "#38bdf8"];

const fetchWithTimeout = async (url, options = {}, timeout = PROFILE_TIMEOUT) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(id);
  }
};

const getResponseError = async (response, fallback) => {
  try {
    const data = await response.clone().json();
    if (typeof data?.error === "string" && data.error.trim()) {
      return data.error;
    }
  } catch (_) {
    // ignore JSON parse issues
  }
  if (response.status === 404) return "GitHub user not found.";
  return fallback;
};

const sanitizeLogEntry = (entry) => {
  if (typeof entry !== "string") return "";
  const withoutCodeBlocks = entry.replace(/```[\s\S]*?```/g, "");
  const colonIndex = withoutCodeBlocks.indexOf(":");
  const trimmed =
    colonIndex > -1 ? withoutCodeBlocks.slice(0, colonIndex) : withoutCodeBlocks;
  return trimmed.replace(/\s+/g, " ").trim();
};

const formatBytes = (bytes = 0) => {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, index);
  return `${value.toFixed(1)} ${units[index]}`;
};

const GithubInputPage = () => {
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [logs, setLogs] = useState([]);
  const [githubData, setGithubData] = useState(null);
  const [aiInsights, setAiInsights] = useState(null);
  const [numericInsights, setNumericInsights] = useState(null);
  const timelineRef = useRef(null);

  const appendLog = (message) => {
    if (!message) return;
    const timestamp = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    setLogs((prev) => [
      ...prev,
      {
        id: `${timestamp}-${prev.length}`,
        time: timestamp,
        message,
      },
    ]);
  };

  const handleAnalyze = async () => {
    if (!username.trim()) {
      setError("Username cannot be empty");
      return;
    }

    setError("");
    setLoading(true);
    setGithubData(null);
    setAiInsights(null);
    setNumericInsights(null);
    setLogs([]);
    appendLog("Kickstarting GitHub profile analysis");

    try {
      appendLog("Requesting repository intelligence from backend");
      const profileRes = await fetchWithTimeout(
        `http://localhost:5000/analyze?user=${username}`,
        {},
        PROFILE_TIMEOUT
      );

      if (!profileRes.ok) {
        let errorMessage = "Failed to fetch GitHub profile data";
        try {
          const errorData = await profileRes.json();
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          errorMessage = await getResponseError(profileRes, errorMessage);
        }
        
        if (profileRes.status === 404) {
          errorMessage = "GitHub user not found. Please check the username.";
        } else if (profileRes.status === 403) {
          errorMessage = "GitHub API rate limit exceeded. Please try again later.";
        }
        
        throw new Error(errorMessage);
      }
      
      const profileData = await profileRes.json();
      setGithubData(profileData);
      appendLog("Repository summary received");

      appendLog("Sending profile summary to AI pipeline");
      const aiRes = await fetchWithTimeout(
        `http://localhost:5000/ai/full-analysis`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profileData }),
        },
        AI_TIMEOUT
      );

      if (!aiRes.ok) {
        const message = await getResponseError(aiRes, "AI analysis failed");
        throw new Error(message);
      }

      const aiResult = await aiRes.json();
      setAiInsights(aiResult.text_analysis || null);
      setNumericInsights(aiResult.numeric_analysis || null);

      if (Array.isArray(aiResult.logs) && aiResult.logs.length > 0) {
        aiResult.logs
          .map(sanitizeLogEntry)
          .filter(Boolean)
          .forEach((entry) => appendLog(entry));
      }
      appendLog("AI pipeline completed successfully");
    } catch (err) {
      console.error(err);
      appendLog("Analysis failed");
      if (err.name === "AbortError") {
        setError("Request timed out. Please try again.");
      } else {
        setError(err.message || "Something went wrong. Try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const languageUsage = githubData?.charts?.languageUsage || [];
  const repoStars = githubData?.charts?.topStars || [];
  const repoContribution = githubData?.charts?.repoContribution || [];
  const activityTimeline = githubData?.charts?.activityTimeline || [];
  const skillCategories = githubData?.skills?.categories || [];

  const aiStrengths = aiInsights?.strengths || aiInsights?.strong_skills || [];
  const aiWeaknesses = aiInsights?.weaknesses || aiInsights?.weak_skills || [];
  const aiSkillGaps = aiInsights?.skill_gaps || [];
  const linkedinPost = aiInsights?.linkedin_post || "";
  const resumeSummary = aiInsights?.resume_summary || "";
  const careerFeedback = aiInsights?.career_feedback || "";
  const careerSuggestions = aiInsights?.career_suggestions || [];

  const derivedCareerActions = useMemo(() => {
    const actions = [];
    if (!numericInsights?.skills) return actions;
    Object.entries(numericInsights.skills).forEach(([skill, score]) => {
      if (score < 50) {
        actions.push(
          `${skill} skills are at ${score}. Focus on targeted projects or courses to lift this metric.`
        );
      }
    });
    return actions.slice(0, 4);
  }, [numericInsights]);

  const renderPieChart = (data) => (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="label" cx="50%" cy="50%" outerRadius={90}>
          {data.map((_, index) => (
            <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
  );

  const renderBarChart = (data, color) => (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="4 4" opacity={0.2} />
        <XAxis dataKey="label" hide={data.length > 6} />
        <YAxis />
        <Tooltip />
        <Bar dataKey="value" fill={color} radius={[8, 8, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );

  const renderLineChart = (data, color) => (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="4 4" opacity={0.2} />
        <XAxis dataKey="label" />
        <YAxis />
        <Tooltip />
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={3} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );

  useEffect(() => {
    if (timelineRef.current) {
      const behavior = logs.length > 1 ? "smooth" : "auto";
      timelineRef.current.scrollTo({
        top: timelineRef.current.scrollHeight,
        behavior,
      });
    }
  }, [logs]);

  return (
    <div className={styles.dashboard}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarInner}>
          <div>
            <p className={styles.sidebarBrand}>GitHub AI Analytics</p>
            <div className={styles.inputGroup}>
              <label className={styles.controlLabel}>GitHub Username</label>
              <input
                type="text"
                placeholder="e.g. torvalds"
                className={styles.controlInput}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
              {error && <p className={styles.errorText}>{error}</p>}
              <button
                className={styles.actionButton}
                onClick={handleAnalyze}
                disabled={loading}
              >
                {loading ? "Analyzing..." : "Generate Dashboard"}
              </button>
            </div>
          </div>

          {logs.length > 0 && (
            <div className={styles.timeline}>
              <div className={styles.timelineHeader}>
                <h3>Analysis Progress</h3>
                <span>{loading ? "Running..." : "Complete"}</span>
              </div>
              <ul className={styles.timelineList} ref={timelineRef}>
                {logs.map((entry) => (
                  <li key={entry.id} className={styles.timelineItem}>
                    <span className={styles.timelineDot} />
                    <div>
                      <p>{entry.message}</p>
                      <span className={styles.timelineMeta}>{entry.time}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </aside>

      <main className={styles.main}>
        {!githubData && (
          <div className={styles.emptyState}>
            <h2>AI-powered GitHub Intelligence</h2>
            <p>
              Run an analysis to visualize language distribution, repo momentum, and personalized
              career feedback powered by AI.
            </p>
          </div>
        )}

        {githubData && (
          <>
            <section className={styles.hero}>
              <div className={styles.heroProfile}>
                <img
                  src={githubData.profile?.avatar_url}
                  alt={githubData.profile?.name}
                  className={styles.profileAvatar}
                />
                <div className={styles.profileDetails}>
                  <h1 className={styles.profileName}>
                    {githubData.profile?.name || githubData.username}
                  </h1>
                  <a
                    href={githubData.profile?.html_url}
                    target="_blank"
                    rel="noreferrer"
                    className={styles.profileBio}
                  >
                    {githubData.profile?.html_url}
                  </a>
                  <p>{githubData.profile?.bio || "No bio available."}</p>
                </div>
              </div>
              {githubData.techStackHighlights?.length > 0 && (
                <div className={styles.heroHighlights}>
                  {githubData.techStackHighlights.map((stack) => (
                    <span key={stack} className={styles.highlightBadge}>
                      {stack}
                    </span>
                  ))}
                </div>
              )}
            </section>

            <section className={styles.metricsGrid}>
              <div className={styles.metricCard}>
                <p className={styles.metricLabel}>Repositories</p>
                <p className={styles.metricValue}>
                  {githubData.metrics?.reposAnalyzed?.toLocaleString() ?? "0"}
                </p>
              </div>
              <div className={styles.metricCard}>
                <p className={styles.metricLabel}>Files Scanned</p>
                <p className={styles.metricValue}>
                  {githubData.metrics?.filesScanned?.toLocaleString() ?? "0"}
                </p>
              </div>
              <div className={styles.metricCard}>
                <p className={styles.metricLabel}>Code Volume</p>
                <p className={styles.metricValue}>
                  {formatBytes(githubData.metrics?.codeVolumeBytes)}
                </p>
              </div>
              <div className={styles.metricCard}>
                <p className={styles.metricLabel}>Stars</p>
                <p className={styles.metricValue}>
                  {githubData.metrics?.totalStars?.toLocaleString() ?? "0"}
                </p>
              </div>
              <div className={styles.metricCard}>
                <p className={styles.metricLabel}>Forks</p>
                <p className={styles.metricValue}>
                  {githubData.metrics?.totalForks?.toLocaleString() ?? "0"}
                </p>
              </div>
              {numericInsights?.overall_score !== undefined && (
                <div className={styles.metricCard}>
                  <p className={styles.metricLabel}>AI Readiness Score</p>
                  <p className={styles.metricValue}>{numericInsights.overall_score}</p>
                </div>
              )}
            </section>

            <section className={styles.chartsGrid}>
              <div className={styles.chartCard}>
                <div className={styles.cardHeader}>
                  <h3>Tech Stack Composition</h3>
                  <span>Top languages in scanned code</span>
                </div>
                {languageUsage.length ? (
                  renderPieChart(languageUsage)
                ) : (
                  <p className={styles.placeholder}>No language data available.</p>
                )}
              </div>

              <div className={styles.chartCard}>
                <div className={styles.cardHeader}>
                  <h3>High-Impact Repositories</h3>
                  <span>Ranked by GitHub stars</span>
                </div>
                {repoStars.length ? (
                  renderBarChart(repoStars, "#7c3aed")
                ) : (
                  <p className={styles.placeholder}>No star data available.</p>
                )}
              </div>

              <div className={styles.chartCard}>
                <div className={styles.cardHeader}>
                  <h3>Code Contribution Footprint</h3>
                  <span>Largest repos by files analyzed</span>
                </div>
                {repoContribution.length ? (
                  renderBarChart(repoContribution, "#14b8a6")
                ) : (
                  <p className={styles.placeholder}>No repo contribution data available.</p>
                )}
              </div>

              <div className={styles.chartCard}>
                <div className={styles.cardHeader}>
                  <h3>Activity Timeline</h3>
                  <span>Recent pushes across repositories</span>
                </div>
                {activityTimeline.length ? (
                  renderLineChart(activityTimeline, "#38bdf8")
                ) : (
                  <p className={styles.placeholder}>No activity timeline available.</p>
                )}
              </div>
            </section>
            <section className={styles.chartsGrid}>
              <div className={styles.chartCard}>
                <div className={styles.cardHeader}>
                  <h3>Skill Categories</h3>
                  <span>Mapped from repo languages</span>
                </div>
                {skillCategories.length ? (
                  renderBarChart(skillCategories, "#f97316")
                ) : (
                  <p className={styles.placeholder}>No data available.</p>
                )}
              </div>
            </section>

            <section className={styles.aiGrid}>
              {linkedinPost && (
                <div className={styles.insightCard}>
                  <h3>LinkedIn Post Summary</h3>
                  <p className={styles.insightBody}>{linkedinPost}</p>
                </div>
              )}
              {resumeSummary && (
                <div className={styles.insightCard}>
                  <h3>Resume Summary</h3>
                  <p className={styles.insightBody}>{resumeSummary}</p>
                </div>
              )}
              {careerFeedback && (
                <div className={styles.insightCard}>
                  <h3>Career Feedback</h3>
                  <p className={styles.insightBody}>{careerFeedback}</p>
                </div>
              )}
              {(aiStrengths.length > 0 || aiWeaknesses.length > 0) && (
                <>
                  <div className={styles.insightCard}>
                    <h3>Strengths</h3>
                    <ul className={styles.list}>
                      {aiStrengths.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div className={styles.insightCard}>
                    <h3>Weaknesses</h3>
                    <ul className={styles.list}>
                      {aiWeaknesses.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
              {aiSkillGaps.length > 0 && (
                <div className={styles.insightCard}>
                  <h3>Skill Gaps</h3>
                  <ul className={styles.list}>
                    {aiSkillGaps.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              {(careerSuggestions.length > 0 || derivedCareerActions.length > 0) && (
                <div className={styles.insightCard}>
                  <h3>Career Feedback System</h3>
                  <ul className={styles.list}>
                    {careerSuggestions.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                    {derivedCareerActions.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
};

export default GithubInputPage;
