#ifndef AICOMPONENT_H
#define AICOMPONENT_H

#include <QObject>
#include <QNetworkAccessManager>
#include "core/ComponentManager.h"

class AIComponent : public ComponentBase
{
  Q_OBJECT
  DEFINE_SINGLETON(AIComponent);

public:
  const char* componentName() override { return "ai"; }
  bool componentExport() override { return true; }
  bool componentInitialize() override;

  // Phase 1: parse prompt into structured intent (genres, mood, energy, bpm_category, era).
  // Emits intentReady(json) or playlistError on failure.
  Q_INVOKABLE void extractIntent(const QString& prompt);

  // Phase 2: select + order songs from the pre-filtered library.
  // intentJson: JSON string from extractIntent. targetCount: desired playlist length.
  Q_INVOKABLE void buildPlaylist(const QString& prompt, const QString& itemsJson,
                                  const QString& intentJson, int targetCount);

  // Judge whether a YouTube playlist entry matches one of several Jellyfin candidates.
  // Emits trackMatchReady(json) or trackMatchError on failure.
  Q_INVOKABLE void judgeTrackMatch(const QString& trackJson, const QString& candidatesJson);

Q_SIGNALS:
  void intentReady(const QString& intentJson);
  void playlistReady(const QStringList& itemIds);
  void playlistError(const QString& error);
  void trackMatchReady(const QString& resultJson);
  void trackMatchError(const QString& error);

private:
  explicit AIComponent(QObject* parent = nullptr);
  QString apiKey() const;
  QString model() const;
  QNetworkAccessManager* m_nam;
};

#endif // AICOMPONENT_H
