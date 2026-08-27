//
// Created by haoli on 2025/7/3.
//

#ifndef TRAININGOPTIMIZER_DBTRAININGPAIRINGSEPARATIONREQUIREMENT_H
#define TRAININGOPTIMIZER_DBTRAININGPAIRINGSEPARATIONREQUIREMENT_H


class DBTrainingPairingSeparationRequirement {
public:
    DBTrainingPairingSeparationRequirement(long long id, long long pairingId, unsigned int separatedPairingIndex,
                                           bool isTrainingPairing) :
            _id(id), _pairingId(pairingId), _separatedPairingIndex(separatedPairingIndex),
            _isTrainingPairing(isTrainingPairing) {}

    const long long GetId() const { return _id; }

    void SetId(long long id) { _id = id; }

    const long long GetPairingId() const { return _pairingId; }

    void SetPairingId(long long pairingId) { _pairingId = pairingId; }

    const unsigned int GetSeparatedPairingIndex() const { return _separatedPairingIndex; }

    void
    SetSeparatedPairingIndex(unsigned int separatedPairingIndex) { _separatedPairingIndex = separatedPairingIndex; }

    const bool IsTrainingPairing() const { return _isTrainingPairing; }

    void SetIsTrainingPairing(bool op) { _isTrainingPairing = op; }

private:
    long long _id;
    long long _pairingId;
    unsigned int _separatedPairingIndex;
    bool _isTrainingPairing;
};


#endif //TRAININGOPTIMIZER_DBTRAININGPAIRINGSEPARATIONREQUIREMENT_H
