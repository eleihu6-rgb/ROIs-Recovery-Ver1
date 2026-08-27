//
// Created by Codex on 2026/4/10.
//

#ifndef TRAININGOPTIMIZER_DBTRAININGPAIRINGCHART_H
#define TRAININGOPTIMIZER_DBTRAININGPAIRINGCHART_H

#include <ctime>
#include <string>
#include <vector>

class DBTrainingPairingChart {
public:
    DBTrainingPairingChart(long long id, int buddyNumber, time_t effectiveTime, time_t expiryTime,
                           const std::vector<std::string> &traineeRanks,
                           const std::vector<std::vector<std::string>> &buddyRanks,
                           int durationMinutes) :
            _id(id),
            _buddyNumber(buddyNumber),
            _effectiveTime(effectiveTime),
            _expiryTime(expiryTime),
            _traineeRanks(traineeRanks),
            _buddyRanks(buddyRanks),
            _durationMinutes(durationMinutes) {}

    [[nodiscard]] long long GetId() const { return _id; }

    void SetId(long long id) { _id = id; }

    [[nodiscard]] int GetBuddyNumber() const { return _buddyNumber; }

    void SetBuddyNumber(int buddyNumber) { _buddyNumber = buddyNumber; }

    [[nodiscard]] time_t GetEffectiveTime() const { return _effectiveTime; }

    void SetEffectiveTime(time_t effectiveTime) { _effectiveTime = effectiveTime; }

    [[nodiscard]] time_t GetExpiryTime() const { return _expiryTime; }

    void SetExpiryTime(time_t expiryTime) { _expiryTime = expiryTime; }

    [[nodiscard]] const std::vector<std::string> &GetTraineeRanks() const { return _traineeRanks; }

    void SetTraineeRanks(const std::vector<std::string> &traineeRanks) { _traineeRanks = traineeRanks; }

    [[nodiscard]] const std::vector<std::vector<std::string>> &GetBuddyRanks() const { return _buddyRanks; }

    void SetBuddyRanks(const std::vector<std::vector<std::string>> &buddyRanks) { _buddyRanks = buddyRanks; }

    [[nodiscard]] int GetDurationMinutes() const { return _durationMinutes; }

    void SetDurationMinutes(int durationMinutes) { _durationMinutes = durationMinutes; }

private:
    long long _id{0};
    int _buddyNumber{0};
    time_t _effectiveTime{0};
    time_t _expiryTime{0};
    std::vector<std::string> _traineeRanks;
    std::vector<std::vector<std::string>> _buddyRanks;
    int _durationMinutes{0};
};

#endif //TRAININGOPTIMIZER_DBTRAININGPAIRINGCHART_H
