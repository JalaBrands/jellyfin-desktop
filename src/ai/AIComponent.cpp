#include "AIComponent.h"

#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QRegularExpression>
#include <QDebug>
#include <algorithm>
#include <random>
#include <numeric>

#include "settings/SettingsComponent.h"

#define SETTINGS_SECTION_AI "ai"

AIComponent::AIComponent(QObject* parent)
  : ComponentBase(parent), m_nam(new QNetworkAccessManager(this))
{
}

bool AIComponent::componentInitialize()
{
  return true;
}

QString AIComponent::apiKey() const
{
  return SettingsComponent::Get().value(SETTINGS_SECTION_AI, "openai_api_key").toString().trimmed();
}

QString AIComponent::model() const
{
  QString provider = SettingsComponent::Get().value(SETTINGS_SECTION_AI, "provider").toString().trimmed();
  if (provider == "ollama")
  {
    QString m = SettingsComponent::Get().value(SETTINGS_SECTION_AI, "ollama_model").toString().trimmed();
    return m.isEmpty() ? QStringLiteral("qwen3:8b") : m;
  }
  QString m = SettingsComponent::Get().value(SETTINGS_SECTION_AI, "openai_model").toString().trimmed();
  return m.isEmpty() ? QStringLiteral("gpt-4o-mini") : m;
}

// ---------------------------------------------------------------------------
// Helper: make a chat completion request.
// For Ollama (baseUrl set): uses native /api/chat endpoint with format enforcement.
// For OpenAI (baseUrl empty): uses /v1/chat/completions.
// ---------------------------------------------------------------------------
static QNetworkReply* postChat(QNetworkAccessManager* nam, const QString& key,
                                const QString& mdl, const QJsonArray& messages,
                                int maxTokens = 512,
                                const QString& baseUrl = QString(),
                                const QJsonValue& format = QJsonValue())
{
  QUrl url;
  QJsonObject body;
  body["model"]    = mdl;
  body["messages"] = messages;

  if (baseUrl.isEmpty())
  {
    // OpenAI path
    body["max_completion_tokens"] = maxTokens;
    url = QUrl(QStringLiteral("https://api.openai.com/v1/chat/completions"));
  }
  else
  {
    // Ollama native /api/chat — more reliable format enforcement than /v1/
    body["stream"] = false;
    body["think"]  = false;
    QJsonObject ollamaOptions;
    ollamaOptions["num_ctx"]          = 32768;
    ollamaOptions["num_predict"]      = maxTokens;
    body["options"] = ollamaOptions;
    if (!format.isNull() && !format.isUndefined())
      body["format"] = format;
    QString base = baseUrl.endsWith('/') ? baseUrl.chopped(1) : baseUrl;
    url = QUrl(base + "/api/chat");
  }

  QNetworkRequest req(url);
  req.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
  if (!key.isEmpty())
    req.setRawHeader("Authorization", ("Bearer " + key).toUtf8());
  return nam->post(req, QJsonDocument(body).toJson(QJsonDocument::Compact));
}

// ---------------------------------------------------------------------------
// Helper: extract text content — handles OpenAI (choices[]) and Ollama native (message) formats
// ---------------------------------------------------------------------------
static QString extractContent(const QByteArray& responseData, QString* finishReason = nullptr)
{
  QJsonDocument doc = QJsonDocument::fromJson(responseData);
  if (!doc.isObject()) return {};
  QJsonObject root = doc.object();

  QString text;

  // Ollama native /api/chat response: {"message":{"role":"assistant","content":"..."},"done_reason":"stop"}
  if (root.contains("message") && !root.contains("choices"))
  {
    if (finishReason)
      *finishReason = root["done_reason"].toString();
    QJsonValue contentVal = root["message"].toObject()["content"];
    text = contentVal.isString() ? contentVal.toString().trimmed() : QString();
  }
  else
  {
    // OpenAI /v1/chat/completions response: {"choices":[{"message":{"content":"..."},"finish_reason":"stop"}]}
    QJsonArray choices = root["choices"].toArray();
    if (choices.isEmpty()) return {};
    QJsonObject choice = choices.first().toObject();
    if (finishReason)
      *finishReason = choice["finish_reason"].toString();

    QJsonValue contentVal = choice["message"].toObject()["content"];
    if (contentVal.isString())
      text = contentVal.toString().trimmed();
    else if (contentVal.isArray())
    {
      for (const QJsonValue& part : contentVal.toArray())
        if (part.toObject()["type"].toString() == "text")
          text += part.toObject()["text"].toString();
      text = text.trimmed();
    }
  }

  // Strip Qwen3 <think>...</think> reasoning blocks
  {
    QRegularExpression thinkRe("<think>[\\s\\S]*?</think>",
                               QRegularExpression::CaseInsensitiveOption);
    text.remove(thinkRe);
    text = text.trimmed();
  }
  return text;
}

// ---------------------------------------------------------------------------
// Phase 1 — extractIntent
// ---------------------------------------------------------------------------
void AIComponent::extractIntent(const QString& prompt)
{
  QString provider = SettingsComponent::Get().value(SETTINGS_SECTION_AI, "provider").toString().trimmed();
  bool useOllama   = (provider == "ollama");

  QString key = apiKey();
  if (!useOllama && key.isEmpty())
  {
    emit playlistError("No OpenAI API key configured. Add it in Settings → AI Playlist.");
    return;
  }

  QString baseUrl;
  if (useOllama)
    baseUrl = SettingsComponent::Get().value(SETTINGS_SECTION_AI, "ollama_base_url").toString().trimmed();

  QString systemPrompt =
    "You are a music/media intent parser. Given a user's playlist request, return a JSON object "
    "with exactly these fields:\n"
    "  playlist_name: string — a short creative playlist name (3-6 words, evocative, like a DJ would name it, e.g. \"Midnight Chrome & Neon\", \"Sunday Morning Porch\"). Do NOT use the user's words verbatim.\n"
    "  refined_prompt: string — rewrite the user's request as a vivid 1-2 sentence curator's brief that captures mood, energy and vibe, incorporating any theme hint if provided.\n"
    "  genres: string[] — up to 5 Jellyfin-compatible genre names that best match the request\n"
    "  era: [number, number] | null — year range [start, end], or null if not specified\n"
    "  mood: string — 2-4 word mood description (e.g. \"relaxed and dreamy\")\n"
    "  energy: \"low\" | \"medium\" | \"high\"\n"
    "  bpm_category: \"very_slow\" | \"slow\" | \"moderate\" | \"fast\" | \"very_fast\" | \"any\"\n"
    "Return ONLY the JSON object. No markdown fences, no explanation.";

  QJsonObject sysMsg, userMsg;
  sysMsg["role"]    = QString("system");
  sysMsg["content"] = systemPrompt;
  userMsg["role"]    = QString("user");
  userMsg["content"] = prompt;

  qDebug() << "AIComponent: extractIntent provider=" << provider << "prompt:" << prompt;

  QJsonObject intentFormat;
  intentFormat["type"] = QString("object");

  QNetworkReply* reply = postChat(m_nam, key, model(),
                                     QJsonArray{ sysMsg, userMsg }, 768, baseUrl,
                                     intentFormat);

  connect(reply, &QNetworkReply::finished, this, [this, reply]()
  {
    reply->deleteLater();
    QByteArray data = reply->readAll();

    if (reply->error() != QNetworkReply::NoError)
    {
      QString detail;
      QJsonDocument errDoc = QJsonDocument::fromJson(data);
      if (errDoc.isObject())
        detail = errDoc.object()["error"].toObject()["message"].toString();
      if (detail.isEmpty()) detail = reply->errorString();
      emit playlistError("AI error (intent): " + detail);
      return;
    }

    qDebug() << "AIComponent intent response:" << QString::fromUtf8(data.left(500));

    QString content = extractContent(data);
    if (content.isEmpty())
    {
      emit playlistError("AI returned empty intent. Try rephrasing your request.");
      return;
    }

    // Strip markdown fences just in case
    if (content.startsWith("```"))
    {
      int nl = content.indexOf('\n');
      content = (nl != -1) ? content.mid(nl + 1) : content.mid(3);
      int end = content.lastIndexOf("```");
      if (end != -1) content = content.left(end).trimmed();
    }

    // Extract JSON object even if model added preamble text
    {
      int objStart = content.indexOf('{');
      int objEnd   = content.lastIndexOf('}');
      if (objStart != -1 && objEnd != -1 && objEnd > objStart)
        content = content.mid(objStart, objEnd - objStart + 1).trimmed();
    }

    // Validate it's parseable JSON
    QJsonDocument parsed = QJsonDocument::fromJson(content.toUtf8());
    if (!parsed.isObject())
    {
      emit playlistError("AI returned invalid intent JSON: " + content.left(100));
      return;
    }

    qDebug() << "AIComponent: intent extracted:" << content;
    emit intentReady(content);
  });
}

// ---------------------------------------------------------------------------
// Phase 2 — buildPlaylist
// ---------------------------------------------------------------------------
void AIComponent::buildPlaylist(const QString& prompt, const QString& itemsJson,
                                 const QString& intentJson, int targetCount)
{
  QString provider = SettingsComponent::Get().value(SETTINGS_SECTION_AI, "provider").toString().trimmed();
  bool useOllama   = (provider == "ollama");

  QString key = apiKey();
  if (!useOllama && key.isEmpty())
  {
    emit playlistError("No OpenAI API key configured. Add it in Settings → AI Playlist.");
    return;
  }

  QString baseUrl;
  if (useOllama)
    baseUrl = SettingsComponent::Get().value(SETTINGS_SECTION_AI, "ollama_base_url").toString().trimmed();

  if (targetCount <= 0) targetCount = 20;

  QJsonDocument itemsDoc = QJsonDocument::fromJson(itemsJson.toUtf8());
  QJsonArray items = itemsDoc.array();

  // Parse intent for richer system prompt
  QJsonObject intent = QJsonDocument::fromJson(intentJson.toUtf8()).object();
  QString mood          = intent["mood"].toString();
  QString energy        = intent["energy"].toString();
  QString bpmCategory   = intent["bpm_category"].toString();
  // Use refined_prompt if available (AI-reworded), else fall back to description or raw prompt
  QString curatorBrief  = intent["refined_prompt"].toString();
  if (curatorBrief.isEmpty()) curatorBrief = intent["description"].toString();
  if (curatorBrief.isEmpty()) curatorBrief = prompt;

  // BPM category → rough BPM guidance for the AI
  QString bpmHint;
  if      (bpmCategory == "very_slow") bpmHint = "very slow (< 70 BPM)";
  else if (bpmCategory == "slow")      bpmHint = "slow (70-90 BPM)";
  else if (bpmCategory == "moderate")  bpmHint = "moderate (90-120 BPM)";
  else if (bpmCategory == "fast")      bpmHint = "fast (120-150 BPM)";
  else if (bpmCategory == "very_fast") bpmHint = "very fast (150+ BPM)";

  // Randomly shuffle to get a diverse sample but cap at maxItems
  const int totalItems = items.size();
  QVector<int> indices(totalItems);
  std::iota(indices.begin(), indices.end(), 0);
  std::shuffle(indices.begin(), indices.end(), std::mt19937{std::random_device{}()});

  // Ollama local models handle smaller tables much more reliably
  const int maxItems = useOllama ? 120 : 350;
  QVector<QString> idMap;
  QStringList itemLines;
  int count = 0;

  for (int rawIdx : indices)
  {
    if (count >= maxItems) break;
    QJsonObject item = items[rawIdx].toObject();
    QString id = item["Id"].toString();
    if (id.isEmpty()) continue;

    QString name = item["Name"].toString();
    QString type = item["Type"].toString();
    QString year = item["ProductionYear"].toVariant().toString();

    QStringList genres;
    for (const QJsonValue& g : item["Genres"].toArray())
      genres << g.toString();

    QStringList artists;
    for (const QJsonValue& a : item["Artists"].toArray())
      artists << a.toString();
    if (artists.isEmpty() && !item["AlbumArtist"].toString().isEmpty())
      artists << item["AlbumArtist"].toString();

    // Extract BPM from Tags if present
    QString bpm = "-";
    QJsonObject tags = item["Tags"].toObject();
    if (!tags.isEmpty())
    {
      // Tag keys vary: "BPM", "bpm", "TBPM", "tbpm"
      for (const QString& k : {"BPM", "bpm", "TBPM", "tbpm"})
      {
        if (tags.contains(k))
        {
          bpm = tags[k].toVariant().toString();
          break;
        }
      }
    }
    // Also check TagItems array (Jellyfin ≥ 10.9 may use this)
    if (bpm == "-")
    {
      for (const QJsonValue& t : item["TagItems"].toArray())
      {
        QString k = t.toObject()["Name"].toString().toUpper();
        if (k == "BPM" || k == "TBPM")
        {
          bpm = t.toObject()["Value"].toString();
          break;
        }
      }
    }

    idMap.append(id);
    itemLines << QString("| %1 | %2 | %3 | %4 | %5 | %6 | %7 |")
                    .arg(count)
                    .arg(name, artists.isEmpty() ? "-" : artists.join(", "),
                         year.isEmpty() ? "-" : year,
                         genres.isEmpty() ? "-" : genres.join(", "),
                         bpm,
                         type);
    count++;
  }

  QString table = "| # | Name | Artist | Year | Genres | BPM | Type |\n"
                  "|---|------|--------|------|--------|-----|------|\n" +
                  itemLines.join("\n");

  // Build a rich, mood-aware system prompt
  QString systemPrompt = QString(
    "You are an expert music curator and DJ. You understand mood, energy, musical flow, and BPM.\n\n"
    "Curator's brief:\n  %1\n\n"
    "Mood: %2 | Energy: %3%4\n\n"
    "From the numbered track list below, select exactly %5 tracks that best match this brief. "
    "Order them to create a great listening experience with good energy arc and smooth transitions.\n"
    "Prefer tracks whose BPM matches the target tempo. When BPM is '-', use genre knowledge.\n\n"
    "Return ONLY a JSON array of # index integers. Example: [4,12,7,...]\n"
    "No explanation, no markdown, just the array."
  ).arg(curatorBrief,
        mood.isEmpty() ? "not specified" : mood,
        energy.isEmpty() ? "medium" : energy,
        bpmHint.isEmpty() ? "" : QString(" | Tempo: %1").arg(bpmHint),
        QString::number(targetCount));

  QString userMessage = QString("Request: %1\n\n## Available Tracks (%2 items)\n\n%3")
                          .arg(prompt).arg(itemLines.size()).arg(table);

  QJsonObject sysMsg, userMsg;
  sysMsg["role"]    = QString("system");
  sysMsg["content"] = systemPrompt;
  userMsg["role"]    = QString("user");
  userMsg["content"] = userMessage;

  qDebug() << "AIComponent: buildPlaylist provider=" << provider << "model=" << model()
           << "total=" << totalItems << "sampled=" << itemLines.size()
           << "target=" << targetCount
           << "payload~=" << userMessage.size() << "bytes";

  QJsonObject playlistItemsFormat;
  playlistItemsFormat["type"] = QString("integer");
  QJsonObject playlistFormat;
  playlistFormat["type"]  = QString("array");
  playlistFormat["items"] = playlistItemsFormat;

  QNetworkReply* reply = postChat(m_nam, key, model(),
                                     QJsonArray{ sysMsg, userMsg }, 4096, baseUrl,
                                     playlistFormat);

  connect(reply, &QNetworkReply::finished, this, [this, reply, idMap, targetCount]()
  {
    reply->deleteLater();
    QByteArray data = reply->readAll();

    if (reply->error() != QNetworkReply::NoError)
    {
      QString detail;
      QJsonDocument errDoc = QJsonDocument::fromJson(data);
      if (errDoc.isObject())
        detail = errDoc.object()["error"].toObject()["message"].toString();
      if (detail.isEmpty()) detail = reply->errorString();
      emit playlistError("AI error: " + detail);
      return;
    }

    qDebug() << "AIComponent buildPlaylist raw response:" << QString::fromUtf8(data.left(1000));

    if (QJsonDocument::fromJson(data).object().contains("error"))
    {
      emit playlistError("AI error: " +
        QJsonDocument::fromJson(data).object()["error"].toObject()["message"].toString());
      return;
    }

    QString finishReason;
    QString content = extractContent(data, &finishReason);
    qDebug() << "AIComponent finish_reason=" << finishReason << "content length=" << content.size();

    if (content.isEmpty())
    {
      emit playlistError(
        QString("AI response was empty (finish_reason: %1). "
                "Try a shorter playlist or switching to a larger model.")
          .arg(finishReason));
      return;
    }

    // Strip Qwen3 <think>...</think> reasoning blocks
    {
      QRegularExpression thinkRe("<think>[\\s\\S]*?</think>",
                                 QRegularExpression::CaseInsensitiveOption);
      content.remove(thinkRe);
      content = content.trimmed();
    }

    // Strip markdown fences
    if (content.startsWith("```"))
    {
      int nl = content.indexOf('\n');
      content = (nl != -1) ? content.mid(nl + 1) : content.mid(3);
      int end = content.lastIndexOf("```");
      if (end != -1) content = content.left(end).trimmed();
    }

    // If the model added preamble text before the JSON array, extract just the array
    {
      int arrStart = content.indexOf('[');
      int arrEnd   = content.lastIndexOf(']');
      if (arrStart != -1 && arrEnd != -1 && arrEnd > arrStart)
        content = content.mid(arrStart, arrEnd - arrStart + 1).trimmed();
    }

    // If the model was cut off mid-array (finish_reason: length), try to salvage
    // the partial response by closing the JSON array.
    QJsonDocument parsed = QJsonDocument::fromJson(content.toUtf8());
    if (!parsed.isArray() && finishReason == "length" && content.contains('['))
    {
      // Trim to last complete number (drop anything after the last comma or digit)
      QString salvaged = content;
      // Remove trailing incomplete token (e.g. "..., 42," or "..., 4")
      int lastComma = salvaged.lastIndexOf(',');
      int lastDigit = -1;
      for (int i = salvaged.size() - 1; i >= 0; --i)
      {
        if (salvaged[i].isDigit()) { lastDigit = i; break; }
      }
      // If there's a comma after the last complete number, trim to before it
      if (lastComma > lastDigit)
        salvaged = salvaged.left(lastComma);
      salvaged = salvaged.trimmed();
      if (!salvaged.endsWith(']'))
        salvaged += ']';
      parsed = QJsonDocument::fromJson(salvaged.toUtf8());
      if (parsed.isArray())
        qDebug() << "AIComponent: salvaged truncated response, items=" << parsed.array().size();
    }

    if (!parsed.isArray())
    {
      emit playlistError("Unexpected AI response format: " + content.left(120));
      return;
    }

    QStringList ids;
    for (const QJsonValue& v : parsed.array())
    {
      int idx = v.toInt(-1);
      if (idx >= 0 && idx < idMap.size())
        ids << idMap[idx];
    }

    if (ids.isEmpty())
    {
      emit playlistError("AI returned no valid items. Try a different prompt.");
      return;
    }

    emit playlistReady(ids);
  });
}

// ---------------------------------------------------------------------------
// YouTube import helper — judgeTrackMatch
// ---------------------------------------------------------------------------
void AIComponent::judgeTrackMatch(const QString& trackJson, const QString& candidatesJson)
{
  QString provider = SettingsComponent::Get().value(SETTINGS_SECTION_AI, "provider").toString().trimmed();
  bool useOllama   = (provider == "ollama");

  QString key = apiKey();
  if (!useOllama && key.isEmpty())
  {
    emit trackMatchError("No OpenAI API key configured. Add it in Settings → AI Playlist.");
    return;
  }

  QString baseUrl;
  if (useOllama)
    baseUrl = SettingsComponent::Get().value(SETTINGS_SECTION_AI, "ollama_base_url").toString().trimmed();

  QJsonDocument trackDoc = QJsonDocument::fromJson(trackJson.toUtf8());
  QJsonDocument candidatesDoc = QJsonDocument::fromJson(candidatesJson.toUtf8());
  if (!trackDoc.isObject() || !candidatesDoc.isArray())
  {
    emit trackMatchError("Invalid track match payload.");
    return;
  }

  QString systemPrompt =
    "You are matching a YouTube playlist entry to tracks in a Jellyfin music library.\n"
    "Decide whether exactly one candidate is the same song/recording as the YouTube entry.\n"
    "Be tolerant of punctuation, casing, \"official video\", \"lyrics\", \"audio\", \"remaster\", "
    "explicit/clean tags, channel names, VEVO/Topic suffixes, and featured-artist wording.\n"
    "Use artist evidence when available, but do not reject a strong title match only because "
    "YouTube used a channel/uploader name.\n"
    "Reject different songs, covers, karaoke, tribute versions, live versions, remixes, sped-up/slowed, "
    "and unrelated same-title songs unless the YouTube title clearly asks for that version.\n"
    "Return ONLY JSON with exactly these fields: "
    "{\"match\": boolean, \"index\": number|null, \"confidence\": number, \"reason\": string}. "
    "The index is the candidate index from the supplied list. Use match=false if confidence is below 0.72.";

  QJsonObject sysMsg, userMsg;
  sysMsg["role"]    = QString("system");
  sysMsg["content"] = systemPrompt;

  QString userContent = "YouTube track:\n" +
                        QString::fromUtf8(QJsonDocument(trackDoc.object()).toJson(QJsonDocument::Indented)) +
                        "\n\nJellyfin candidates:\n" +
                        QString::fromUtf8(QJsonDocument(candidatesDoc.array()).toJson(QJsonDocument::Indented));
  userMsg["role"]    = QString("user");
  userMsg["content"] = userContent;

  QJsonObject resultFormat;
  resultFormat["type"] = QString("object");

  QNetworkReply* reply = postChat(m_nam, key, model(),
                                  QJsonArray{ sysMsg, userMsg }, 512, baseUrl,
                                  resultFormat);

  connect(reply, &QNetworkReply::finished, this, [this, reply]()
  {
    reply->deleteLater();
    QByteArray data = reply->readAll();

    if (reply->error() != QNetworkReply::NoError)
    {
      QString detail;
      QJsonDocument errDoc = QJsonDocument::fromJson(data);
      if (errDoc.isObject())
        detail = errDoc.object()["error"].toObject()["message"].toString();
      if (detail.isEmpty()) detail = reply->errorString();
      emit trackMatchError("AI match error: " + detail);
      return;
    }

    if (QJsonDocument::fromJson(data).object().contains("error"))
    {
      emit trackMatchError("AI match error: " +
        QJsonDocument::fromJson(data).object()["error"].toObject()["message"].toString());
      return;
    }

    QString content = extractContent(data);
    if (content.startsWith("```"))
    {
      int nl = content.indexOf('\n');
      content = (nl != -1) ? content.mid(nl + 1) : content.mid(3);
      int end = content.lastIndexOf("```");
      if (end != -1) content = content.left(end).trimmed();
    }

    int objStart = content.indexOf('{');
    int objEnd   = content.lastIndexOf('}');
    if (objStart != -1 && objEnd != -1 && objEnd > objStart)
      content = content.mid(objStart, objEnd - objStart + 1).trimmed();

    QJsonDocument parsed = QJsonDocument::fromJson(content.toUtf8());
    if (!parsed.isObject())
    {
      emit trackMatchError("AI returned invalid match JSON: " + content.left(100));
      return;
    }

    emit trackMatchReady(QString::fromUtf8(parsed.toJson(QJsonDocument::Compact)));
  });
}
