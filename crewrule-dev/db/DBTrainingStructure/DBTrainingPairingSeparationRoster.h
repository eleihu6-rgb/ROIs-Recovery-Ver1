//
// Created by haoli on 2025/7/3.
//

#ifndef TRAININGOPTIMIZER_DBTRAININGPAIRINGSEPARATIONROSTER_H
#define TRAININGOPTIMIZER_DBTRAININGPAIRINGSEPARATIONROSTER_H


class DBTrainingPairingSeparationRoster {
public:
    DBTrainingPairingSeparationRoster(long long separatedPairingId, long long rosterId) :
            _separatedPairingId(separatedPairingId), _rosterId(rosterId) {}

    const long long GetSeparatedPairingId() const { return _separatedPairingId; }

    void SetSeparatedPairingId(long long separatedPairingId) { _separatedPairingId = separatedPairingId; }

    const long long GetRosterId() const { return _rosterId; }

    void SetRosterId(long long rosterId) { _rosterId = rosterId; }

private:
    long long _separatedPairingId;
    long long _rosterId;
};


#endif //TRAININGOPTIMIZER_DBTRAININGPAIRINGSEPARATIONROSTER_H
